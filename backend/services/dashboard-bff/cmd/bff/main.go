package main

import (
	"context"
	"errors"
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
			log.Printf("WS InitFunc Triggered. Payload: %+v\n", initPayload)
			authHeader := initPayload.Authorization()
			if authHeader == "" {
				// Fallback to checking map directly just in case
				if val, ok := initPayload["Authorization"].(string); ok {
					authHeader = val
				}
			}
			if authHeader == "" {
				log.Println("WS InitFunc Error: missing authorization in connection params")
				return nil, nil, errors.New("missing authorization in connection params")
			}
			if len(authHeader) < 8 || !strings.HasPrefix(authHeader, "Bearer ") {
				log.Println("WS InitFunc Error: malformed authorization payload")
				return nil, nil, errors.New("malformed authorization payload")
			}
			tokenStr := authHeader[7:]
			identity, err := middleware.ValidateToken(tokenStr, []byte(cfg.JWTSecret))
			if err != nil {
				log.Println("WS InitFunc Error:", err)
				return nil, nil, err
			}
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