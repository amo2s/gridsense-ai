package interventionoutcomes

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"gateway/database"

	"github.com/jackc/pgx/v5"
	"go.opentelemetry.io/otel"
)

// ==========================================
// 1. DATA CONTRACTS
// ==========================================

// ShapAttribution mirrors handlers.ShapAttribution. Duplicated here rather than
// imported to keep this package decoupled from the handlers package — adjust
// the import path instead if you'd rather share the type.
type ShapAttribution struct {
	FeatureName  string  `json:"feature_name"`
	Contribution float64 `json:"contribution"`
}

type ActionTaken string

const (
	ActionDispatched ActionTaken = "dispatched"
	ActionDeferred   ActionTaken = "deferred"
	ActionIgnored    ActionTaken = "ignored"
)

func (a ActionTaken) Valid() bool {
	switch a {
	case ActionDispatched, ActionDeferred, ActionIgnored:
		return true
	default:
		return false
	}
}

// InterventionSeed is written once, right after a ranking is persisted,
// before any operator action has occurred. action_taken defaults to
// 'ignored' at seed time and is updated later via RecordAction.
type InterventionSeed struct {
	InterventionID          string
	FeederID                string
	PredictedPriorityScore  float64
	PredictedPriorityTier   string
	ShapTopFeatures         []ShapAttribution
	OutcomeWindowHours      int // 0 -> defaults to 24 in SQL
}

var ErrOutcomeNotFound = errors.New("intervention outcome not found")

// ==========================================
// 2. INTERFACE
// ==========================================

type Repository interface {
	// SeedOutcomes bulk-inserts one row per ranked recommendation with a
	// default action_taken of 'ignored'. Called from the same background
	// goroutine that persists the ranking in handlers.go.
	SeedOutcomes(ctx context.Context, seeds []InterventionSeed) error

	// RecordAction updates a previously seeded row when an operator actually
	// acts on a recommendation (dispatch/defer). Fails with ErrOutcomeNotFound
	// if the intervention_id wasn't seeded first.
	RecordAction(ctx context.Context, interventionID string, action ActionTaken, takenAt time.Time) error
}

// ==========================================
// 3. IMPLEMENTATION
// ==========================================

var tracer = otel.Tracer("gateway/intervention_outcomes")

type pgxRepo struct {
	db *database.PostgresDB
}

func NewSQLRepository(db *database.PostgresDB) Repository {
	return &pgxRepo{db: db}
}

func (r *pgxRepo) SeedOutcomes(ctx context.Context, seeds []InterventionSeed) error {
	if len(seeds) == 0 {
		return nil
	}

	ctx, span := tracer.Start(ctx, "DB.SeedOutcomes")
	defer span.End()

	const query = `
		INSERT INTO intervention_outcomes
		(intervention_id, feeder_id, predicted_priority_score, predicted_priority_tier,
		 shap_top_features, action_taken, action_taken_at, outcome_window_hours)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		ON CONFLICT (intervention_id) DO NOTHING
	`
	// ON CONFLICT DO NOTHING: if a ranking run is retried/re-persisted for
	// the same intervention_id, we don't want to clobber an outcome row that
	// may have already been updated by a real operator action.

	batch := &pgx.Batch{}
	queuedIDs := make([]string, 0, len(seeds))

	for _, s := range seeds {
		shapJSON, err := json.Marshal(s.ShapTopFeatures)
		if err != nil {
			return fmt.Errorf("failed to encode shap features for intervention_id=%s: %w", s.InterventionID, err)
		}

		windowHours := s.OutcomeWindowHours
		if windowHours <= 0 {
			windowHours = 24
		}

		queuedIDs = append(queuedIDs, s.InterventionID)
		batch.Queue(query,
			s.InterventionID,
			s.FeederID,
			s.PredictedPriorityScore,
			s.PredictedPriorityTier,
			shapJSON,
			ActionIgnored, // default until an operator acts
			time.Now(),
			windowHours,
		)
	}

	br := r.db.Pool.SendBatch(ctx, batch)
	defer br.Close()

	for i := range queuedIDs {
		if _, err := br.Exec(); err != nil {
			return fmt.Errorf("seed insert failed at row %d (intervention_id=%s): %w", i, queuedIDs[i], err)
		}
	}

	return nil
}

func (r *pgxRepo) RecordAction(ctx context.Context, interventionID string, action ActionTaken, takenAt time.Time) error {
	if !action.Valid() {
		return fmt.Errorf("invalid action_taken value: %q", action)
	}

	ctx, span := tracer.Start(ctx, "DB.RecordAction")
	defer span.End()

	const query = `
		UPDATE intervention_outcomes
		SET action_taken = $1, action_taken_at = $2
		WHERE intervention_id = $3
	`

	tag, err := r.db.Pool.Exec(ctx, query, action, takenAt, interventionID)
	if err != nil {
		return fmt.Errorf("failed to record action for intervention_id=%s: %w", interventionID, err)
	}
	if tag.RowsAffected() == 0 {
		return ErrOutcomeNotFound
	}

	return nil
}