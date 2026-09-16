package events

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/ThreeDotsLabs/watermill/message"
	"github.com/ThreeDotsLabs/watermill/message/router/middleware"
	"github.com/ThreeDotsLabs/watermill/message/router/plugin"
	"github.com/bytedance/sonic"
	"go.uber.org/zap"

	"github.com/gridsense-ai/alerts/internal/config"
	"github.com/gridsense-ai/alerts/internal/domain"
)

// Evaluator defines the contract for the rule and severity evaluation core (Phase 4).
type Evaluator interface {
	ProcessAuthEvent(ctx context.Context, event *domain.AuthPayload) error
	ProcessErrorEvent(ctx context.Context, event *domain.ErrorPayload) error
	ProcessAnomalyEvent(ctx context.Context, event *domain.AnomalyPayload) error
}

// Router defines the orchestration pipeline for incoming event streams.
type Router struct {
	engine    *message.Router
	evaluator Evaluator
	logger    *zap.Logger
}

// NewRouter initializes the routing engine with fault-tolerant middlewares.
func NewRouter(logger *zap.Logger, pub message.Publisher, cfg *config.Config, eval Evaluator) (*Router, error) {
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
		engine:    engine,
		evaluator: eval,
		logger:    logger,
	}, nil
}

// ProcessEvent is the concurrent worker function that decodes, validates, and routes events.
// This is the handlerFunc you will pass into RegisterHandler.
func (r *Router) ProcessEvent(msg *message.Message) error {
	// 1. Fast partial parse to determine the routing type using SIMD JSON
	var base domain.BaseEvent
	if err := sonic.Unmarshal(msg.Payload, &base); err != nil {
		r.logger.Error("Failed to unmarshal base event", zap.Error(err), zap.String("msg_uuid", msg.UUID))
		// Return nil to ack the message; permanently malformed junk should not block the queue
		return nil
	}

	// 2. Validate the base envelope structure
	if err := domain.Validate.Struct(base); err != nil {
		r.logger.Error("Base event validation failed", zap.Error(err), zap.String("trace_id", base.TraceID))
		return nil
	}

	ctx := msg.Context()

	// 3. Demultiplex based on EventType and validate specific payload
	switch base.Type {
	case domain.EventTypeAuth:
		var payload domain.AuthPayload
		if err := sonic.Unmarshal(msg.Payload, &payload); err != nil {
			return err
		}
		if err := domain.Validate.Struct(payload); err != nil {
			return err
		}
		return r.evaluator.ProcessAuthEvent(ctx, &payload)

	case domain.EventTypeError:
		var payload domain.ErrorPayload
		if err := sonic.Unmarshal(msg.Payload, &payload); err != nil {
			return err
		}
		if err := domain.Validate.Struct(payload); err != nil {
			return err
		}
		return r.evaluator.ProcessErrorEvent(ctx, &payload)

	case domain.EventTypeAnomaly:
		var payload domain.AnomalyPayload
		if err := sonic.Unmarshal(msg.Payload, &payload); err != nil {
			return err
		}
		if err := domain.Validate.Struct(payload); err != nil {
			return err
		}
		return r.evaluator.ProcessAnomalyEvent(ctx, &payload)

	default:
		r.logger.Warn("Unknown event type received", zap.String("type", string(base.Type)))
		return errors.New("unknown event type")
	}
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