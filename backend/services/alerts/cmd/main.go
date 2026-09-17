package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/ThreeDotsLabs/watermill/message"
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"

	"github.com/gridsense-ai/alerts/internal/api"
	"github.com/gridsense-ai/alerts/internal/config"
	"github.com/gridsense-ai/alerts/internal/dispatcher"
	"github.com/gridsense-ai/alerts/internal/evaluator"
	"github.com/gridsense-ai/alerts/internal/events"
	"github.com/gridsense-ai/alerts/internal/repository"
	"github.com/gridsense-ai/alerts/internal/throttle"
)

func main() {
	// Initialize high-performance structured logger
	logger, err := zap.NewProduction()
	if err != nil {
		log.Fatalf("failed to initialize zap logger: %v", err)
	}
	// Flushes buffer, if any, before application exit
	defer logger.Sync()

	// Load .env file into the OS environment before parsing configuration
	if err := godotenv.Load(); err != nil {
		logger.Info("No .env file found; falling back to system environment variables")
	}

	// Load and validate environment configuration
	cfg, err := config.Load()
	if err != nil {
		logger.Fatal("Configuration load failed", zap.Error(err))
	}

	// Establish root application context hooked to OS interrupt signals for graceful shutdown
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()

	// 1. Initialize Upstash Redis
	redisOptions, err := redis.ParseURL(cfg.RedisURL)
	if err != nil {
		logger.Fatal("Invalid Redis URL", zap.Error(err))
	}
	redisClient := redis.NewClient(redisOptions)
	defer redisClient.Close()

	if err := redisClient.Ping(ctx).Err(); err != nil {
		logger.Fatal("Redis connection failed", zap.Error(err))
	}

	// 2. Initialize Supabase PostgreSQL Pool
	dbPool, err := pgxpool.New(ctx, cfg.DatabaseURL)
	if err != nil {
		logger.Fatal("Failed to connect to PostgreSQL", zap.Error(err))
	}
	defer dbPool.Close()

	if err := dbPool.Ping(ctx); err != nil {
		logger.Fatal("PostgreSQL ping failed", zap.Error(err))
	}

	// 3. Initialize Repositories and State Management
	repo := repository.NewAlertRepository(dbPool)
	limiter := throttle.NewRedisLimiter(redisClient)

	// 4. Initialize Multi-Channel Dispatchers
	sseHub := dispatcher.NewSSEHub(logger)
	go sseHub.Run(ctx) // Start hub broadcast loop in the background

	// novuClient := dispatcher.NewNovuClient(cfg.NovuAPIKey, logger)

	// 5. Initialize Rule Engine (Evaluator)
	ruleEngine := evaluator.NewRuleEngine(repo, limiter, logger)

	// 6. Initialize HTTP API & Router (Chi)
	alertController := api.NewAlertController(repo, sseHub, logger)
	chiRouter := chi.NewRouter()
	api.RegisterRoutes(chiRouter, alertController, cfg.InternalServiceKey, logger)

	srv := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      chiRouter,
		ReadTimeout:  5 * time.Second,
		WriteTimeout: 10 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	// Start HTTP Server in a separate goroutine
	go func() {
		logger.Info("Starting HTTP server", zap.String("port", cfg.Port))
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			logger.Fatal("HTTP server error", zap.Error(err))
		}
	}()

	// 7. Phase 1.1: Idempotently provision streams and consumer groups
	provisioner := events.NewProvisioner(redisClient, logger)
	if err := provisioner.Initialize(ctx, cfg); err != nil {
		logger.Fatal("Stream provisioning failed", zap.Error(err))
	}

	// Phase 1.2: Initialize Watermill Publisher & Subscriber
	pub, err := events.NewPublisher(redisClient, logger)
	if err != nil {
		logger.Fatal("Publisher initialization failed", zap.Error(err))
	}
	defer pub.Close()

	sub, err := events.NewSubscriber(redisClient, logger, cfg.ConsumerGroup)
	if err != nil {
		logger.Fatal("Subscriber initialization failed", zap.Error(err))
	}
	defer sub.Close()

	// Initialize Router Pipeline with the active rule engine
	router, err := events.NewRouter(logger, pub, cfg, ruleEngine)
	if err != nil {
		logger.Fatal("Router initialization failed", zap.Error(err))
	}

	// Bind the event processing logic to the Redis stream before running
	// Note: Wrapped the handler inline to satisfy Watermill's required signature without modifying router.go
	router.RegisterHandler("main_alert_consumer", cfg.AlertStreamName, pub, sub, func(msg *message.Message) ([]*message.Message, error) {
		return nil, router.ProcessEvent(msg)
	})

	// Execute the routing engine. This blocks until the context is canceled via OS signal.
	if err := router.Run(ctx); err != nil {
		logger.Fatal("Event router terminated with error", zap.Error(err))
	}

	// 8. Graceful Shutdown Execution
	logger.Info("Shutdown signal received, draining active requests...")
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		logger.Error("HTTP server forced shutdown", zap.Error(err))
	}

	logger.Info("Alert microservice shutdown cleanly")
}