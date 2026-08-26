package bridge

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"math"
	"math/rand"
	"net/http"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
	"github.com/sony/gobreaker"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/codes"
)

// ==========================================
// 1. DATA CONTRACTS & ERRORS
// ==========================================

var (
	ErrAIUpstream       = errors.New("engine c upstream error")
	ErrAIValidation     = errors.New("engine c rejected payload (4xx)")
	ErrContextCancelled = errors.New("context cancelled")
)

type LayerFlags struct {
	Layer1Stat  bool `json:"layer1_stat"`
	Layer2Seas  bool `json:"layer2_seas"`
	Layer3Multi bool `json:"layer3_multi"`
}

type AttributionFactor struct {
	Feature   string  `json:"feature"`
	Magnitude float64 `json:"magnitude"`
	Source    string  `json:"source"`
}

type AnomalyResponse struct {
	FeederID           string              `json:"feeder_id"`
	Timestamp          time.Time           `json:"timestamp"`
	IsAnomaly          bool                `json:"is_anomaly"`
	Severity           string              `json:"severity"`
	ConfidenceScore    float64             `json:"confidence_score"`
	LayerFlags         LayerFlags          `json:"layer_flags"`
	RankedAttributions []AttributionFactor `json:"ranked_attributions"`
	Reasons            []string            `json:"reasons"`
	InferenceLatencyMs float64             `json:"inference_latency_ms"`
	ModelVersion       string              `json:"model_version"`
}

// ==========================================
// 2. OBSERVABILITY
// ==========================================

var (
	anomalyTracer = otel.Tracer("bridge/engine_c")

	engineCLatency = promauto.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "engine_c_inference_duration_seconds",
		Help:    "Latency of Engine C anomaly detection requests",
		Buckets: prometheus.DefBuckets,
	}, []string{"status"})

	engineCErrorCounter = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "engine_c_errors_total",
		Help: "Total errors originating from Engine C communications",
	}, []string{"type"})
)

// ==========================================
// 3. INTERFACE & IMPLEMENTATION
// ==========================================

// EngineCClient defines the strict interface boundary for Engine C interaction.
type EngineCClient interface {
	Detect(ctx context.Context, payload []byte) (*AnomalyResponse, error)
}

type engineCClientImpl struct {
	url        string
	token      string
	httpClient *http.Client
	cb         *gobreaker.CircuitBreaker
}

// NewEngineCClient initializes the resilient HTTP client.
func NewEngineCClient(url, token string) EngineCClient {
	return &engineCClientImpl{
		url:   url,
		token: token,
		httpClient: &http.Client{
			Transport: &http.Transport{
				MaxIdleConns:        100,
				MaxIdleConnsPerHost: 100,
				IdleConnTimeout:     90 * time.Second,
			},
		},
		// Circuit breaker trips after 3 consecutive exhausted retries
		cb: gobreaker.NewCircuitBreaker(gobreaker.Settings{
			Name:        "EngineCCircuitBreaker",
			MaxRequests: 5,
			Interval:    10 * time.Second,
			Timeout:     30 * time.Second,
			ReadyToTrip: func(counts gobreaker.Counts) bool {
				return counts.ConsecutiveFailures > 3
			},
		}),
	}
}

// Detect executes the request wrapped in distributed tracing and the circuit breaker.
func (c *engineCClientImpl) Detect(ctx context.Context, payloadBytes []byte) (*AnomalyResponse, error) {
	ctx, span := anomalyTracer.Start(ctx, "EngineC.Detect")
	defer span.End()

	start := time.Now()

	result, err := c.cb.Execute(func() (interface{}, error) {
		return c.doWithRetries(ctx, payloadBytes)
	})

	duration := time.Since(start).Seconds()

	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())

		if errors.Is(err, gobreaker.ErrOpenState) {
			engineCErrorCounter.WithLabelValues("circuit_breaker_open").Inc()
		}

		engineCLatency.WithLabelValues("error").Observe(duration)
		return nil, err
	}

	engineCLatency.WithLabelValues("success").Observe(duration)
	return result.(*AnomalyResponse), nil
}

// doWithRetries executes exponential backoff with jitter for 5xx/network errors, and fails fast for 4xx errors.
func (c *engineCClientImpl) doWithRetries(ctx context.Context, payloadBytes []byte) (*AnomalyResponse, error) {
	var lastErr error
	const maxRetries = 3
	const initialBackoff = 200 * time.Millisecond

	for attempt := 0; attempt < maxRetries; attempt++ {
		if attempt > 0 {
			baseBackoff := time.Duration(math.Pow(2, float64(attempt-1))) * initialBackoff
			jitter := time.Duration(rand.Int63n(int64(baseBackoff) / 4)) // 25% Jitter
			backoff := baseBackoff + jitter

			select {
			case <-time.After(backoff):
			case <-ctx.Done():
				return nil, fmt.Errorf("%w: %v", ErrContextCancelled, ctx.Err())
			}
			slog.Warn("retrying Engine C inference", "attempt", attempt+1, "backoff", backoff)
		}

		req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.url, bytes.NewReader(payloadBytes))
		if err != nil {
			return nil, fmt.Errorf("failed to build request: %w", err)
		}
		
		req.Header.Set("Content-Type", "application/json")
		// Constant-time authentication token required by Engine C
		req.Header.Set("X-Internal-Service-Key", c.token)

		resp, err := c.httpClient.Do(req)
		if err != nil {
			lastErr = fmt.Errorf("%w: %v", ErrAIUpstream, err)
			engineCErrorCounter.WithLabelValues("network_error").Inc()
			continue
		}

		body, readErr := io.ReadAll(io.LimitReader(resp.Body, 1<<20)) // 1MB limit
		resp.Body.Close()

		if readErr != nil {
			lastErr = fmt.Errorf("%w: failed to read body: %v", ErrAIUpstream, readErr)
			engineCErrorCounter.WithLabelValues("io_error").Inc()
			continue
		}

		switch {
		case resp.StatusCode == http.StatusOK:
			var anomalyResp AnomalyResponse
			if err := json.Unmarshal(body, &anomalyResp); err != nil {
				return nil, fmt.Errorf("failed to decode response: %w", err)
			}
			return &anomalyResp, nil

		case resp.StatusCode >= 500:
			lastErr = fmt.Errorf("%w: status %d", ErrAIUpstream, resp.StatusCode)
			engineCErrorCounter.WithLabelValues("server_error").Inc()
			continue // Transient remote error -> retry

		default:
			// 4xx: Invalid payload contract, no retry
			engineCErrorCounter.WithLabelValues("validation_error").Inc()
			return nil, fmt.Errorf("%w: status %d: %s", ErrAIValidation, resp.StatusCode, string(body))
		}
	}

	return nil, fmt.Errorf("Engine C unavailable after %d attempts: %w", maxRetries, lastErr)
}