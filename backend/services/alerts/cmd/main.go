package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"

	"github.com/gridsense-ai/alerts/internal/config"
	"github.com/gridsense-ai/alerts/internal/events"
)

func main() {
	// Initialize high-performance structured logger
	logger, err := zap.NewProduction()
	if err != nil {
		log.Fatalf("failed to initialize zap logger: %v", err)
	}
	// Flushes buffer, if any, before application exit
	defer logger.Sync()

	// Load and validate environment configuration
	cfg, err := config.Load()
	if err != nil {
		logger.Fatal("Configuration load failed", zap.Error(err))
	}

	// Establish root application context hooked to OS interrupt signals for graceful shutdown
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()

	// Parse Upstash Redis URL and initialize connection
	redisOptions, err := redis.ParseURL(cfg.RedisURL)
	if err != nil {
		logger.Fatal("Invalid Redis URL", zap.Error(err))
	}
	redisClient := redis.NewClient(redisOptions)
	defer redisClient.Close()

	// Verify broker connection before proceeding
	if err := redisClient.Ping(ctx).Err(); err != nil {
		logger.Fatal("Redis connection failed", zap.Error(err))
	}

	// Phase 1.1: Idempotently provision streams and consumer groups
	provisioner := events.NewProvisioner(redisClient, logger)
	if err := provisioner.Initialize(ctx, cfg); err != nil {
		logger.Fatal("Stream provisioning failed", zap.Error(err))
	}

	// Phase 1.2: Initialize Watermill Publisher
	pub, err := events.NewPublisher(redisClient, logger)
	if err != nil {
		logger.Fatal("Publisher initialization failed", zap.Error(err))
	}
	defer pub.Close()

	// Phase 1.2: Initialize Watermill Subscriber
	sub, err := events.NewSubscriber(redisClient, logger, cfg.ConsumerGroup)
	if err != nil {
		logger.Fatal("Subscriber initialization failed", zap.Error(err))
	}
	defer sub.Close()

	// Phase 1.2: Initialize Router Pipeline
	// TODO: Implement Evaluator interface for rule and severity evaluation (Phase 4)
	router, err := events.NewRouter(logger, pub, cfg, nil)
	if err != nil {
		logger.Fatal("Router initialization failed", zap.Error(err))
	}

	// Execute the routing engine. This blocks until the context is canceled via OS signal.
	if err := router.Run(ctx); err != nil {
		logger.Fatal("Event router terminated with error", zap.Error(err))
	}

	logger.Info("Alert microservice shutdown cleanly")
}
