package main

import (
	"context"
	"errors"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/prometheus/client_golang/prometheus/promhttp"
	"github.com/redis/go-redis/v9"
	"go.opentelemetry.io/contrib/instrumentation/google.golang.org/grpc/otelgrpc"
	"google.golang.org/grpc"

	"gateway/bridge"
	"gateway/database"
	"gateway/handlers"
	"gateway/internal/config"
	grpcserver "gateway/internal/grpc"
	"gateway/middleware"
	pb "gridsense-ai/backend/services/dashboard-bff/proto/gen/gateway/v1/proto"
)

func main() {
	// 1. Load configuration (fail-fast if missing critical vars)
	cfg := config.LoadConfig()
	log.Printf("Starting API Gateway on port %s...", cfg.GatewayPort)

	// Context for initialization
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// 2. Initialize Database Pool
	db, err := database.InitPool(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("FATAL: Could not initialize database pool: %v", err)
	}
	defer db.Close()
	log.Println("Database connection pool established successfully.")

	// 3. Initialize Redis Client (for BroadcastAnomaly pub/sub)
	redisURL := os.Getenv("REDIS_URL")
	if redisURL == "" {
		log.Fatalf("CRITICAL CONFIGURATION ERROR: Environment variable REDIS_URL is missing or empty.")
	}
	redisOpts, err := redis.ParseURL(redisURL)
	if err != nil {
		log.Fatalf("FATAL: Could not parse Redis URL: %v", err)
	}
	redisClient := redis.NewClient(redisOpts)
	redisPingCtx, redisPingCancel := context.WithTimeout(ctx, 5*time.Second)
	defer redisPingCancel()
	if err := redisClient.Ping(redisPingCtx).Err(); err != nil {
		log.Fatalf("FATAL: Redis readiness ping failed: %v", err)
	}
	defer redisClient.Close()
	log.Println("Redis connection established successfully.")

	// 4. Initialize Internal Clients
	engineAClient := bridge.NewEngineAClient(cfg.EngineAURL, cfg.InternalServiceKey)

	// Engine B (outage-risk prediction) config & client
	engineBConfig := handlers.LoadConfig()
	engineBClient := handlers.NewEngineBClient(engineBConfig)

	// Engine C (multivariate anomaly detection) config & client
	engineCConfig := handlers.LoadEngineCConfig()
	engineCClient := handlers.NewEngineCClient(engineCConfig)

	// Engine D (Prioritization) config & client
	engineDConfig := handlers.LoadEngineDConfig()
	engineDClient := handlers.NewEngineDClient(engineDConfig)

	// AI Assistant config & client (key is required: no insecure fallback)
	assistantURL := os.Getenv("ASSISTANT_SERVICE_URL")
	if assistantURL == "" {
		assistantURL = "http://localhost:8000"
	}
	assistantKey := requireEnv("ASSISTANT_INTERNAL_KEY")
	assistantClient := bridge.NewAssistantClient(assistantURL, assistantKey)

	// Alert Microservice config & client
	alertURL := os.Getenv("ALERT_SERVICE_URL")
	if alertURL == "" {
		alertURL = "http://localhost:8001"
	}
	// NOTE: cfg.AlertInternalKey must be added to config.LoadConfig (reads
	// ALERT_INTERNAL_KEY and fails fast when missing). This file will not compile until it is.
	alertKey := cfg.AlertInternalKey
	alertClient := bridge.NewAlertBridgeClient(alertURL, alertKey)

	// 5. Initialize Handlers and Repositories
	reliabilityHandler := handlers.NewReliabilityHandler(db, engineAClient)
	healthHandler := handlers.NewHealthHandler(db) // Registered health handler

	telemetryRepo := handlers.NewSQLTelemetryRepo(db)
	predictionHandler := handlers.NewPredictionHandler(telemetryRepo, engineBClient)

	// Initialize Engine C specific repositories and handler
	anomalyRepo := handlers.NewSQLAnomalyRepo(db)
	anomalyHandler := handlers.NewAnomalyHandler(anomalyRepo, engineCClient)

	// Initialize Engine D specific repositories and handler
	prioritizationRepo := handlers.NewSQLPrioritizationRepo(db)
	prioritizationHandler := handlers.NewPrioritizationHandler(prioritizationRepo, engineDClient, nil)

	// Initialize AI Assistant specific repositories and handler
	assistantAuditRepo := handlers.NewSQLAssistantAuditRepo(db)
	assistantHandler := handlers.NewAssistantHandler(assistantAuditRepo, assistantClient)

	// Initialize Alert specific handler
	alertHandler, err := handlers.NewAlertHandler(alertClient, alertURL, alertKey)
	if err != nil {
		log.Fatalf("FATAL: Could not initialize Alert handler: %v", err)
	}

	// 6. Setup Router (ServeMux) and apply Middleware
	mux := http.NewServeMux()

	// Public Health Probe (Unauthenticated)
	mux.Handle("/healthz", enableCORS(http.HandlerFunc(healthHandler.HealthCheck)))

	// Wrap the endpoint with the JWT Authentication Middleware
	authProtectedReliability := middleware.RequireAuth(cfg.JWTSecret)(http.HandlerFunc(reliabilityHandler.Evaluate))
	mux.Handle("/api/v1/reliability/evaluate", enableCORS(authProtectedReliability))

	// Engine B outage-risk prediction, same auth pattern as reliability.
	authProtectedPrediction := middleware.RequireAuth(cfg.JWTSecret)(http.HandlerFunc(predictionHandler.ExecuteInference))
	mux.Handle("/api/v1/prediction/evaluate", enableCORS(authProtectedPrediction))

	// Engine C anomaly detection, mounted with JWT auth and CORS
	authProtectedAnomaly := middleware.RequireAuth(cfg.JWTSecret)(http.HandlerFunc(anomalyHandler.DetectAnomaly))
	mux.Handle("/api/v1/anomaly/detect", enableCORS(authProtectedAnomaly))

	// Engine D prioritization ranking, mounted with JWT auth and CORS
	authProtectedPrioritization := middleware.RequireAuth(cfg.JWTSecret)(http.HandlerFunc(prioritizationHandler.RankInterventions))
	mux.Handle("/api/v1/priorities/rank", enableCORS(authProtectedPrioritization))

	// AI Assistant conversational query, mounted with JWT auth and CORS
	authProtectedAssistant := middleware.RequireAuth(cfg.JWTSecret)(http.HandlerFunc(assistantHandler.HandleQuery))
	mux.Handle("/api/v1/assistant/query", enableCORS(authProtectedAssistant))

	// Alert Microservice routes, mounted with JWT auth and CORS
	authProtectedAlertFetch := middleware.RequireAuth(cfg.JWTSecret)(http.HandlerFunc(alertHandler.FetchActive))
	mux.Handle("/api/v1/alerts/active", enableCORS(authProtectedAlertFetch))

	authProtectedAlertAck := middleware.RequireAuth(cfg.JWTSecret)(http.HandlerFunc(alertHandler.Acknowledge))
	mux.Handle("/api/v1/alerts/{id}/ack", enableCORS(authProtectedAlertAck))

	authProtectedAlertStream := middleware.RequireAuth(cfg.JWTSecret)(http.HandlerFunc(alertHandler.StreamSSE))
	mux.Handle("/api/v1/alerts/stream", enableCORS(authProtectedAlertStream))

	// 7. Configure the HTTP Server with strict timeouts to prevent resource exhaustion (Slowloris attacks)
	// WriteTimeout increased to accommodate potentially slow LLM responses
	srv := &http.Server{
		Addr:         ":" + cfg.GatewayPort,
		Handler:      mux,
		ReadTimeout:  5 * time.Second,
		WriteTimeout: 45 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	// 8. Initialize gRPC Server
	grpcAddr := normalizeAddr(os.Getenv("GRPC_PORT"), "50051")

	grpcSrv := grpc.NewServer(
		grpc.StatsHandler(otelgrpc.NewServerHandler()),
		grpc.ChainUnaryInterceptor(
			grpcserver.NewMetricsUnaryInterceptor(),
			grpcserver.NewAuthUnaryInterceptor(cfg.JWTSecret),
		),
		grpc.ChainStreamInterceptor(
			grpcserver.NewAuthStreamInterceptor(cfg.JWTSecret),
		),
	)

	// Construct GatewayGRPCServer with 11 arguments (reusing existing instances)
	grpcHandler := grpcserver.NewGatewayGRPCServer(
		alertClient,        // 1. AlertBridgeClient
		redisClient,        // 2. *redis.Client
		anomalyRepo,        // 3. handlers.AnomalyRepository
		engineCClient,      // 4. handlers.EngineCClient
		telemetryRepo,      // 5. handlers.TelemetryRepository
		engineBClient,      // 6. handlers.AIClient
		prioritizationRepo, // 7. handlers.PrioritizationRepository
		engineDClient,      // 8. handlers.EngineDClient
		nil,                // 9. interventionoutcomes.Repository (untyped nil)
		db,                 // 10. *database.PostgresDB
		engineAClient,      // 11. *bridge.EngineAClient
	)

	pb.RegisterGatewayServiceServer(grpcSrv, grpcHandler)

	grpcListener, err := net.Listen("tcp", grpcAddr)
	if err != nil {
		log.Fatalf("FATAL: Failed to listen on gRPC address %s: %v", grpcAddr, err)
	}

	// 9. Metrics server on its own port, so /metrics is never exposed on the public API mux.
	// Bind it to an internal interface or keep the port unpublished.
	metricsMux := http.NewServeMux()
	metricsMux.Handle("/metrics", promhttp.Handler())
	metricsSrv := &http.Server{
		Addr:              normalizeAddr(os.Getenv("METRICS_PORT"), "9090"),
		Handler:           metricsMux,
		ReadHeaderTimeout: 5 * time.Second,
	}

	// 10. Start all servers
	log.Printf("Starting gRPC server on %s...", grpcAddr)
	go func() {
		// Serve returns nil after Stop/GracefulStop, so only real failures reach here.
		if err := grpcSrv.Serve(grpcListener); err != nil {
			log.Fatalf("FATAL: gRPC server error: %v", err)
		}
	}()

	go func() {
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("FATAL: HTTP server error: %v", err)
		}
	}()

	// A metrics failure must not take the gateway down.
	log.Printf("Starting metrics server on %s...", metricsSrv.Addr)
	go func() {
		if err := metricsSrv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Printf("WARN: metrics server error: %v", err)
		}
	}()

	// 11. Graceful Shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	// Block until a signal is received
	<-quit
	log.Println("Shutdown signal received, gracefully terminating...")

	// One shared 10s budget; every server drains concurrently within it.
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()

	var wg sync.WaitGroup
	wg.Add(3)

	go func() {
		defer wg.Done()
		if err := srv.Shutdown(shutdownCtx); err != nil {
			log.Printf("WARN: HTTP server shutdown error: %v", err)
		}
	}()

	go func() {
		defer wg.Done()
		if err := metricsSrv.Shutdown(shutdownCtx); err != nil {
			log.Printf("WARN: metrics server shutdown error: %v", err)
		}
	}()

	go func() {
		defer wg.Done()
		stopped := make(chan struct{})
		go func() {
			grpcSrv.GracefulStop()
			close(stopped)
		}()

		select {
		case <-stopped:
			log.Println("gRPC server stopped gracefully.")
		case <-shutdownCtx.Done():
			log.Println("gRPC graceful stop timed out, forcing stop...")
			grpcSrv.Stop()
		}
	}()

	wg.Wait()

	// Deferred db.Close() and redisClient.Close() run when main returns.
	log.Println("API Gateway stopped cleanly.")
}

// normalizeAddr turns a bare port ("50051"), a ":port", or a full "host:port"
// into a listen address, using def when v is empty.
func normalizeAddr(v, def string) string {
	if v == "" {
		v = def
	}
	if !strings.Contains(v, ":") {
		return ":" + v
	}
	return v
}

// requireEnv returns the value of a mandatory environment variable and exits at
// startup if it is missing, instead of silently falling back to a guessable default.
func requireEnv(name string) string {
	v := os.Getenv(name)
	if v == "" {
		log.Fatalf("CRITICAL CONFIGURATION ERROR: Environment variable %s is missing or empty.", name)
	}
	return v
}

// enableCORS is a basic middleware to allow requests from the Next.js frontend
func enableCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// In production, restrict "*" to your specific Next.js domain (e.g., http://localhost:3000)
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PATCH")
		w.Header().Set("Access-Control-Allow-Headers", "Accept, Content-Type, Content-Length, Accept-Encoding, Authorization")

		// Handle preflight requests
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}