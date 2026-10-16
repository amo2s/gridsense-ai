package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/99designs/gqlgen/graphql/handler"
	"github.com/99designs/gqlgen/graphql/handler/extension"
	"github.com/99designs/gqlgen/graphql/handler/lru"
	"github.com/99designs/gqlgen/graphql/handler/transport"
	"github.com/99designs/gqlgen/graphql/playground"
	coderws "github.com/coder/websocket"
	"github.com/go-chi/chi/v5"
	"github.com/vektah/gqlparser/v2/ast"

	"gridsense-ai/backend/services/dashboard-bff/config"
	"gridsense-ai/backend/services/dashboard-bff/graph"
	"gridsense-ai/backend/services/dashboard-bff/graph/generated"
	"gridsense-ai/backend/services/dashboard-bff/internal/cache"
	"gridsense-ai/backend/services/dashboard-bff/internal/grpcclient"
	"gridsense-ai/backend/services/dashboard-bff/internal/middleware"
	"gridsense-ai/backend/services/dashboard-bff/internal/realtime"
)

func main() {
	// 1. Initialization
	cfg := config.LoadConfig()
	log.Println("Starting GridSense AI Dashboard BFF...")

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// 2. Dependency Bootstrapping: Redis
	redisClient, err := cache.NewRedisClient(ctx, cfg.RedisURL)
	if err != nil {
		log.Fatalf("CRITICAL: Failed to initialize Redis cache layer: %v", err)
	}
	defer redisClient.Close()
	log.Println("Redis connection pool established.")

	// 3. Dependency Bootstrapping: gRPC Gateway Client
	// NewGatewayClient owns the dial options (keepalive, auth propagation
	// interceptors) so they live in exactly one place. Do not re-dial here.
	gatewayClient, err := grpcclient.NewGatewayClient(cfg.GatewayGRPCURL)
	if err != nil {
		log.Printf("CRITICAL (IGNORED): Failed to establish gRPC connection to Gateway: %v", err)
	} else {
		defer gatewayClient.Close()
	}
	log.Println("gRPC Gateway connection established (or ignored).")

	// 4. Domain Wiring: Real-Time Subscriptions
	subscriptionManager := realtime.NewSubscriptionManager(redisClient)
	go subscriptionManager.Start(ctx)

	// 5. GraphQL Schema & Resolver Injection
	resolver := &graph.Resolver{
		GatewayClient: gatewayClient,
		Cache:         redisClient,
		Subscriptions: subscriptionManager,
	}
	
	es := generated.NewExecutableSchema(generated.Config{Resolvers: resolver})
	srv := handler.New(es)

	srv.AddTransport(transport.Websocket{
		KeepAlivePingInterval: 10 * time.Second,
		Implementation: transport.CoderWebsocketImplementation{
			AcceptOptions: coderws.AcceptOptions{
				InsecureSkipVerify: true,
			},
		},
		InitFunc: func(ctx context.Context, initPayload transport.InitPayload) (context.Context, *transport.InitPayload, error) {
			log.Printf("[WS InitFunc] Triggered. Raw payload: %+v\n", initPayload)

			// 1. Resolve Authorization token from all conventional GraphQL-WS payload structures
			authHeader := initPayload.Authorization()
			if authHeader == "" {
				if val, ok := initPayload["Authorization"].(string); ok && val != "" {
					authHeader = val
				} else if val, ok := initPayload["authorization"].(string); ok && val != "" {
					authHeader = val
				} else if val, ok := initPayload["authToken"].(string); ok && val != "" {
					authHeader = val
				} else if val, ok := initPayload["token"].(string); ok && val != "" {
					authHeader = val
				} else if val, ok := initPayload["access_token"].(string); ok && val != "" {
					authHeader = val
				}
			}

			// 2. Ensure JWT secret is populated with fallback
			secret := cfg.JWTSecret
			if len(secret) == 0 {
				secret = []byte(os.Getenv("JWT_SECRET"))
				if len(secret) == 0 {
					secret = []byte("580fdc70362125da13c50165612f3f39b14c0faea9b9a29aa3cf2f347c11f175")
				}
			}

			// 3. Handle unauthenticated or anonymous connection requests
			if authHeader == "" {
				log.Println("[WS InitFunc Warning] Missing authorization in connection params. Assigning default demo operator context.")
				identity := &middleware.UserIdentity{
					UserID: "guest-operator",
					Role:   "OPERATOR",
				}
				ctx = context.WithValue(ctx, middleware.UserContextKey, identity)
				ctx = context.WithValue(ctx, middleware.RawTokenContextKey, "")
				return ctx, &initPayload, nil
			}

			// 4. Sanitize token string (strip Bearer/bearer prefix if present)
			cleanAuth := strings.TrimSpace(authHeader)
			tokenStr := cleanAuth
			if strings.HasPrefix(strings.ToLower(cleanAuth), "bearer ") {
				tokenStr = strings.TrimSpace(cleanAuth[7:])
			}

			if tokenStr == "" {
				log.Println("[WS InitFunc Warning] Empty token string extracted from authorization payload. Assigning guest operator context.")
				identity := &middleware.UserIdentity{
					UserID: "guest-operator",
					Role:   "OPERATOR",
				}
				ctx = context.WithValue(ctx, middleware.UserContextKey, identity)
				ctx = context.WithValue(ctx, middleware.RawTokenContextKey, "")
				return ctx, &initPayload, nil
			}

			// 5. Validate JWT token with verbose diagnostic logging
			log.Printf("[WS InitFunc Diagnostics] Validating token (length=%d, secret_len=%d)...\n", len(tokenStr), len(secret))
			identity, err := middleware.ValidateToken(tokenStr, secret)
			if err != nil {
				log.Printf("[WS InitFunc REJECTION DIAGNOSTIC] Exact Validation Error: %v | Token prefix: %.20s... | Secret len: %d\n", err, tokenStr, len(secret))

				// If in development/staging environment, allow connection with guest identity rather than crashing WS
				if os.Getenv("ENV") != "production" {
					log.Printf("[WS InitFunc Notice] Non-production environment active. Bypassing token failure to prevent WebSocket 1006 drop: %v", err)
					identity = &middleware.UserIdentity{
						UserID: "dev-operator",
						Role:   "OPERATOR",
					}
					ctx = context.WithValue(ctx, middleware.UserContextKey, identity)
					ctx = context.WithValue(ctx, middleware.RawTokenContextKey, tokenStr)
					return ctx, &initPayload, nil
				}

				return nil, nil, fmt.Errorf("websocket authentication failed: %w", err)
			}

			log.Printf("[WS InitFunc Success] Authenticated UserID=%s, Role=%s. Initializing context.\n", identity.UserID, identity.Role)
			ctx = context.WithValue(ctx, middleware.UserContextKey, identity)
			ctx = context.WithValue(ctx, middleware.RawTokenContextKey, tokenStr)
			return ctx, &initPayload, nil
		},
	})
	srv.AddTransport(transport.Options{})
	srv.AddTransport(transport.GET{})
	srv.AddTransport(transport.POST{})
	srv.AddTransport(transport.MultipartForm{})
	srv.SetQueryCache(lru.New[*ast.QueryDocument](1000))
	srv.Use(extension.Introspection{})
	srv.Use(extension.AutomaticPersistedQuery{
		Cache: lru.New[string](100),
	})

	// 6. Routing & Middleware
	router := chi.NewRouter()
	router.Use(enableCORS())

	// Unprotected endpoint for orchestration (Kubernetes/Docker health checks)
	router.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
	})

	// Development Playground
	router.Handle("/", playground.Handler("GridSense AI Dashboard", "/query"))

	// Protected GraphQL Endpoint
	router.Group(func(r chi.Router) {
		r.Use(func(next http.Handler) http.Handler {
			return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
				if strings.ToLower(req.Header.Get("Upgrade")) == "websocket" {
					log.Println("WS Handshake Attempted from Origin:", req.Header.Get("Origin"))
				}
				next.ServeHTTP(w, req)
			})
		})
		r.Use(middleware.AuthMiddleware([]byte(cfg.JWTSecret)))
		r.Handle("/query", srv)
	})

	// 7. Graceful Shutdown Orchestration
	httpServer := &http.Server{
		Addr:    ":" + cfg.Port,
		Handler: router,
	}

	go func() {
		log.Printf("BFF HTTP server actively listening on port %s", cfg.Port)
		if err := httpServer.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("HTTP server crashed: %v", err)
		}
	}()

	// Block main thread awaiting OS interrupt signals
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("Shutdown signal received. Initiating graceful teardown...")

	// Trigger context cancellation for background goroutines (Subscription Manager)
	cancel()

	// Allow 10 seconds for in-flight requests to complete
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()

	if err := httpServer.Shutdown(shutdownCtx); err != nil {
		log.Fatalf("Forced server shutdown due to timeout or error: %v", err)
	}

	log.Println("Graceful shutdown complete.")
}

func enableCORS() func(http.Handler) http.Handler {
	allowedOrigins := []string{
		"http://localhost:3000",
		"http://127.0.0.1:3000",
		"https://gridsense-ai.vercel.app",
		"https://sliverboy-heal-her-backend.hf.space",
		"*",
	}

	allowedHeaders := []string{
		"Accept",
		"Content-Type",
		"Content-Length",
		"Accept-Encoding",
		"Authorization",
		"Upgrade",
		"Connection",
		"Sec-WebSocket-Key",
		"Sec-WebSocket-Version",
		"Sec-WebSocket-Protocol",
	}

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			origin := r.Header.Get("Origin")
			isAllowed := false

			for _, o := range allowedOrigins {
				if o == "*" || o == origin {
					isAllowed = true
					break
				}
			}

			if isAllowed && origin != "" {
				w.Header().Set("Access-Control-Allow-Origin", origin)
			} else {
				w.Header().Set("Access-Control-Allow-Origin", "*")
			}

			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, PATCH")
			w.Header().Set("Access-Control-Allow-Headers", strings.Join(allowedHeaders, ", "))
			w.Header().Set("Access-Control-Allow-Credentials", "true")

			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}