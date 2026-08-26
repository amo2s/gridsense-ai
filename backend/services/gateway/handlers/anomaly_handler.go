package handlers

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
	"os"
	"strings"
	"time"

	"gateway/database" // Adjust import path to match your project structure

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
	"github.com/sony/gobreaker"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/codes"
	"golang.org/x/sync/singleflight"
)

// ==========================================
// 1. ENGINE C DATA CONTRACTS (Phase 4 Alignment)
// ==========================================

type EngineCTelemetryReading struct {
	FeederID     string    `json:"feeder_id"`
	Timestamp    time.Time `json:"timestamp"`
	Voltage      float64   `json:"voltage"`
	Load         float64   `json:"load"`
	Frequency    float64   `json:"frequency"`
	Availability float64   `json:"availability"`
}

type AnomalyRequest struct {
	Readings []EngineCTelemetryReading `json:"readings"`
}

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
// 2. CONFIG & METRICS
// ==========================================

type EngineCConfig struct {
	EngineCURL   string
	ServiceToken string
}

func LoadEngineCConfig() EngineCConfig {
	url := os.Getenv("ENGINE_C_URL")
	if url == "" {
		url = "http://localhost:8000/internal/v1/anomalies/detect"
	}
	token := os.Getenv("ENGINE_C_INTERNAL_KEY")
	if token == "" {
		token = "default-fallback-insecure-key"
	}
	return EngineCConfig{EngineCURL: url, ServiceToken: token}
}

var (
	anomalyTracer = otel.Tracer("handlers/anomaly_engine_c")

	engineCLatency = promauto.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "engine_c_inference_duration_seconds",
		Help:    "Latency of Engine C anomaly detection requests",
		Buckets: prometheus.DefBuckets,
	}, []string{"status"})

	engineCErrorCounter = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "engine_c_errors_total",
		Help: "Total errors originating from Engine C communications",
	}, []string{"type"})

	anomalyCacheHits = promauto.NewCounter(prometheus.CounterOpts{
		Name: "anomaly_singleflight_dedup_total",
		Help: "Total number of concurrent identical Engine C requests collapsed",
	})
)

// ==========================================
// 3. INTERFACES
// ==========================================

type AnomalyRepository interface {
	FetchEngineCTelemetry(ctx context.Context, feederID string) ([]EngineCTelemetryReading, error)
	PersistAnomaly(ctx context.Context, resp AnomalyResponse) error
}

type EngineCClient interface {
	Detect(ctx context.Context, payload []byte) (*AnomalyResponse, error)
}

// ==========================================
// 4. RESILIENT AI CLIENT (Step 7.2)
// ==========================================

type engineCClientImpl struct {
	url        string
	token      string
	httpClient *http.Client
	cb         *gobreaker.CircuitBreaker
}

func NewEngineCClient(cfg EngineCConfig) EngineCClient {
	return &engineCClientImpl{
		url:   cfg.EngineCURL,
		token: cfg.ServiceToken,
		httpClient: &http.Client{
			Transport: &http.Transport{
				MaxIdleConns:        100,
				MaxIdleConnsPerHost: 100,
				IdleConnTimeout:     90 * time.Second,
			},
		},
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

func (c *engineCClientImpl) doWithRetries(ctx context.Context, payloadBytes []byte) (*AnomalyResponse, error) {
	var lastErr error
	const maxRetries = 3
	const initialBackoff = 200 * time.Millisecond

	for attempt := 0; attempt < maxRetries; attempt++ {
		if attempt > 0 {
			baseBackoff := time.Duration(math.Pow(2, float64(attempt-1))) * initialBackoff
			jitter := time.Duration(rand.Int63n(int64(baseBackoff) / 4))
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

		// Mandatory Step 5.3.2 / 6.1.1 Authorization
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Internal-Service-Key", c.token)

		resp, err := c.httpClient.Do(req)
		if err != nil {
			lastErr = fmt.Errorf("%w: %v", ErrAIUpstream, err)
			engineCErrorCounter.WithLabelValues("network_error").Inc()
			continue
		}

		body, readErr := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
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
			continue

		default:
			engineCErrorCounter.WithLabelValues("validation_error").Inc()
			return nil, fmt.Errorf("%w: status %d: %s", ErrAIValidation, resp.StatusCode, string(body))
		}
	}

	return nil, fmt.Errorf("Engine C unavailable after %d attempts: %w", maxRetries, lastErr)
}

// ==========================================
// 5. DATABASE REPOSITORY (Step 7.1 & 7.3)
// ==========================================

type pgxAnomalyRepo struct {
	db *database.PostgresDB
}

func NewSQLAnomalyRepo(db *database.PostgresDB) AnomalyRepository {
	return &pgxAnomalyRepo{db: db}
}

func (r *pgxAnomalyRepo) FetchEngineCTelemetry(ctx context.Context, feederID string) ([]EngineCTelemetryReading, error) {
	ctx, span := anomalyTracer.Start(ctx, "DB.FetchEngineCTelemetry")
	defer span.End()

	// Step 7.1.1: Fetch sliding window for Engine C (Requires Frequency & Availability)
	const query = `
		SELECT timestamp, voltage, load, COALESCE(frequency, 50.0), COALESCE(availability, 1.0)
		FROM power_readings 
		WHERE feeder_id = $1
		ORDER BY timestamp DESC
		LIMIT 24
	`

	rows, err := r.db.Pool.Query(ctx, query, feederID)
	if err != nil {
		return nil, fmt.Errorf("query failed: %w", err)
	}
	defer rows.Close()

	var readings []EngineCTelemetryReading
	for rows.Next() {
		reading := EngineCTelemetryReading{FeederID: feederID}
		if err := rows.Scan(&reading.Timestamp, &reading.Voltage, &reading.Load, &reading.Frequency, &reading.Availability); err != nil {
			return nil, fmt.Errorf("scan failed: %w", err)
		}
		readings = append(readings, reading)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iteration error: %w", err)
	}

	if len(readings) < 24 {
		return nil, ErrInsufficientData
	}

	// Reverse to satisfy Engine C strictly-ascending timestamp validation
	for i, j := 0, len(readings)-1; i < j; i, j = i+1, j-1 {
		readings[i], readings[j] = readings[j], readings[i]
	}

	return readings, nil
}

func (r *pgxAnomalyRepo) PersistAnomaly(ctx context.Context, p AnomalyResponse) error {
	ctx, span := anomalyTracer.Start(ctx, "DB.PersistAnomaly")
	defer span.End()

	// Step 7.3.1: Persist feeder_id, detected_at, type, severity, score, and explanation
	const query = `
		INSERT INTO anomalies 
		(feeder_id, detected_at, type, severity, score, explanation) 
		VALUES ($1, $2, $3, $4, $5, $6)
	`

	// Convert array of deterministic reasons to a readable text explanation
	explanation := strings.Join(p.Reasons, " | ")
	anomalyType := "Multivariate_Ensemble"

	_, err := r.db.Pool.Exec(ctx, query,
		p.FeederID, p.Timestamp, anomalyType, p.Severity, p.ConfidenceScore, explanation,
	)
	if err != nil {
		return fmt.Errorf("insert into anomalies failed: %w", err)
	}
	return nil
}

var _ = pgx.ErrNoRows

// ==========================================
// 6. HTTP HANDLER EXECUTION
// ==========================================

type AnomalyHandler struct {
	repo       AnomalyRepository
	aiClient   EngineCClient
	requestGrp singleflight.Group
}

func NewAnomalyHandler(repo AnomalyRepository, aiClient EngineCClient) *AnomalyHandler {
	return &AnomalyHandler{
		repo:     repo,
		aiClient: aiClient,
	}
}

func (h *AnomalyHandler) DetectAnomaly(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
	defer cancel()

	ctx, span := anomalyTracer.Start(ctx, "HTTP.DetectAnomaly")
	defer span.End()

	feederID := r.URL.Query().Get("feeder_id")
	if _, err := uuid.Parse(feederID); err != nil {
		span.RecordError(err)
		http.Error(w, ErrInvalidUUID.Error(), http.StatusBadRequest)
		return
	}

	// Singleflight deduplication to prevent slamming Engine C for concurrent UI renders
	v, err, shared := h.requestGrp.Do(feederID, func() (interface{}, error) {
		return h.processAnomalyRequest(ctx, feederID)
	})

	if shared {
		anomalyCacheHits.Inc()
	}

	if err != nil {
		span.RecordError(err)
		h.handleError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(v.(*AnomalyResponse)); err != nil {
		slog.Error("failed to write Engine C response", "feeder_id", feederID, "error", err)
	}
}

func (h *AnomalyHandler) processAnomalyRequest(ctx context.Context, feederID string) (*AnomalyResponse, error) {
	readings, err := h.repo.FetchEngineCTelemetry(ctx, feederID)
	if err != nil {
		slog.Error("Engine C telemetry lookup failed", "feeder_id", feederID, "error", err)
		if errors.Is(err, ErrFeederNotFound) || errors.Is(err, ErrInsufficientData) {
			return nil, err
		}
		return nil, fmt.Errorf("database retrieval failed: %w", err)
	}

	payloadBytes, err := json.Marshal(AnomalyRequest{
		Readings: readings,
	})
	if err != nil {
		slog.Error("Engine C payload encode failed", "feeder_id", feederID, "error", err)
		return nil, fmt.Errorf("internal processing error: %w", err)
	}

	anomalyResult, err := h.aiClient.Detect(ctx, payloadBytes)
	if err != nil {
		slog.Error("Engine C inference failed", "feeder_id", feederID, "error", err)
		return nil, err
	}

	// Step 7.3: Asynchronous persistence if an anomaly is actually detected.
	if anomalyResult.IsAnomaly {
		go func(p AnomalyResponse) {
			bgCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			if err := h.repo.PersistAnomaly(bgCtx, p); err != nil {
				slog.Error("background anomaly persistence failed", "feeder_id", p.FeederID, "error", err)
			}
		}(*anomalyResult)
	}

	return anomalyResult, nil
}

func (h *AnomalyHandler) handleError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, ErrFeederNotFound):
		http.Error(w, err.Error(), http.StatusNotFound)
	case errors.Is(err, ErrInsufficientData):
		http.Error(w, err.Error(), http.StatusUnprocessableEntity)
	case errors.Is(err, ErrAIValidation):
		http.Error(w, err.Error(), http.StatusBadGateway)
	case errors.Is(err, gobreaker.ErrOpenState):
		http.Error(w, "AI service temporarily unavailable (circuit breaker open)", http.StatusServiceUnavailable)
	case errors.Is(err, ErrAIUpstream):
		http.Error(w, "AI service failed or timed out", http.StatusServiceUnavailable)
	default:
		http.Error(w, "Internal server error", http.StatusInternalServerError)
	}
}
