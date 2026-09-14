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

// 2 MiB cap to safely accommodate generous LLM JSON responses without unbounded reads
const maxAssistantResponseBodyBytes = 2 << 20 

// AssistantClient manages HTTP communication with the Python AI Assistant microservice.
type AssistantClient struct {
	baseURL        string
	serviceKey     string
	httpClient     *http.Client
	cb             *gobreaker.CircuitBreaker

	maxRetries     int
	initialBackoff time.Duration
}

// NewAssistantClient initializes the bridge client with optimized connection pooling,
// jittered-backoff retry, and a circuit breaker to protect the Go Gateway from 
// cascading failures if the Cerebras API or Python service stalls.
func NewAssistantClient(baseURL, serviceKey string) *AssistantClient {
	return &AssistantClient{
		baseURL:    baseURL,
		serviceKey: serviceKey,
		httpClient: &http.Client{
			// LLM Inference requires a significantly higher per-attempt timeout than Engine A
			Timeout: 30 * time.Second,
			Transport: &http.Transport{
				MaxIdleConns:        100,
				MaxIdleConnsPerHost: 20,
				IdleConnTimeout:     90 * time.Second,
			},
		},
		cb: gobreaker.NewCircuitBreaker(gobreaker.Settings{
			Name:        "AssistantCircuitBreaker",
			MaxRequests: 5,
			Interval:    10 * time.Second,
			Timeout:     30 * time.Second,
			ReadyToTrip: func(counts gobreaker.Counts) bool {
				// Trips if 3 consecutive requests exhaust all their internal retries
				return counts.ConsecutiveFailures > 3
			},
			OnStateChange: func(name string, from gobreaker.State, to gobreaker.State) {
				log.Printf("[WARN] %s circuit breaker state change: %s -> %s", name, from, to)
			},
		}),
		maxRetries:     3,
		initialBackoff: 500 * time.Millisecond,
	}
}

// QueryAssistant dispatches a GatewayQueryPayload to the Python Assistant service and 
// returns the structured AssistantResponse.
func (c *AssistantClient) QueryAssistant(ctx context.Context, payload *models.GatewayQueryPayload) (*models.AssistantResponse, error) {
	bodyBytes, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal assistant payload: %w", err)
	}

	result, err := c.cb.Execute(func() (interface{}, error) {
		return c.doWithRetries(ctx, bodyBytes)
	})
	if err != nil {
		if err == gobreaker.ErrOpenState || err == gobreaker.ErrTooManyRequests {
			return nil, fmt.Errorf("assistant circuit breaker open, refusing request: %w", err)
		}
		return nil, err
	}

	return result.(*models.AssistantResponse), nil
}

// doWithRetries performs the HTTP POST dispatch to the Python microservice.
// Transient 5xx errors or timeouts trigger an exponential backoff with jitter.
// 4xx responses fail fast, as retrying a rejected payload is counterproductive.
func (c *AssistantClient) doWithRetries(ctx context.Context, bodyBytes []byte) (*models.AssistantResponse, error) {
	endpoint := fmt.Sprintf("%s/api/assistant/query", c.baseURL)

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
			log.Printf("[WARN] retrying AI Assistant query, attempt %d, backoff %s", attempt+1, backoff)
		}

		req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(bodyBytes))
		if err != nil {
			return nil, fmt.Errorf("failed to create request: %w", err)
		}
		
		req.Header.Set("Content-Type", "application/json")
		// Injects the security token verified by main.py's verify_internal_service_key middleware
		req.Header.Set("X-Internal-Service-Key", c.serviceKey)

		resp, err := c.httpClient.Do(req)
		if err != nil {
			lastErr = fmt.Errorf("assistant request failed: %w", err)
			continue // network error / timeout -> retryable
		}

		respBody, readErr := io.ReadAll(io.LimitReader(resp.Body, maxAssistantResponseBodyBytes))
		resp.Body.Close()
		if readErr != nil {
			lastErr = fmt.Errorf("failed to read assistant response body: %w", readErr)
			continue
		}

		switch {
		case resp.StatusCode == http.StatusOK:
			var result models.AssistantResponse
			if err := json.Unmarshal(respBody, &result); err != nil {
				return nil, fmt.Errorf("failed to decode assistant response: %w", err)
			}
			return &result, nil

		case resp.StatusCode >= 500:
			// Transient server-side failure -> retryable
			lastErr = fmt.Errorf("assistant returned status [%d]: %s", resp.StatusCode, string(respBody))
			continue

		default:
			// 4xx: payload rejected by Pydantic validation or Security Middleware -- fail fast
			return nil, fmt.Errorf("assistant rejected request, status [%d]: %s", resp.StatusCode, string(respBody))
		}
	}

	return nil, fmt.Errorf("assistant unavailable after %d attempts: %w", c.maxRetries, lastErr)
}