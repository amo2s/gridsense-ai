package evaluator

import (
	"context"
	"fmt"
	"time"

	"go.uber.org/zap"

	// Note: Adjust module path if your go.mod is not named "alerts"
	"github.com/gridsense-ai/alerts/internal/domain"
	"github.com/gridsense-ai/alerts/internal/repository"
	"github.com/gridsense-ai/alerts/internal/throttle"
)

// DispatchRoute represents a bitwise flag for zero-allocation multi-channel routing.
type DispatchRoute uint8

const (
	RouteLogOnly DispatchRoute = 1 << iota // 1: Persist to DB only
	RouteUI                                // 2: Send to Next.js via SSE
	RouteEmail                             // 4: Send via Novu Email
	RouteSMS                               // 8: Send via Novu SMS

	// Preset matrices
	MatrixInfo     = RouteLogOnly | RouteUI
	MatrixWarning  = RouteLogOnly | RouteUI | RouteEmail
	MatrixCritical = RouteLogOnly | RouteUI | RouteEmail | RouteSMS
)

// RuleEngine evaluates domain events against active policies and orchestrates throttling.
type RuleEngine struct {
	repo    repository.AlertRepository
	limiter throttle.RateLimiter
	logger  *zap.Logger
}

// NewRuleEngine constructs the central severity classification engine.
func NewRuleEngine(repo repository.AlertRepository, limiter throttle.RateLimiter, logger *zap.Logger) *RuleEngine {
	return &RuleEngine{
		repo:    repo,
		limiter: limiter,
		logger:  logger,
	}
}

// ProcessAuthEvent evaluates authentication anomalies (e.g., failed brute-force logins).
func (e *RuleEngine) ProcessAuthEvent(ctx context.Context, event *domain.AuthPayload) error {
	// Throttle: limit to 3 failed login alerts per user per 5 minutes
	throttleKey := fmt.Sprintf("throttle:auth:%s", event.UserID)
	allowed, err := e.limiter.Allow(ctx, throttleKey, 3, 5*time.Minute)
	if err != nil {
		e.logger.Error("Throttle evaluation failed", zap.Error(err), zap.String("trace_id", event.TraceID))
		return err
	}
	if !allowed {
		e.logger.Debug("Alert deduplicated/throttled", zap.String("throttle_key", throttleKey))
		return nil
	}

	routeMatrix := MatrixWarning
	e.logger.Info("Auth event evaluated", zap.String("user", event.UserID), zap.Uint8("routes", uint8(routeMatrix)))
	
	// TODO: Phase 5 - Handoff to Dispatcher using routeMatrix
	return nil
}

// ProcessErrorEvent evaluates internal system exceptions.
func (e *RuleEngine) ProcessErrorEvent(ctx context.Context, event *domain.ErrorPayload) error {
	// Throttle: limit identical error codes from the same component to 1 per minute
	throttleKey := fmt.Sprintf("throttle:error:%s:%s", event.Component, event.ErrorCode)
	allowed, err := e.limiter.Allow(ctx, throttleKey, 1, 1*time.Minute)
	if err != nil {
		return err
	}
	if !allowed {
		return nil
	}

	routeMatrix := MatrixCritical
	e.logger.Info("System error evaluated", zap.String("component", event.Component), zap.Uint8("routes", uint8(routeMatrix)))
	
	// TODO: Phase 5 - Handoff to Dispatcher using routeMatrix
	return nil
}

// ProcessAnomalyEvent evaluates intelligence risk spikes from FastAPI engines.
func (e *RuleEngine) ProcessAnomalyEvent(ctx context.Context, event *domain.AnomalyPayload) error {
	// Throttle: limit intelligence alerts per feeder to 1 per 2 minutes to prevent UI storms
	throttleKey := fmt.Sprintf("throttle:feeder:%s", event.FeederID)
	allowed, err := e.limiter.Allow(ctx, throttleKey, 1, 2*time.Minute)
	if err != nil {
		return err
	}
	if !allowed {
		return nil
	}

	// Dynamic zero-allocation severity classification
	var routeMatrix DispatchRoute
	switch event.Severity {
	case "INFO":
		routeMatrix = MatrixInfo
	case "WARNING":
		routeMatrix = MatrixWarning
	case "CRITICAL", "PANIC":
		routeMatrix = MatrixCritical
	default:
		routeMatrix = MatrixInfo // Safe fallback
	}

	e.logger.Info("Anomaly event evaluated", 
		zap.String("feeder", event.FeederID), 
		zap.Float64("risk", event.RiskScore),
		zap.Uint8("routes", uint8(routeMatrix)),
	)
	
	// TODO: Phase 5 - Handoff to Dispatcher using routeMatrix
	return nil
}