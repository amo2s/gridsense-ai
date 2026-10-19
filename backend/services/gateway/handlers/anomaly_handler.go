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
	"github.com/jackc/pgx/v5/pgxpool"
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

// EngineCIngestionRequest defines the incoming payload from the frontend baseline generator.
type EngineCIngestionRequest struct {
	FeederID     string                    `json:"feeder_id"`
	SubstationID *string                   `json:"substation_id,omitempty"`
	Readings     []EngineCIngestionReading `json:"readings"`
}

// EngineCIngestionReading represents a single temporal data point in the diurnal curve.
type EngineCIngestionReading struct {
	Timestamp    string  `json:"timestamp"`
	Voltage      float64 `json:"voltage"`
	Load         float64 `json:"load"`
	Frequency    float64 `json:"frequency"`
	Availability float64 `json:"availability"`
}

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
		url = "http://localhost:8003/internal/v1/anomalies/detect"
	} else {
		url = strings.TrimRight(url, "/")
		if !strings.HasSuffix(url, "/internal/v1/anomalies/detect") {
			if strings.HasSuffix(url, "/detect") {
				url = strings.TrimSuffix(url, "/detect") + "/internal/v1/anomalies/detect"
			} else {
				url = url + "/internal/v1/anomalies/detect"
			}
		}
	}
	token := mustGetEnv("ENGINE_C_INTERNAL_KEY")
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
	targetURL := cfg.EngineCURL
	if targetURL == "" {
		targetURL = "http://localhost:8003/internal/v1/anomalies/detect"
	} else {
		targetURL = strings.TrimRight(targetURL, "/")
		if !strings.HasSuffix(targetURL, "/internal/v1/anomalies/detect") {
			if strings.HasSuffix(targetURL, "/detect") {
				targetURL = strings.TrimSuffix(targetURL, "/detect") + "/internal/v1/anomalies/detect"
			} else {
				targetURL = targetURL + "/internal/v1/anomalies/detect"
			}
		}
	}

	return &engineCClientImpl{
		url:   targetURL,
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

		targetURL := c.url
		if !strings.HasSuffix(targetURL, "/internal/v1/anomalies/detect") {
			if strings.HasSuffix(targetURL, "/detect") {
				targetURL = strings.TrimSuffix(targetURL, "/detect") + "/internal/v1/anomalies/detect"
			} else {
				targetURL = fmt.Sprintf("%s/internal/v1/anomalies/detect", strings.TrimRight(targetURL, "/"))
			}
		}

		req, err := http.NewRequestWithContext(ctx, http.MethodPost, targetURL, bytes.NewReader(payloadBytes))
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

// AnomalyDB provides a transactional interface compatible with IngestEngineCTelemetry.
type AnomalyDB interface {
	BeginTx(ctx context.Context, opts interface{}) (TxInterface, error)
}

// TxInterface abstracts transaction lifecycle methods.
type TxInterface interface {
	Rollback() error
	Commit() error
	PrepareContext(ctx context.Context, query string) (StmtInterface, error)
}

// StmtInterface abstracts prepared statement execution.
type StmtInterface interface {
	ExecContext(ctx context.Context, args ...interface{}) (interface{}, error)
	Close() error
}

type pgxDBWrapper struct {
	pool *pgxpool.Pool
}

func (w *pgxDBWrapper) BeginTx(ctx context.Context, _ interface{}) (TxInterface, error) {
	tx, err := w.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	return &pgxTxWrapper{tx: tx, ctx: ctx}, nil
}

type pgxTxWrapper struct {
	tx  pgx.Tx
	ctx context.Context
}

func (t *pgxTxWrapper) Rollback() error {
	return t.tx.Rollback(t.ctx)
}

func (t *pgxTxWrapper) Commit() error {
	return t.tx.Commit(t.ctx)
}

func (t *pgxTxWrapper) PrepareContext(ctx context.Context, query string) (StmtInterface, error) {
	return &pgxStmtWrapper{tx: t.tx, query: query}, nil
}

type pgxStmtWrapper struct {
	tx    pgx.Tx
	query string
}

func (s *pgxStmtWrapper) ExecContext(ctx context.Context, args ...interface{}) (interface{}, error) {
	tag, err := s.tx.Exec(ctx, s.query, args...)
	return tag, err
}

func (s *pgxStmtWrapper) Close() error {
	return nil
}

// ==========================================
// 6. HTTP HANDLER EXECUTION
// ==========================================

type AnomalyHandler struct {
	repo       AnomalyRepository
	aiClient   EngineCClient
	requestGrp singleflight.Group
	DB         AnomalyDB
}

func NewAnomalyHandler(repo AnomalyRepository, aiClient EngineCClient, db ...*database.PostgresDB) *AnomalyHandler {
	var anomalyDB AnomalyDB
	if len(db) > 0 && db[0] != nil && db[0].Pool != nil {
		anomalyDB = &pgxDBWrapper{pool: db[0].Pool}
	} else if pgxRepo, ok := repo.(*pgxAnomalyRepo); ok && pgxRepo.db != nil && pgxRepo.db.Pool != nil {
		anomalyDB = &pgxDBWrapper{pool: pgxRepo.db.Pool}
	}
	return &AnomalyHandler{
		repo:     repo,
		aiClient: aiClient,
		DB:       anomalyDB,
	}
}

// IngestEngineCTelemetry handles manual operational telemetry ingestion payloads (Command Pathway).
// Implements an idempotent transactional PostgreSQL batch UPSERT (ON CONFLICT (feeder_id, timestamp))
// to persist the 24-hour diurnal baseline into the power_readings table.
func (h *AnomalyHandler) IngestEngineCTelemetry(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// 1. Context and Decode
	ctx := r.Context()
	var payload EngineCIngestionRequest

	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		slog.Error("Failed to decode Engine C ingestion payload", "error", err)
		http.Error(w, "Invalid JSON payload", http.StatusBadRequest)
		return
	}
	defer r.Body.Close()

	// 2. Validation Guardrails
	if payload.FeederID == "" {
		http.Error(w, "Missing feeder_id in payload", http.StatusBadRequest)
		return
	}
	if len(payload.Readings) == 0 {
		http.Error(w, "Payload must contain at least one telemetry reading", http.StatusBadRequest)
		return
	}

	// Ensure DB is initialized
	if h.DB == nil {
		if pgxRepo, ok := h.repo.(*pgxAnomalyRepo); ok && pgxRepo.db != nil && pgxRepo.db.Pool != nil {
			h.DB = &pgxDBWrapper{pool: pgxRepo.db.Pool}
		}
	}

	if h.DB == nil {
		slog.Error("Database connection not initialized on AnomalyHandler")
		http.Error(w, "Database unavailable", http.StatusInternalServerError)
		return
	}

	// 3. Database Transaction Lifecycle
	tx, err := h.DB.BeginTx(ctx, nil)
	if err != nil {
		slog.Error("Failed to initialize database transaction", "error", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	// Ensure rollback on panic or unhandled error
	defer func() {
		if p := recover(); p != nil {
			tx.Rollback()
			panic(p) // re-throw after rolling back
		} else if err != nil {
			tx.Rollback() // err is not nil, rollback
		} else {
			err = tx.Commit() // err is nil, attempt commit
		}
	}()

	// 4. Batch Execution with Idempotency
	query := `
        INSERT INTO power_readings (feeder_id, timestamp, voltage, load, frequency, availability)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (feeder_id, timestamp) 
        DO UPDATE SET
            voltage = EXCLUDED.voltage,
            load = EXCLUDED.load,
            frequency = EXCLUDED.frequency,
            availability = EXCLUDED.availability;
    `

	// Prepare statement for performance mapping
	stmt, err := tx.PrepareContext(ctx, query)
	if err != nil {
		slog.Error("Failed to prepare SQL statement", "error", err)
		http.Error(w, "Database preparation failure", http.StatusInternalServerError)
		return
	}
	defer stmt.Close()

	for _, reading := range payload.Readings {
		_, err = stmt.ExecContext(ctx, payload.FeederID, reading.Timestamp, reading.Voltage, reading.Load, reading.Frequency, reading.Availability)
		if err != nil {
			slog.Error("Failed to execute telemetry insert", "feeder_id", payload.FeederID, "timestamp", reading.Timestamp, "error", err)
			http.Error(w, "Failed to persist telemetry records", http.StatusInternalServerError)
			return
		}
	}

	// 5. RESTful Acknowledgment
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":            "success",
		"message":           fmt.Sprintf("Successfully ingested %d telemetry readings for feeder %s", len(payload.Readings), payload.FeederID),
		"records_processed": len(payload.Readings),
	})
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
