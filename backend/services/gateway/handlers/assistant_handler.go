package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"time"

	"gateway/database"
	"gateway/models"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
	"github.com/sony/gobreaker"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/codes"
	"golang.org/x/sync/singleflight"
)

// ==========================================
// 1. ERRORS & METRICS
// ==========================================

var (
	ErrEmptyQuery        = errors.New("invalid request: query cannot be empty")
	ErrAssistantUpstream = errors.New("assistant upstream service error")
)

var (
	assistantTracer = otel.Tracer("handlers/assistant")

	assistantLatency = promauto.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "assistant_inference_duration_seconds",
		Help:    "Latency of AI Assistant microservice queries",
		Buckets: prometheus.DefBuckets,
	}, []string{"status"})

	assistantErrorCounter = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "assistant_errors_total",
		Help: "Total errors originating from Assistant microservice communications",
	}, []string{"type"})

	assistantCacheHits = promauto.NewCounter(prometheus.CounterOpts{
		Name: "assistant_singleflight_dedup_total",
		Help: "Total number of concurrent identical Assistant queries collapsed",
	})
)

// ==========================================
// 2. INTERFACES
// ==========================================

// AssistantAuditRepository isolates the PostgreSQL persistence boundary for Phase 5.2.
type AssistantAuditRepository interface {
	LogInteraction(ctx context.Context, queryText, feederID string, responsePayload []byte, latencyMS float64) error
}

// AssistantBridgeClient defines the communication interface to the Python AI service.
type AssistantBridgeClient interface {
	QueryAssistant(ctx context.Context, payload *models.GatewayQueryPayload) (*models.AssistantResponse, error)
}

// ==========================================
// 3. DATABASE REPOSITORY
// ==========================================

type pgxAssistantAuditRepo struct {
	db *database.PostgresDB
}

// NewSQLAssistantAuditRepo initializes the PostgreSQL audit repository.
func NewSQLAssistantAuditRepo(db *database.PostgresDB) AssistantAuditRepository {
	return &pgxAssistantAuditRepo{db: db}
}

// LogInteraction commits the interaction telemetry and serialized payload directly to PostgreSQL.
func (r *pgxAssistantAuditRepo) LogInteraction(ctx context.Context, queryText, feederID string, responsePayload []byte, latencyMS float64) error {
	ctx, span := assistantTracer.Start(ctx, "DB.LogInteraction")
	defer span.End()

	const query = `
		INSERT INTO assistant_audit_logs (
			query_text,
			feeder_id,
			response_payload,
			latency_ms,
			created_at
		) VALUES ($1, NULLIF($2, '')::uuid, $3, $4, NOW())
	`

	_, err := r.db.Pool.Exec(ctx, query, queryText, feederID, responsePayload, latencyMS)
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
		return fmt.Errorf("audit log insertion failed: %w", err)
	}

	return nil
}

// ==========================================
// 4. HTTP HANDLER EXECUTION
// ==========================================

// AssistantHandler manages frontend queries, circuit breaking, and background audit persistence.
type AssistantHandler struct {
	repo       AssistantAuditRepository
	aiClient   AssistantBridgeClient
	requestGrp singleflight.Group
}

// NewAssistantHandler constructs the complete handler with repository and client dependencies.
func NewAssistantHandler(repo AssistantAuditRepository, aiClient AssistantBridgeClient) *AssistantHandler {
	return &AssistantHandler{
		repo:     repo,
		aiClient: aiClient,
	}
}

// HandleQuery processes incoming operator queries from the Next.js frontend, routes them
// to the Python Assistant microservice, and writes audit telemetry to PostgreSQL.
func (h *AssistantHandler) HandleQuery(w http.ResponseWriter, r *http.Request) {
	// Generous 30s timeout budget to account for upstream LLM inference and hybrid RRF search
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	ctx, span := assistantTracer.Start(ctx, "HTTP.HandleQuery")
	defer span.End()

	// 1. Ingest and Validate Request Boundary
	var payload models.GatewayQueryPayload
	bodyBytes, err := io.ReadAll(io.LimitReader(r.Body, 1<<20)) // 1 MiB limit
	if err != nil {
		span.RecordError(err)
		http.Error(w, "Failed to read request body", http.StatusBadRequest)
		return
	}
	defer r.Body.Close()

	if err := json.Unmarshal(bodyBytes, &payload); err != nil {
		span.RecordError(err)
		http.Error(w, "Malformed JSON payload", http.StatusBadRequest)
		return
	}

	if len(payload.Query) == 0 {
		span.RecordError(ErrEmptyQuery)
		http.Error(w, ErrEmptyQuery.Error(), http.StatusBadRequest)
		return
	}

	// 2. Collapse Concurrent Identical Queries (Singleflight)
	cacheKey := fmt.Sprintf("%s:%s", payload.FeederID, payload.Query)
	start := time.Now()

	v, err, shared := h.requestGrp.Do(cacheKey, func() (interface{}, error) {
		return h.aiClient.QueryAssistant(ctx, &payload)
	})

	if shared {
		assistantCacheHits.Inc()
	}

	duration := time.Since(start).Seconds()

	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
		assistantLatency.WithLabelValues("error").Observe(duration)
		h.handleError(w, err)
		return
	}

	assistantLatency.WithLabelValues("success").Observe(duration)
	resp := v.(*models.AssistantResponse)

	// 3. Step 5.2: Asynchronously Record Interaction Audit Log to PostgreSQL
	latencyMS := float64(time.Since(start).Milliseconds())
	go func(q, fID string, rPayload *models.AssistantResponse, lat float64) {
		bgCtx, bgCancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer bgCancel()

		serialized, err := json.Marshal(rPayload)
		if err != nil {
			slog.Error("failed to serialize assistant response for audit logging", "error", err)
			return
		}

		if err := h.repo.LogInteraction(bgCtx, q, fID, serialized, lat); err != nil {
			slog.Error("background assistant audit logging failed", "error", err)
		}
	}(payload.Query, payload.FeederID, resp, latencyMS)

	// 4. Return Immediate JSON Egress to Frontend
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(resp); err != nil {
		slog.Error("failed to stream assistant response to client", "error", err)
	}
}

// handleError maps domain and infrastructure errors to standard HTTP status codes.
func (h *AssistantHandler) handleError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, ErrEmptyQuery):
		http.Error(w, err.Error(), http.StatusBadRequest)
	case errors.Is(err, gobreaker.ErrOpenState):
		assistantErrorCounter.WithLabelValues("circuit_breaker_open").Inc()
		http.Error(w, "AI assistant temporarily unavailable (circuit breaker open)", http.StatusServiceUnavailable)
	case errors.Is(err, gobreaker.ErrTooManyRequests):
		assistantErrorCounter.WithLabelValues("rate_limited").Inc()
		http.Error(w, "AI assistant overloaded, please try again", http.StatusTooManyRequests)
	default:
		assistantErrorCounter.WithLabelValues("upstream_error").Inc()
		http.Error(w, fmt.Sprintf("Assistant service error: %v", err), http.StatusBadGateway)
	}
}