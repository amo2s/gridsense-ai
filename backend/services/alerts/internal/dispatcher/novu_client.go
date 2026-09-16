package dispatcher

import (
	"context"
	"fmt"
	"time"

	novu "github.com/novuhq/go-novu/lib"
	"go.uber.org/zap"

	// Note: Adjust module path if your go.mod is not named "alerts"
	"github.com/gridsense-ai/alerts/internal/domain"
	"github.com/gridsense-ai/alerts/internal/evaluator"
)

// NovuClient handles outbound notifications to the Novu API.
type NovuClient struct {
	client *novu.APIClient
	logger *zap.Logger
}

// NewNovuClient initializes the Novu API wrapper.
func NewNovuClient(apiKey string, logger *zap.Logger) *NovuClient {
	client := novu.NewAPIClient(apiKey, &novu.Config{})
	return &NovuClient{
		client: client,
		logger: logger,
	}
}

// Dispatch routes the event to external channels based on the bitmask evaluation.
func (n *NovuClient) Dispatch(ctx context.Context, event interface{}, routeMatrix evaluator.DispatchRoute, subscriberID string) error {
	// Enforce a strict timeout to prevent external API degradation from blocking the ingestion stream
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	// Evaluate the bitmask to determine if external dispatch is necessary
	sendEmail := (routeMatrix & evaluator.RouteEmail) != 0
	sendSMS := (routeMatrix & evaluator.RouteSMS) != 0

	if !sendEmail && !sendSMS {
		return nil // UI/Log only, skip external trigger
	}

	var workflowID string
	var payload map[string]interface{}

	// Map the strongly-typed domain events to Novu workflow identifiers and payloads
	switch v := event.(type) {
	case *domain.AnomalyPayload:
		workflowID = "feeder-anomaly"
		payload = map[string]interface{}{
			"feeder_id":  v.FeederID,
			"severity":   v.Severity,
			"risk_score": v.RiskScore,
		}
	case *domain.ErrorPayload:
		workflowID = "system-error"
		payload = map[string]interface{}{
			"component":  v.Component,
			"error_code": v.ErrorCode,
		}
	case *domain.AuthPayload:
		workflowID = "auth-alert"
		payload = map[string]interface{}{
			"user_id": v.UserID,
			"action":  v.Action,
		}
	default:
		return fmt.Errorf("unsupported event type for novu dispatch")
	}

	// Construct and fire the Novu trigger
	req := novu.ITriggerPayloadOptions{
		To: map[string]string{
			"subscriberId": subscriberID,
		},
		Payload: payload,
	}

	_, err := n.client.EventApi.Trigger(ctx, workflowID, req)
	if err != nil {
		n.logger.Error("Failed to trigger Novu workflow", zap.Error(err), zap.String("workflow", workflowID))
		return fmt.Errorf("novu trigger failed: %w", err)
	}

	n.logger.Info("Novu notification dispatched successfully", zap.String("workflow", workflowID), zap.String("subscriber", subscriberID))
	return nil
}
