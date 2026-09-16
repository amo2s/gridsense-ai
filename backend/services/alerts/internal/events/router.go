package events

import (
	"context"
	"fmt"
	"time"

	"github.com/ThreeDotsLabs/watermill/message"
	"github.com/ThreeDotsLabs/watermill/message/router/middleware"
	"github.com/ThreeDotsLabs/watermill/message/router/plugin"
	"go.uber.org/zap"

	"github.com/gridsense-ai/alerts/internal/config"
)

// Router defines the orchestration pipeline for incoming event streams.
type Router struct {
	engine *message.Router
	logger *zap.Logger
}

// NewRouter initializes the routing engine with fault-tolerant middlewares.
func NewRouter(logger *zap.Logger, pub message.Publisher, cfg *config.Config) (*Router, error) {
	adapter := &zapLoggerAdapter{logger: logger}

	engine, err := message.NewRouter(message.RouterConfig{}, adapter)
	if err != nil {
		return nil, fmt.Errorf("failed to initialize event router: %w", err)
	}

	// Graceful shutdown plugin linked to OS interrupt signals
	engine.AddPlugin(plugin.SignalsHandler)

	// Middlewares execute in the exact order they are added.
	// 1. Recoverer: catches panics in handlers to prevent microservice crashes.
	engine.AddMiddleware(middleware.Recoverer)

	// 2. CorrelationID: propagates tracing IDs across distributed messages.
	engine.AddMiddleware(middleware.CorrelationID)

	// 3. Timeout: strictly enforces a 10-second deadline for handlers.
	engine.AddMiddleware(middleware.Timeout(10 * time.Second))

	// 4. Poison Queue (Dead-Letter Queue): routes permanently failed events here to unblock stream.
	pq, err := middleware.PoisonQueue(pub, cfg.DeadLetterStreamName)
	if err != nil {
		return nil, fmt.Errorf("failed to build poison queue middleware: %w", err)
	}
	engine.AddMiddleware(pq)

	// 5. Exponential Backoff: retries transient errors before failing down to the Poison Queue.
	retry := middleware.Retry{
		MaxRetries:      5,
		InitialInterval: 100 * time.Millisecond,
		MaxInterval:     5 * time.Second,
		Multiplier:      2.0,
		Logger:          adapter,
	}
	engine.AddMiddleware(retry.Middleware)

	return &Router{
		engine: engine,
		logger: logger,
	}, nil
}

// RegisterHandler binds a processing function to a stream topic enforcing concurrency contexts.
func (r *Router) RegisterHandler(handlerName string, topic string, pub message.Publisher, sub message.Subscriber, handlerFunc message.HandlerFunc) {
	r.engine.AddHandler(
		handlerName,
		topic,
		sub,
		"", // Egress topic left empty for terminal handlers
		pub,
		handlerFunc,
	)
	r.logger.Info("Registered event handler", zap.String("handler", handlerName), zap.String("topic", topic))
}

// Run blocks and starts the routing engine, hooking into the main application context.
func (r *Router) Run(ctx context.Context) error {
	r.logger.Info("Starting event routing engine pipeline...")
	return r.engine.Run(ctx)
}