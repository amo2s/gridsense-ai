package bridge

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math"
	"math/rand"
	"net/http"
	"time"

	"gateway/models"

	"github.com/sony/gobreaker"
)

// maxAlertResponseBodyBytes sets a 5 MiB cap to accommodate large active alert arrays
// during grid failure events while preventing unbounded memory consumption.
const maxAlertResponseBodyBytes = 5 << 20

// AlertBridgeClient manages resilient HTTP communication with the Phase 6 Alert Microservice.
type AlertBridgeClient struct {
	baseURL        string
	serviceKey     string
	httpClient     *http.Client
	cb             *gobreaker.CircuitBreaker
	maxRetries     int
	initialBackoff time.Duration
}

// NewAlertBridgeClient initializes the bridge client with optimized connection pooling,
// jittered-backoff retry, and a circuit breaker to protect the gateway.
func NewAlertBridgeClient(baseURL, serviceKey string) *AlertBridgeClient {
	return &AlertBridgeClient{
		baseURL:    baseURL,
		serviceKey: serviceKey,
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
			Transport: &http.Transport{
				MaxIdleConns:        100,
				MaxIdleConnsPerHost: 20,
				IdleConnTimeout:     90 * time.Second,
			},
		},
		cb: gobreaker.NewCircuitBreaker(gobreaker.Settings{
			Name:        "AlertMicroserviceCircuitBreaker",
			MaxRequests: 5,
			Interval:    10 * time.Second,
			Timeout:     30 * time.Second,
			ReadyToTrip: func(counts gobreaker.Counts) bool {
				return counts.ConsecutiveFailures > 3
			},
			OnStateChange: func(name string, from gobreaker.State, to gobreaker.State) {
				log.Printf("[WARN] %s state change: %s -> %s", name, from, to)
			},
		}),
		maxRetries:     3,
		initialBackoff: 200 * time.Millisecond,
	}
}

// FetchActiveAlerts executes a GET request to retrieve all unresolved events.
func (c *AlertBridgeClient) FetchActiveAlerts(ctx context.Context) ([]models.Alert, error) {
	endpoint := fmt.Sprintf("%s/api/v1/alerts/active", c.baseURL)

	result, err := c.cb.Execute(func() (interface{}, error) {
		return c.doWithRetries(ctx, http.MethodGet, endpoint, nil)
	})
	if err != nil {
		if err == gobreaker.ErrOpenState || err == gobreaker.ErrTooManyRequests {
			return nil, fmt.Errorf("alert circuit breaker open, refusing request: %w", err)
		}
		return nil, err
	}

	respBytes := result.([]byte)
	var alerts []models.Alert
	if err := json.Unmarshal(respBytes, &alerts); err != nil {
		return nil, fmt.Errorf("failed to decode active alerts response: %w", err)
	}

	return alerts, nil
}

// AcknowledgeAlert executes a PATCH request to resolve a specific alert.
func (c *AlertBridgeClient) AcknowledgeAlert(ctx context.Context, alertID string, payload *models.AcknowledgePayload) error {
	endpoint := fmt.Sprintf("%s/api/v1/alerts/%s/ack", c.baseURL, alertID)

	bodyBytes, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to marshal acknowledge payload: %w", err)
	}

	_, err = c.cb.Execute(func() (interface{}, error) {
		return c.doWithRetries(ctx, http.MethodPatch, endpoint, bodyBytes)
	})
	if err != nil {
		if err == gobreaker.ErrOpenState || err == gobreaker.ErrTooManyRequests {
			return fmt.Errorf("alert circuit breaker open, refusing request: %w", err)
		}
		return err
	}

	return nil
}

// LogIntervention executes a POST request to record operator actions for RL feedback.
func (c *AlertBridgeClient) LogIntervention(ctx context.Context, payload *models.InterventionPayload) error {
	endpoint := fmt.Sprintf("%s/api/v1/alerts/interventions", c.baseURL)

	bodyBytes, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to marshal intervention payload: %w", err)
	}

	_, err = c.cb.Execute(func() (interface{}, error) {
		return c.doWithRetries(ctx, http.MethodPost, endpoint, bodyBytes)
	})
	if err != nil {
		if err == gobreaker.ErrOpenState || err == gobreaker.ErrTooManyRequests {
			return fmt.Errorf("alert circuit breaker open, refusing request: %w", err)
		}
		return err
	}

	return nil
}

// doWithRetries performs the actual HTTP dispatch with exponential backoff and jitter.
// It is method-agnostic, handling both GET and POST/PATCH payloads.
func (c *AlertBridgeClient) doWithRetries(ctx context.Context, method, endpoint string, bodyBytes []byte) ([]byte, error) {
	var lastErr error

	for attempt := 0; attempt < c.maxRetries; attempt++ {
		if attempt > 0 {
			baseBackoff := time.Duration(math.Pow(2, float64(attempt-1))) * c.initialBackoff
			jitter := time.Duration(rand.Int63n(int64(baseBackoff)/4 + 1)) // +/- up to 25%
			backoff := baseBackoff + jitter

			select {
			case <-time.After(backoff):
			case <-ctx.Done():
				return nil, fmt.Errorf("context cancelled during retry backoff: %w", ctx.Err())
			}
			log.Printf("[WARN] retrying Alert Microservice request, attempt %d, backoff %s", attempt+1, backoff)
		}

		var req *http.Request
		var err error
		if bodyBytes != nil {
			req, err = http.NewRequestWithContext(ctx, method, endpoint, bytes.NewReader(bodyBytes))
		} else {
			req, err = http.NewRequestWithContext(ctx, method, endpoint, nil)
		}

		if err != nil {
			return nil, fmt.Errorf("failed to create request: %w", err)
		}

		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Gateway-Token", c.serviceKey)

		resp, err := c.httpClient.Do(req)
		if err != nil {
			lastErr = fmt.Errorf("alert microservice request failed: %w", err)
			continue // network error / timeout -> retryable
		}

		respBody, readErr := io.ReadAll(io.LimitReader(resp.Body, maxAlertResponseBodyBytes))
		resp.Body.Close()
		if readErr != nil {
			lastErr = fmt.Errorf("failed to read alert microservice response body: %w", readErr)
			continue
		}

		switch {
		case resp.StatusCode >= 200 && resp.StatusCode < 300:
			return respBody, nil

		case resp.StatusCode >= 500:
			// Transient server-side failure -> retryable
			lastErr = fmt.Errorf("alert microservice returned status [%d]: %s", resp.StatusCode, string(respBody))
			continue

		default:
			// 4xx: payload rejected -- retrying identical bytes won't help, fail fast
			return nil, fmt.Errorf("alert microservice rejected request, status [%d]: %s", resp.StatusCode, string(respBody))
		}
	}

	return nil, fmt.Errorf("alert microservice unavailable after %d attempts: %w", c.maxRetries, lastErr)
}
