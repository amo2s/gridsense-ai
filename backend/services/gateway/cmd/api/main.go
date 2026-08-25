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

	"gateway/bridge"
	"gateway/internal/config"
	"gateway/database"
	"gateway/handlers"
	"gateway/middleware"
)

func main() {
	// 1. Load configuration (fail-fast if missing critical vars)
	cfg := config.LoadConfig()
	log.Printf("Starting API Gateway on port %s...", cfg.GatewayPort)

	// Context for initialization and graceful shutdown
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// 2. Initialize Database Pool
	db, err := database.InitPool(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("FATAL: Could not initialize database pool: %v", err)
	}
	defer db.Close()
	log.Println("Database connection pool established successfully.")

	// 3. Initialize Internal Clients
	engineClient := bridge.NewEngineAClient(cfg.EngineAURL, cfg.InternalServiceKey)

	// 4. Initialize Handlers
	reliabilityHandler := handlers.NewReliabilityHandler(db, engineClient)
	healthHandler := handlers.NewHealthHandler(db) // Registered health handler

	// 5. Setup Router (ServeMux) and apply Middleware
	mux := http.NewServeMux()

	// Public Health Probe (Unauthenticated)
	mux.Handle("/healthz", enableCORS(http.HandlerFunc(healthHandler.HealthCheck)))

	// Wrap the endpoint with the JWT Authentication Middleware
	authProtectedReliability := middleware.RequireAuth(cfg.JWTSecret)(http.HandlerFunc(reliabilityHandler.Evaluate))
	
	// Register the route
	mux.Handle("/api/v1/reliability/evaluate", enableCORS(authProtectedReliability))

	// 6. Configure the HTTP Server with strict timeouts to prevent resource exhaustion (Slowloris attacks)
	srv := &http.Server{
		Addr:         ":" + cfg.GatewayPort,
		Handler:      mux,
		ReadTimeout:  5 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	// 7. Start the server in a separate goroutine to allow signal listening on the main thread
	go func() {
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("FATAL: HTTP server error: %v", err)
		}
	}()

	// 8. Graceful Shutdown Implementation
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	
	// Block until a signal is received
	<-quit
	log.Println("Shutdown signal received, gracefully terminating...")

	// Give the server 10 seconds to finish executing active requests
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Fatalf("Server forced to shutdown abnormally: %v", err)
	}

	log.Println("API Gateway stopped cleanly.")
}

// enableCORS is a basic middleware to allow requests from the Next.js frontend
func enableCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// In production, restrict "*" to your specific Next.js domain (e.g., http://localhost:3000)
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Accept, Content-Type, Content-Length, Accept-Encoding, Authorization")

		// Handle preflight requests
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}