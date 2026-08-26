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
	"time"

	"gateway/database"

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
// 1. DATA CONTRACTS
// ==========================================

type TelemetryReading struct {
	Timestamp        time.Time `json:"timestamp"`
	Voltage          float64   `json:"voltage"`
	Load             float64   `json:"load"`
	FaultCountRecent int       `json:"fault_count_recent"`
}

type PredictionRequest struct {
	FeederID string             `json:"feeder_id"`
	Readings []TelemetryReading `json:"readings"`
}

type ShapFactor struct {
	FeatureName  string  `json:"feature_name"`
	Contribution float64 `json:"contribution"`
}

type PredictionResponse struct {
	FeederID            string       `json:"feeder_id"`
	GeneratedAt         time.Time    `json:"generated_at"`
	HorizonHours        int          `json:"horizon_hours"`
	RiskScore           float64      `json:"risk_score"`
	RiskLevel           string       `json:"risk_level"`
	ModelVersion        string       `json:"model_version"`
	ContributingFactors []ShapFactor `json:"contributing_factors"`
}

// ==========================================
// 2. ERRORS & CONFIG
// ==========================================

var (
	ErrInvalidUUID      = errors.New("invalid feeder_id: must be a valid UUID")
	ErrFeederNotFound   = errors.New("feeder not found or has no telemetry history")
	ErrInsufficientData = errors.New("insufficient telemetry history")
	ErrAIUpstream       = errors.New("ai microservice upstream error")
	ErrAIValidation     = errors.New("ai microservice rejected payload")
	ErrContextCancelled = errors.New("context cancelled")
)

type Config struct {
	EngineBURL string
}

func LoadConfig() Config {
	url := os.Getenv("ENGINE_B_URL")
	if url == "" {
		url = "http://localhost:8000/internal/v1/predict"
	}
	return Config{EngineBURL: url}
}

// ==========================================
// 3. OBSERVABILITY
// ==========================================

var (
	tracer = otel.Tracer("handlers/prediction")

	inferenceLatency = promauto.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "engine_b_inference_duration_seconds",
		Help:    "Latency of Engine B prediction requests",
		Buckets: prometheus.DefBuckets,
	}, []string{"status"})

	errorCounter = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "engine_b_errors_total",
		Help: "Total errors originating from Engine B communications",
	}, []string{"type"})

	cacheHits = promauto.NewCounter(prometheus.CounterOpts{
		Name: "prediction_singleflight_dedup_total",
		Help: "Total number of concurrent identical requests collapsed",
	})
)

// ==========================================
// 4. INTERFACES
// ==========================================

type TelemetryRepository interface {
	FetchHistoricalTelemetry(ctx context.Context, feederID string) ([]TelemetryReading, error)
	PersistPrediction(ctx context.Context, p PredictionResponse) error
}

type AIClient interface {
	Predict(ctx context.Context, payload []byte) (*PredictionResponse, error)
}

// ==========================================
// 5. AI CLIENT IMPLEMENTATION
// ==========================================

type engineBClient struct {
	url        string
	httpClient *http.Client
	cb         *gobreaker.CircuitBreaker
}

func NewEngineBClient(cfg Config) AIClient {
	return &engineBClient{
		url: cfg.EngineBURL,
		httpClient: &http.Client{
			Transport: &http.Transport{
				MaxIdleConns:        100,
				MaxIdleConnsPerHost: 100,
				IdleConnTimeout:     90 * time.Second,
			},
		},
		cb: gobreaker.NewCircuitBreaker(gobreaker.Settings{
			Name:        "EngineBCircuitBreaker",
			MaxRequests: 5,
			Interval:    10 * time.Second,
			Timeout:     30 * time.Second,
			ReadyToTrip: func(counts gobreaker.Counts) bool {
				// NOTE: each Predict() call already retries internally (up to 3x)
				// before this counter increments, so a threshold of 3 here means
				// roughly 3 fully-exhausted-retry request cycles, not 3 raw HTTP
				// attempts. Tune down further (e.g. > 1) if you want the breaker
				// to trip faster during an Engine B outage.
				return counts.ConsecutiveFailures > 3
			},
		}),
	}
}

func (c *engineBClient) Predict(ctx context.Context, payloadBytes []byte) (*PredictionResponse, error) {
	ctx, span := tracer.Start(ctx, "EngineB.Predict")
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
			errorCounter.WithLabelValues("circuit_breaker_open").Inc()
		}

		inferenceLatency.WithLabelValues("error").Observe(duration)
		return nil, err
	}

	inferenceLatency.WithLabelValues("success").Observe(duration)
	return result.(*PredictionResponse), nil
}

func (c *engineBClient) doWithRetries(ctx context.Context, payloadBytes []byte) (*PredictionResponse, error) {
	var lastErr error
	const maxRetries = 3
	const initialBackoff = 200 * time.Millisecond
	const maxResponseBodyBytes = 1 << 20

	for attempt := 0; attempt < maxRetries; attempt++ {
		if attempt > 0 {
			baseBackoff := time.Duration(math.Pow(2, float64(attempt-1))) * initialBackoff
			jitter := time.Duration(rand.Int63n(int64(baseBackoff) / 4)) // 25% jitter
			backoff := baseBackoff + jitter

			select {
			case <-time.After(backoff):
			case <-ctx.Done():
				return nil, fmt.Errorf("%w: %v", ErrContextCancelled, ctx.Err())
			}
			slog.Warn("retrying Engine B inference", "attempt", attempt+1, "backoff", backoff)
		}

		req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.url, bytes.NewReader(payloadBytes))
		if err != nil {
			return nil, fmt.Errorf("failed to build request: %w", err)
		}
		req.Header.Set("Content-Type", "application/json")

		resp, err := c.httpClient.Do(req)
		if err != nil {
			lastErr = fmt.Errorf("%w: %v", ErrAIUpstream, err)
			errorCounter.WithLabelValues("network_error").Inc()
			continue
		}

		body, readErr := io.ReadAll(io.LimitReader(resp.Body, maxResponseBodyBytes))
		resp.Body.Close()

		if readErr != nil {
			lastErr = fmt.Errorf("%w: failed to read body: %v", ErrAIUpstream, readErr)
			errorCounter.WithLabelValues("io_error").Inc()
			continue
		}

		switch {
		case resp.StatusCode == http.StatusOK:
			var prediction PredictionResponse
			if err := json.Unmarshal(body, &prediction); err != nil {
				return nil, fmt.Errorf("failed to decode response: %w", err)
			}
			return &prediction, nil

		case resp.StatusCode >= 500:
			lastErr = fmt.Errorf("%w: status %d", ErrAIUpstream, resp.StatusCode)
			errorCounter.WithLabelValues("server_error").Inc()
			continue // Transient remote error -> retry

		default:
			// 4xx: Invalid payload contract, no retry
			errorCounter.WithLabelValues("validation_error").Inc()
			return nil, fmt.Errorf("%w: status %d: %s", ErrAIValidation, resp.StatusCode, string(body))
		}
	}

	return nil, fmt.Errorf("Engine B unavailable after %d attempts: %w", maxRetries, lastErr)
}

// ==========================================
// 6. DATABASE IMPLEMENTATION (pgx/pgxpool)
// ==========================================
//
// Uses *database.PostgresDB (wrapping *pgxpool.Pool), matching the pattern
// already established in database/database.go's FetchOperationalPayload --
// NOT database/sql. pgxpool.Pool methods take ctx as the first argument
// and have no "Context" suffix (Query, not QueryContext).

type pgxTelemetryRepo struct {
	db *database.PostgresDB
}

func NewSQLTelemetryRepo(db *database.PostgresDB) TelemetryRepository {
	return &pgxTelemetryRepo{db: db}
}

func (r *pgxTelemetryRepo) FetchHistoricalTelemetry(ctx context.Context, feederID string) ([]TelemetryReading, error) {
	ctx, span := tracer.Start(ctx, "DB.FetchHistoricalTelemetry")
	defer span.End()

	const query = `
		SELECT
			pr.timestamp,
			pr.voltage,
			pr.load,
			COALESCE((
				SELECT COUNT(*)
				FROM fault_events fe
				WHERE fe.feeder_id = pr.feeder_id
				  AND fe.timestamp <= pr.timestamp
				  AND fe.timestamp > pr.timestamp - INTERVAL '1 hour'
			), 0) AS fault_count_recent
		FROM power_readings pr
		WHERE pr.feeder_id = $1
		ORDER BY pr.timestamp DESC
		LIMIT 24
	`

	rows, err := r.db.Pool.Query(ctx, query, feederID)
	if err != nil {
		return nil, fmt.Errorf("query failed: %w", err)
	}
	defer rows.Close()

	var readings []TelemetryReading
	for rows.Next() {
		var reading TelemetryReading
		if err := rows.Scan(&reading.Timestamp, &reading.Voltage, &reading.Load, &reading.FaultCountRecent); err != nil {
			return nil, fmt.Errorf("scan failed: %w", err)
		}
		readings = append(readings, reading)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iteration error: %w", err)
	}

	if len(readings) == 0 {
		return nil, fmt.Errorf("%w: %s", ErrFeederNotFound, feederID)
	}

	// Reverse DESC -> ASC to satisfy Engine B's strictly-ascending Pydantic validator.
	for i, j := 0, len(readings)-1; i < j; i, j = i+1, j-1 {
		readings[i], readings[j] = readings[j], readings[i]
	}

	return readings, nil
}

func (r *pgxTelemetryRepo) PersistPrediction(ctx context.Context, p PredictionResponse) error {
	ctx, span := tracer.Start(ctx, "DB.PersistPrediction")
	defer span.End()

	const query = `
		INSERT INTO risk_predictions
		(feeder_id, generated_at, horizon, score, level, model_version, contributing_factors)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
	`

	factorsJSON, err := json.Marshal(p.ContributingFactors)
	if err != nil {
		return fmt.Errorf("failed to encode factors: %w", err)
	}

	_, err = r.db.Pool.Exec(ctx, query,
		p.FeederID, p.GeneratedAt, p.HorizonHours,
		p.RiskScore, p.RiskLevel, p.ModelVersion, factorsJSON,
	)
	if err != nil {
		return fmt.Errorf("insert into risk_predictions failed: %w", err)
	}
	return nil
}

// _ ensures pgx.ErrNoRows stays imported/referenced for callers that need
// to distinguish "no rows" from other query errors elsewhere in this package.
var _ = pgx.ErrNoRows

// ==========================================
// 7. HANDLER EXECUTION
// ==========================================

type PredictionHandler struct {
	repo       TelemetryRepository
	aiClient   AIClient
	requestGrp singleflight.Group // Idempotency / dedup cache
}

func NewPredictionHandler(repo TelemetryRepository, aiClient AIClient) *PredictionHandler {
	return &PredictionHandler{
		repo:     repo,
		aiClient: aiClient,
	}
}

func (h *PredictionHandler) ExecuteInference(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
	defer cancel()

	ctx, span := tracer.Start(ctx, "HTTP.ExecuteInference")
	defer span.End()

	feederID := r.URL.Query().Get("feeder_id")

	if _, err := uuid.Parse(feederID); err != nil {
		span.RecordError(err)
		http.Error(w, ErrInvalidUUID.Error(), http.StatusBadRequest)
		return
	}

	v, err, shared := h.requestGrp.Do(feederID, func() (interface{}, error) {
		return h.processInference(ctx, feederID)
	})

	if shared {
		cacheHits.Inc()
	}

	if err != nil {
		span.RecordError(err)
		h.handleError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(v.(*PredictionResponse)); err != nil {
		slog.Error("failed to write response", "feeder_id", feederID, "error", err)
	}
}

func (h *PredictionHandler) processInference(ctx context.Context, feederID string) (*PredictionResponse, error) {
	readings, err := h.repo.FetchHistoricalTelemetry(ctx, feederID)
	if err != nil {
		slog.Error("telemetry lookup failed", "feeder_id", feederID, "error", err)
		if errors.Is(err, ErrFeederNotFound) {
			return nil, err
		}
		return nil, fmt.Errorf("database retrieval failed: %w", err)
	}

	if len(readings) < 24 {
		return nil, ErrInsufficientData
	}

	payloadBytes, err := json.Marshal(PredictionRequest{
		FeederID: feederID,
		Readings: readings,
	})
	if err != nil {
		slog.Error("payload encode failed", "feeder_id", feederID, "error", err)
		return nil, fmt.Errorf("internal processing error: %w", err)
	}

	prediction, err := h.aiClient.Predict(ctx, payloadBytes)
	if err != nil {
		slog.Error("ai prediction failed", "feeder_id", feederID, "error", err)
		return nil, err
	}

	// Asynchronous persistence so the client isn't blocked on the DB write,
	// and response status isn't tied to persistence success.
	go func(p PredictionResponse) {
		bgCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := h.repo.PersistPrediction(bgCtx, p); err != nil {
			slog.Error("background prediction persistence failed", "feeder_id", p.FeederID, "error", err)
		}
	}(*prediction)

	return prediction, nil
}

func (h *PredictionHandler) handleError(w http.ResponseWriter, err error) {
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