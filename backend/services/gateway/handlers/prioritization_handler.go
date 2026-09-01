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

	interventionoutcomes "gateway/intervention_outcomes"

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
// 1. ENGINE D DATA CONTRACTS (Phase 2 Alignment)
// ==========================================

type MultiEngineSignals struct {
	FeederID          string  `json:"feeder_id"`
	ReliabilityScore  float64 `json:"reliability_score"`
	DurationPenalty   float64 `json:"duration_penalty"`
	FrequencyPenalty  float64 `json:"frequency_penalty"`
	RiskScore         float64 `json:"risk_score"`
	IsAnomaly         bool    `json:"is_anomaly"`
	AnomalyConfidence float64 `json:"anomaly_confidence"`
}

type PrioritizationRequest struct {
	QueryID string               `json:"query_id"`
	Assets  []MultiEngineSignals `json:"assets"`
}

type ShapAttribution struct {
	FeatureName  string  `json:"feature_name"`
	Contribution float64 `json:"contribution"`
}

type RankedAsset struct {
	FeederID      string            `json:"feeder_id"`
	RankPosition  int               `json:"rank_position"`
	PriorityScore float64           `json:"priority_score"`
	PriorityTier  string            `json:"priority_tier"`
	Explanations  []ShapAttribution `json:"explanations"`
	// InterventionID is generated at persist-time (not by Engine D) so that
	// Phase 6's intervention_outcomes table has a stable key to reference
	// this specific recommendation when the operator later acts on it.
	InterventionID string `json:"intervention_id,omitempty"`
}

type PrioritizationResponse struct {
	QueryID      string        `json:"query_id"`
	GeneratedAt  time.Time     `json:"generated_at"`
	ModelVersion string        `json:"model_version"`
	RankedAssets []RankedAsset `json:"ranked_assets"`
}

// ==========================================
// 2. ERRORS, CONFIG & METRICS
// ==========================================

var (
	ErrInvalidQueryID     = errors.New("invalid query_id: must be a valid UUID")
	ErrInsufficientAssets = errors.New("insufficient assets: ranking requires at least 2 assets")
)

type EngineDConfig struct {
	EngineDURL   string
	ServiceToken string
}

func LoadEngineDConfig() EngineDConfig {
	url := os.Getenv("ENGINE_D_URL")
	if url == "" {
		url = "http://localhost:8000/api/v1/priorities/rank"
	}
	token := os.Getenv("ENGINE_D_INTERNAL_KEY")
	if token == "" {
		token = "default-fallback-insecure-key"
	}
	return EngineDConfig{EngineDURL: url, ServiceToken: token}
}

var (
	prioritizationTracer = otel.Tracer("handlers/prioritization_engine_d")

	engineDLatency = promauto.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "engine_d_inference_duration_seconds",
		Help:    "Latency of Engine D prioritization requests",
		Buckets: prometheus.DefBuckets,
	}, []string{"status"})

	engineDErrorCounter = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "engine_d_errors_total",
		Help: "Total errors originating from Engine D communications",
	}, []string{"type"})

	prioritizationCacheHits = promauto.NewCounter(prometheus.CounterOpts{
		Name: "prioritization_singleflight_dedup_total",
		Help: "Total number of concurrent identical Engine D requests collapsed",
	})
)

// ==========================================
// 3. INTERFACES
// ==========================================

type PrioritizationRepository interface {
	FetchFusedSignals(ctx context.Context, queryID string) ([]MultiEngineSignals, error)
	// PersistPrioritization returns the map of feeder_id -> intervention_id
	// generated during the insert, so callers can seed intervention_outcomes
	// with the exact IDs that were just persisted.
	PersistPrioritization(ctx context.Context, resp PrioritizationResponse) (map[string]string, error)
}

type EngineDClient interface {
	Rank(ctx context.Context, payload []byte) (*PrioritizationResponse, error)
}

// ==========================================
// 4. RESILIENT AI CLIENT
// ==========================================

type engineDClientImpl struct {
	url        string
	token      string
	httpClient *http.Client
	cb         *gobreaker.CircuitBreaker
}

func NewEngineDClient(cfg EngineDConfig) EngineDClient {
	return &engineDClientImpl{
		url:   cfg.EngineDURL,
		token: cfg.ServiceToken,
		httpClient: &http.Client{
			Transport: &http.Transport{
				MaxIdleConns:        100,
				MaxIdleConnsPerHost: 100,
				IdleConnTimeout:     90 * time.Second,
			},
		},
		cb: gobreaker.NewCircuitBreaker(gobreaker.Settings{
			Name:        "EngineDCircuitBreaker",
			MaxRequests: 5,
			Interval:    10 * time.Second,
			Timeout:     30 * time.Second,
			ReadyToTrip: func(counts gobreaker.Counts) bool {
				return counts.ConsecutiveFailures > 3
			},
		}),
	}
}

func (c *engineDClientImpl) Rank(ctx context.Context, payloadBytes []byte) (*PrioritizationResponse, error) {
	ctx, span := prioritizationTracer.Start(ctx, "EngineD.Rank")
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
			engineDErrorCounter.WithLabelValues("circuit_breaker_open").Inc()
		}

		engineDLatency.WithLabelValues("error").Observe(duration)
		return nil, err
	}

	engineDLatency.WithLabelValues("success").Observe(duration)
	return result.(*PrioritizationResponse), nil
}

func (c *engineDClientImpl) doWithRetries(ctx context.Context, payloadBytes []byte) (*PrioritizationResponse, error) {
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
			slog.Warn("retrying Engine D inference", "attempt", attempt+1, "backoff", backoff)
		}

		req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.url, bytes.NewReader(payloadBytes))
		if err != nil {
			return nil, fmt.Errorf("failed to build request: %w", err)
		}

		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Internal-Service-Key", c.token)

		resp, err := c.httpClient.Do(req)
		if err != nil {
			lastErr = fmt.Errorf("%w: %v", ErrAIUpstream, err)
			engineDErrorCounter.WithLabelValues("network_error").Inc()
			continue
		}

		body, readErr := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
		resp.Body.Close()

		if readErr != nil {
			lastErr = fmt.Errorf("%w: failed to read body: %v", ErrAIUpstream, readErr)
			engineDErrorCounter.WithLabelValues("io_error").Inc()
			continue
		}

		switch {
		case resp.StatusCode == http.StatusOK:
			var prioritizationResp PrioritizationResponse
			if err := json.Unmarshal(body, &prioritizationResp); err != nil {
				return nil, fmt.Errorf("failed to decode response: %w", err)
			}
			return &prioritizationResp, nil

		case resp.StatusCode >= 500:
			lastErr = fmt.Errorf("%w: status %d", ErrAIUpstream, resp.StatusCode)
			engineDErrorCounter.WithLabelValues("server_error").Inc()
			continue

		default:
			engineDErrorCounter.WithLabelValues("validation_error").Inc()
			return nil, fmt.Errorf("%w: status %d: %s", ErrAIValidation, resp.StatusCode, string(body))
		}
	}

	return nil, fmt.Errorf("Engine D unavailable after %d attempts: %w", maxRetries, lastErr)
}

// ==========================================
// 5. DATABASE REPOSITORY
// ==========================================

type pgxPrioritizationRepo struct {
	db *database.PostgresDB
}

func NewSQLPrioritizationRepo(db *database.PostgresDB) PrioritizationRepository {
	return &pgxPrioritizationRepo{db: db}
}

func (r *pgxPrioritizationRepo) FetchFusedSignals(ctx context.Context, queryID string) ([]MultiEngineSignals, error) {
	ctx, span := prioritizationTracer.Start(ctx, "DB.FetchFusedSignals")
	defer span.End()

	// Joins materialized or latest outputs from Engines A, B, and C for all feeders in an area[cite: 1]
	const query = `
		WITH target_feeders AS (
			SELECT id FROM feeders WHERE area_id = $1
		)
		SELECT 
			f.id AS feeder_id,
			COALESCE(rs.score, 100) AS reliability_score,
			COALESCE(rs.duration_penalty, 0) AS duration_penalty,
			COALESCE(rs.frequency_penalty, 0) AS frequency_penalty,
			COALESCE(rp.score, 0) AS risk_score,
			COALESCE(an.score > 0.8, FALSE) AS is_anomaly,
			COALESCE(an.score, 0) AS anomaly_confidence
		FROM target_feeders f
		LEFT JOIN LATERAL (
			SELECT score, duration_penalty, frequency_penalty 
			FROM reliability_scores 
			WHERE feeder_id = f.id ORDER BY generated_at DESC LIMIT 1
		) rs ON true
		LEFT JOIN LATERAL (
			SELECT score 
			FROM risk_predictions 
			WHERE feeder_id = f.id ORDER BY generated_at DESC LIMIT 1
		) rp ON true
		LEFT JOIN LATERAL (
			SELECT score 
			FROM anomalies 
			WHERE feeder_id = f.id AND detected_at > NOW() - INTERVAL '24 hours' 
			ORDER BY detected_at DESC LIMIT 1
		) an ON true
	`

	rows, err := r.db.Pool.Query(ctx, query, queryID)
	if err != nil {
		return nil, fmt.Errorf("fusion query failed: %w", err)
	}
	defer rows.Close()

	var signals []MultiEngineSignals
	for rows.Next() {
		var sig MultiEngineSignals
		if err := rows.Scan(
			&sig.FeederID,
			&sig.ReliabilityScore,
			&sig.DurationPenalty,
			&sig.FrequencyPenalty,
			&sig.RiskScore,
			&sig.IsAnomaly,
			&sig.AnomalyConfidence,
		); err != nil {
			return nil, fmt.Errorf("scan failed: %w", err)
		}
		signals = append(signals, sig)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iteration error: %w", err)
	}

	if len(signals) < 2 {
		return nil, ErrInsufficientAssets
	}

	return signals, nil
}

// PersistPrioritization writes the ranked assets to the `priorities` table
// and generates one InterventionID per (query_id, feeder_id) row. It returns
// a feeder_id -> intervention_id map so callers can seed intervention_outcomes
// with the exact IDs that were just persisted.
//
// Assumes `priorities` has a UNIQUE constraint on (query_id, feeder_id)
// backing the ON CONFLICT clause, and an intervention_id UUID column.
func (r *pgxPrioritizationRepo) PersistPrioritization(ctx context.Context, p PrioritizationResponse) (map[string]string, error) {
	ctx, span := prioritizationTracer.Start(ctx, "DB.PersistPrioritization")
	defer span.End()

	batch := &pgx.Batch{}
	const query = `
		INSERT INTO priorities 
		(query_id, feeder_id, rank_position, priority_score, priority_tier, explanations, generated_at, intervention_id) 
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		ON CONFLICT (query_id, feeder_id) DO UPDATE SET
			rank_position = EXCLUDED.rank_position,
			priority_score = EXCLUDED.priority_score,
			priority_tier = EXCLUDED.priority_tier,
			explanations = EXCLUDED.explanations,
			generated_at = EXCLUDED.generated_at
			-- intervention_id intentionally NOT overwritten on conflict:
			-- if a row already exists, keep its original intervention_id
			-- so any outcomes already recorded against it stay valid.
	`

	interventionIDs := make(map[string]string, len(p.RankedAssets))
	queuedFeederIDs := make([]string, 0, len(p.RankedAssets))

	for _, asset := range p.RankedAssets {
		explanationsJSON, err := json.Marshal(asset.Explanations)
		if err != nil {
			slog.Error("failed to encode explanations", "feeder_id", asset.FeederID, "error", err)
			continue
		}

		interventionID := uuid.NewString()
		interventionIDs[asset.FeederID] = interventionID
		queuedFeederIDs = append(queuedFeederIDs, asset.FeederID)

		batch.Queue(query, p.QueryID, asset.FeederID, asset.RankPosition, asset.PriorityScore, asset.PriorityTier, explanationsJSON, p.GeneratedAt, interventionID)
	}

	br := r.db.Pool.SendBatch(ctx, batch)
	defer br.Close()

	for i := 0; i < len(queuedFeederIDs); i++ {
		if _, err := br.Exec(); err != nil {
			return nil, fmt.Errorf("batch insert failed at row %d (feeder_id=%s): %w", i, queuedFeederIDs[i], err)
		}
	}

	return interventionIDs, nil
}

var _ = pgx.ErrNoRows

// ==========================================
// 6. HTTP HANDLER EXECUTION
// ==========================================

type PrioritizationHandler struct {
	repo         PrioritizationRepository
	aiClient     EngineDClient
	outcomesRepo interventionoutcomes.Repository
	requestGrp   singleflight.Group
}

func NewPrioritizationHandler(repo PrioritizationRepository, aiClient EngineDClient, outcomesRepo interventionoutcomes.Repository) *PrioritizationHandler {
	return &PrioritizationHandler{
		repo:         repo,
		aiClient:     aiClient,
		outcomesRepo: outcomesRepo,
	}
}

func (h *PrioritizationHandler) RankInterventions(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
	defer cancel()

	ctx, span := prioritizationTracer.Start(ctx, "HTTP.RankInterventions")
	defer span.End()

	queryID := r.URL.Query().Get("query_id") // typically maps to an area_id[cite: 1]
	if _, err := uuid.Parse(queryID); err != nil {
		span.RecordError(err)
		http.Error(w, ErrInvalidQueryID.Error(), http.StatusBadRequest)
		return
	}

	v, err, shared := h.requestGrp.Do(queryID, func() (interface{}, error) {
		return h.processRankingRequest(ctx, queryID)
	})

	if shared {
		prioritizationCacheHits.Inc()
	}

	if err != nil {
		span.RecordError(err)
		h.handleError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(v.(*PrioritizationResponse)); err != nil {
		slog.Error("failed to write Engine D response", "query_id", queryID, "error", err)
	}
}

func (h *PrioritizationHandler) processRankingRequest(ctx context.Context, queryID string) (*PrioritizationResponse, error) {
	signals, err := h.repo.FetchFusedSignals(ctx, queryID)
	if err != nil {
		slog.Error("fused signals lookup failed", "query_id", queryID, "error", err)
		if errors.Is(err, ErrInsufficientAssets) {
			return nil, err
		}
		return nil, fmt.Errorf("database retrieval failed: %w", err)
	}

	payloadBytes, err := json.Marshal(PrioritizationRequest{
		QueryID: queryID,
		Assets:  signals,
	})
	if err != nil {
		slog.Error("Engine D payload encode failed", "query_id", queryID, "error", err)
		return nil, fmt.Errorf("internal processing error: %w", err)
	}

	rankingResult, err := h.aiClient.Rank(ctx, payloadBytes)
	if err != nil {
		slog.Error("Engine D inference failed", "query_id", queryID, "error", err)
		return nil, err
	}

	go func(p PrioritizationResponse) {
		bgCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()

		interventionIDs, err := h.repo.PersistPrioritization(bgCtx, p)
		if err != nil {
			slog.Error("background priority persistence failed", "query_id", p.QueryID, "error", err)
			return
		}

		if h.outcomesRepo == nil {
			return
		}

		seeds := make([]interventionoutcomes.InterventionSeed, 0, len(p.RankedAssets))
		for _, asset := range p.RankedAssets {
			id, ok := interventionIDs[asset.FeederID]
			if !ok {
				continue
			}
			seeds = append(seeds, interventionoutcomes.InterventionSeed{
				InterventionID:         id,
				FeederID:                asset.FeederID,
				PredictedPriorityScore:  asset.PriorityScore,
				PredictedPriorityTier:   asset.PriorityTier,
				ShapTopFeatures:         convertShapAttributions(asset.Explanations),
			})
		}

		if err := h.outcomesRepo.SeedOutcomes(bgCtx, seeds); err != nil {
			slog.Error("intervention outcome seeding failed", "query_id", p.QueryID, "error", err)
		}
	}(*rankingResult)

	return rankingResult, nil
}

// convertShapAttributions maps handlers.ShapAttribution to
// interventionoutcomes.ShapAttribution. The two types are structurally
// identical but kept separate so the outcomes package stays decoupled
// from this package.
func convertShapAttributions(in []ShapAttribution) []interventionoutcomes.ShapAttribution {
	out := make([]interventionoutcomes.ShapAttribution, len(in))
	for i, s := range in {
		out[i] = interventionoutcomes.ShapAttribution{
			FeatureName:  s.FeatureName,
			Contribution: s.Contribution,
		}
	}
	return out
}

func (h *PrioritizationHandler) handleError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, ErrInsufficientAssets):
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