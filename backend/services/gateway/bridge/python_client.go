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

const maxResponseBodyBytes = 1 << 20 // 1 MiB cap, prevents unbounded read on a misbehaving response

// EngineAClient manages HTTP communication with the Python deterministic scoring microservice.
type EngineAClient struct {
	baseURL    string
	serviceKey string
	httpClient *http.Client
	cb         *gobreaker.CircuitBreaker

	maxRetries     int
	initialBackoff time.Duration
}

// NewEngineAClient initializes the bridge client with optimized connection pooling,
// jittered-backoff retry, and a circuit breaker to protect against a struggling
// or restarting Engine A instance.
func NewEngineAClient(baseURL, serviceKey string) *EngineAClient {
	return &EngineAClient{
		baseURL:    baseURL,
		serviceKey: serviceKey,
		httpClient: &http.Client{
			// NOTE: this is a per-attempt fallback ceiling, not the overall
			// request budget -- the caller's context (see ReliabilityHandler's
			// 8s timeout) is the real deadline and will typically win first,
			// since it wraps all retry attempts combined.
			Timeout: 10 * time.Second,
			Transport: &http.Transport{
				MaxIdleConns:        100,
				MaxIdleConnsPerHost: 20,
				IdleConnTimeout:     90 * time.Second,
			},
		},
		cb: gobreaker.NewCircuitBreaker(gobreaker.Settings{
			Name:        "EngineACircuitBreaker",
			MaxRequests: 5,
			Interval:    10 * time.Second,
			Timeout:     30 * time.Second,
			ReadyToTrip: func(counts gobreaker.Counts) bool {
				// Each EvaluateReliability call already retries internally
				// (up to maxRetries) before this counter increments, so this
				// threshold is in units of fully-exhausted-retry cycles, not
				// raw HTTP attempts.
				return counts.ConsecutiveFailures > 3
			},
			OnStateChange: func(name string, from gobreaker.State, to gobreaker.State) {
				log.Printf("[WARN] %s circuit breaker state change: %s -> %s", name, from, to)
			},
		}),
		maxRetries:     3,
		initialBackoff: 200 * time.Millisecond,
	}
}

// EvaluateReliability dispatches an OperationalPayload to Engine A and returns the calculated EgressPayload.
func (c *EngineAClient) EvaluateReliability(ctx context.Context, payload *models.OperationalPayload) (*models.EgressPayload, error) {
	bodyBytes, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal operational payload: %w", err)
	}

	result, err := c.cb.Execute(func() (interface{}, error) {
		return c.doWithRetries(ctx, bodyBytes)
	})
	if err != nil {
		if err == gobreaker.ErrOpenState || err == gobreaker.ErrTooManyRequests {
			return nil, fmt.Errorf("engine A circuit breaker open, refusing request: %w", err)
		}
		return nil, err
	}

	return result.(*models.EgressPayload), nil
}

// doWithRetries performs the actual HTTP dispatch, retrying transient
// failures (network errors, timeouts, 5xx) with exponential backoff plus
// jitter. 4xx responses are not retried -- they indicate the payload itself
// was rejected, and resending identical bytes will not change that.
func (c *EngineAClient) doWithRetries(ctx context.Context, bodyBytes []byte) (*models.EgressPayload, error) {
	endpoint := fmt.Sprintf("%s/api/v1/reliability/evaluate", c.baseURL)

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
			log.Printf("[WARN] retrying Engine A evaluation, attempt %d, backoff %s", attempt+1, backoff)
		}

		req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(bodyBytes))
		if err != nil {
			return nil, fmt.Errorf("failed to create request: %w", err)
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Gateway-Token", c.serviceKey)

		resp, err := c.httpClient.Do(req)
		if err != nil {
			lastErr = fmt.Errorf("engine A request failed: %w", err)
			continue // network error / timeout -> retryable
		}

		respBody, readErr := io.ReadAll(io.LimitReader(resp.Body, maxResponseBodyBytes))
		resp.Body.Close()
		if readErr != nil {
			lastErr = fmt.Errorf("failed to read engine A response body: %w", readErr)
			continue
		}

		switch {
		case resp.StatusCode == http.StatusOK:
			var result models.EgressPayload
			if err := json.Unmarshal(respBody, &result); err != nil {
				return nil, fmt.Errorf("failed to decode engine A response: %w", err)
			}
			return &result, nil

		case resp.StatusCode >= 500:
			// Transient server-side failure -> retryable
			lastErr = fmt.Errorf("engine A returned status [%d]: %s", resp.StatusCode, string(respBody))
			continue

		default:
			// 4xx: payload rejected -- retrying identical bytes won't help, fail fast
			return nil, fmt.Errorf("engine A rejected request, status [%d]: %s", resp.StatusCode, string(respBody))
		}
	}

	return nil, fmt.Errorf("engine A unavailable after %d attempts: %w", c.maxRetries, lastErr)
}