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
//
// ID must be the same UUID PersistPrioritization generated for this
// (query_id, feeder_id) row — it is the primary key of intervention_outcomes.
type InterventionSeed struct {
	ID                     string // primary key: intervention_outcomes.id
	QueryID                string
	FeederID               string
	PredictedPriorityScore float64
	PredictedPriorityTier  string
	ShapTopFeatures        []ShapAttribution
	OutcomeWindowHours     int // 0 -> defaults to 24 in SQL
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
	// if the id wasn't seeded first.
	RecordAction(ctx context.Context, id string, action ActionTaken, takenAt time.Time) error

	// RecordOutageCheck records whether an outage actually occurred within the
	// outcome window for this recommendation. Fails with ErrOutcomeNotFound if
	// the id wasn't seeded first.
	RecordOutageCheck(ctx context.Context, id string, outageOccurred bool, checkedAt time.Time) error

	// RecordReward writes the computed RL reward value for this recommendation,
	// once both the operator action and the outage outcome are known. Fails
	// with ErrOutcomeNotFound if the id wasn't seeded first.
	RecordReward(ctx context.Context, id string, rewardValue float64, computedAt time.Time) error
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

	// embedding and search_text are not written by this insert — see the note
	// on RecordOutageCheck for why.
	const query = `
		INSERT INTO intervention_outcomes
		(id, query_id, feeder_id, predicted_priority_score, predicted_priority_tier,
		 shap_top_features, action_taken, action_taken_at, outcome_window_hours)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		ON CONFLICT (id) DO NOTHING
	`
	// ON CONFLICT DO NOTHING: if a ranking run is retried/re-persisted for
	// the same id, we don't want to clobber an outcome row that may have
	// already been updated by a real operator action.

	batch := &pgx.Batch{}
	queuedIDs := make([]string, 0, len(seeds))

	for _, s := range seeds {
		shapJSON, err := json.Marshal(s.ShapTopFeatures)
		if err != nil {
			return fmt.Errorf("failed to encode shap features for id=%s: %w", s.ID, err)
		}

		windowHours := s.OutcomeWindowHours
		if windowHours <= 0 {
			windowHours = 24
		}

		queuedIDs = append(queuedIDs, s.ID)
		batch.Queue(query,
			s.ID,
			s.QueryID,
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
			return fmt.Errorf("seed insert failed at row %d (id=%s): %w", i, queuedIDs[i], err)
		}
	}

	return nil
}

func (r *pgxRepo) RecordAction(ctx context.Context, id string, action ActionTaken, takenAt time.Time) error {
	if !action.Valid() {
		return fmt.Errorf("invalid action_taken value: %q", action)
	}

	ctx, span := tracer.Start(ctx, "DB.RecordAction")
	defer span.End()

	const query = `
		UPDATE intervention_outcomes
		SET action_taken = $1, action_taken_at = $2
		WHERE id = $3
	`

	tag, err := r.db.Pool.Exec(ctx, query, action, takenAt, id)
	if err != nil {
		return fmt.Errorf("failed to record action for id=%s: %w", id, err)
	}
	if tag.RowsAffected() == 0 {
		return ErrOutcomeNotFound
	}

	return nil
}

// embedding and search_text are intentionally NOT written here.
//   - embedding: an AFTER INSERT/UPDATE trigger (trigger_intervention_outcomes_embedding)
//     fires notify_missing_embedding() whenever embedding IS NULL, so some other
//     worker is responsible for computing and writing it. Writing it here would
//     race that worker.
//   - search_text: no trigger populates it. If full-text search over this table
//     is needed, decide who writes it (this repo via to_tsvector(...), or the
//     same worker that fills embedding) before relying on it.
func (r *pgxRepo) RecordOutageCheck(ctx context.Context, id string, outageOccurred bool, checkedAt time.Time) error {
	ctx, span := tracer.Start(ctx, "DB.RecordOutageCheck")
	defer span.End()

	const query = `
		UPDATE intervention_outcomes
		SET outage_occurred = $1, outage_checked_at = $2
		WHERE id = $3
	`

	tag, err := r.db.Pool.Exec(ctx, query, outageOccurred, checkedAt, id)
	if err != nil {
		return fmt.Errorf("failed to record outage check for id=%s: %w", id, err)
	}
	if tag.RowsAffected() == 0 {
		return ErrOutcomeNotFound
	}

	return nil
}

func (r *pgxRepo) RecordReward(ctx context.Context, id string, rewardValue float64, computedAt time.Time) error {
	ctx, span := tracer.Start(ctx, "DB.RecordReward")
	defer span.End()

	const query = `
		UPDATE intervention_outcomes
		SET reward_value = $1, reward_computed_at = $2
		WHERE id = $3
	`

	tag, err := r.db.Pool.Exec(ctx, query, rewardValue, computedAt, id)
	if err != nil {
		return fmt.Errorf("failed to record reward for id=%s: %w", id, err)
	}
	if tag.RowsAffected() == 0 {
		return ErrOutcomeNotFound
	}

	return nil
}