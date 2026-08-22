package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	chiMiddleware "github.com/go-chi/chi/v5/middleware"

	// Using your exact module name
	"gridsense/auth/internal/config"
	"gridsense/auth/internal/shared"

	// Import our newly built domain packages
	"gridsense/auth/internal/auth/admin"
	"gridsense/auth/internal/auth/login"
	"gridsense/auth/internal/auth/logout"
	"gridsense/auth/internal/auth/register"

	// Alias our custom middleware to prevent conflicts with chi's middleware
	appMiddleware "gridsense/auth/internal/middleware"
)

func main() {
	// =========================================================================
	// 1. Bootstrapping & Configuration
	// =========================================================================
	log.Println("Starting GridSense Auth Microservice...")
	cfg := config.LoadConfig()

	// =========================================================================
	// 2. Infrastructure Connections (Fail-Fast Initialization)
	// =========================================================================

	// Initialize PostgreSQL (Supabase)
	dbPool, err := shared.NewDBPool(cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("FATAL: Could not connect to Supabase: %v", err)
	}
	defer dbPool.Close()

	// Initialize Upstash Redis via Custom REST Client
	redisClient, err := shared.NewRedisClient(cfg.UpstashRedisRestURL, cfg.UpstashRedisRestToken)
	if err != nil {
		log.Fatalf("FATAL: Could not connect to Upstash Redis: %v", err)
	}
	defer redisClient.Close()

	// =========================================================================
	// 3. Dependency Injection (Wiring the Microservice)
	// =========================================================================

	jwtSecretBytes := []byte(cfg.JWTSecret)

	// A. Middlewares
	authGuard := appMiddleware.NewAuthMiddleware(jwtSecretBytes, redisClient)

	// B. Registration Domain
	regRepo := register.NewRepository(dbPool) // Re-added the missing repository declaration
	regSvc := register.NewService(regRepo)
	regHandler := register.NewHandler(regSvc)

	// C. Login Domain
	loginSvc := login.NewService(dbPool, redisClient, jwtSecretBytes)
	loginHandler := login.NewHandler(loginSvc, cfg.CookieSecure)

	// D. Logout Domain
	logoutSvc := logout.NewService(redisClient, jwtSecretBytes)
	logoutHandler := logout.NewHandler(logoutSvc, cfg.CookieSecure)

	// E. Admin Management Domain
	adminRepo := admin.NewRepository(dbPool)
	adminSvc := admin.NewService(adminRepo)
	adminHandler := admin.NewHandler(adminSvc)

	// =========================================================================
	// 4. Router & Global Middleware Setup
	// =========================================================================
	r := chi.NewRouter()

	// Inject standard enterprise middleware
	r.Use(chiMiddleware.RequestID)
	r.Use(chiMiddleware.RealIP)
	r.Use(chiMiddleware.Logger)
	r.Use(chiMiddleware.Recoverer)
	r.Use(chiMiddleware.Timeout(15 * time.Second))

	// Base Health Route
	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status":"healthy","service":"auth-service","message":"System is fully operational"}`))
	})

	// =========================================================================
	// 5. API Route Definitions & Security Gates
	// =========================================================================
	r.Route("/api", func(r chi.Router) {

		// --- Authentication Routes ---
		r.Route("/auth", func(r chi.Router) {
			// Public Endpoints
			r.Post("/register", regHandler.HandleRegister)
			r.Post("/login", loginHandler.HandleLogin)

			// Protected Endpoints (Require Valid Token)
			r.Group(func(r chi.Router) {
				r.Use(authGuard.RequireAuth)
				r.Post("/logout", logoutHandler.HandleLogout)
			})
		})

		// --- Administrative Routes ---
		r.Route("/admin", func(r chi.Router) {
			// Security Gate 1: Must have a valid, non-revoked session
			r.Use(authGuard.RequireAuth)

			// Sub-group: Accessible by both Admin and Manager
			r.Group(func(r chi.Router) {
				r.Use(appMiddleware.RequireRoles("Admin", "Manager"))
				r.Get("/users/pending", adminHandler.HandleGetPendingUsers)
				r.Patch("/users/{id}/approve", adminHandler.HandleApproveUser)
			})

			// Sub-group: Strictly restricted to Admin only (Destructive Actions)
			r.Group(func(r chi.Router) {
				r.Use(appMiddleware.RequireRoles("Admin"))
				r.Delete("/users/{id}", adminHandler.HandleDeleteUser)
			})
		})
	})

	// =========================================================================
	// 6. Server Configuration & Tuning
	// =========================================================================
	addr := fmt.Sprintf(":%s", cfg.Port)
	srv := &http.Server{
		Addr:         addr,
		Handler:      r,
		ReadTimeout:  5 * time.Second,
		WriteTimeout: 10 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	// =========================================================================
	// 7. Graceful Shutdown Implementation
	// =========================================================================
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)

	go func() {
		log.Printf("Auth microservice listening on internal port %s", cfg.Port)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("FATAL: Server crashed: %v", err)
		}
	}()

	<-stop
	log.Println("Received termination signal. Initiating graceful shutdown...")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		log.Printf("Forced shutdown error: %v", err)
	}

	log.Println("Auth microservice successfully gracefully shut down.")
}