package interventionoutcomes_test

// Layer 3 test: real Postgres (DATABASE_URL env var), no mocks, no fakes.
// Proves the intervention_outcomes.feeder_id -> feeders.id FK fix actually
// works. Before the fix, feeder_id was FK'd to assets.feeder_id (varchar)
// while SeedOutcomes always wrote a feeders.id (uuid) — every insert
// silently failed the FK check in the background goroutine and was only
// ever logged, never surfaced. This test fails loudly if that regresses.
//
// Each test truncates its own rows via t.Cleanup (CASCADE handles the FK
// child rows), so the shared test database stays empty between runs.

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"

	"gateway/database"
	interventionoutcomes "gateway/intervention_outcomes"
)

func newTestDB(t *testing.T) *database.PostgresDB {
	t.Helper()

	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL not set; skipping Layer 3 integration test")
	}

	ctx := context.Background()
	db, err := database.InitPool(ctx, dsn)
	if err != nil {
		t.Fatalf("failed to connect to test database: %v", err)
	}

	t.Cleanup(func() {
		// CASCADE clears intervention_outcomes rows that reference the feeder too.
		if _, err := db.Pool.Exec(context.Background(), `TRUNCATE feeders CASCADE`); err != nil {
			t.Logf("cleanup: failed to truncate feeders: %v", err)
		}
		db.Close()
	})

	return db
}

func seedFeeder(t *testing.T, db *database.PostgresDB, feederID string) {
	t.Helper()
	_, err := db.Pool.Exec(context.Background(),
		`INSERT INTO feeders (id, name) VALUES ($1, $2)`, feederID, "test-feeder")
	if err != nil {
		t.Fatalf("failed to seed feeders row: %v", err)
	}
}

func TestSeedOutcomes_RealPostgres_FKNowSucceeds(t *testing.T) {
	db := newTestDB(t)
	ctx := context.Background()
	repo := interventionoutcomes.NewSQLRepository(db)

	feederID := uuid.NewString()
	seedFeeder(t, db, feederID)

	id := uuid.NewString()
	seeds := []interventionoutcomes.InterventionSeed{{
		ID:                     id,
		QueryID:                uuid.NewString(),
		FeederID:               feederID,
		PredictedPriorityScore: 0.87,
		PredictedPriorityTier:  "critical",
		ShapTopFeatures: []interventionoutcomes.ShapAttribution{
			{FeatureName: "risk_score", Contribution: 0.5},
		},
	}}

	// This is the exact call that silently failed before the FK fix.
	if err := repo.SeedOutcomes(ctx, seeds); err != nil {
		t.Fatalf("SeedOutcomes failed (FK fix may have regressed): %v", err)
	}

	var gotFeederID, gotTier string
	err := db.Pool.QueryRow(ctx,
		`SELECT feeder_id, predicted_priority_tier FROM intervention_outcomes WHERE id = $1`,
		id,
	).Scan(&gotFeederID, &gotTier)
	if err != nil {
		t.Fatalf("failed to read back seeded row: %v", err)
	}
	if gotFeederID != feederID || gotTier != "critical" {
		t.Fatalf("row mismatch: feeder_id=%q tier=%q", gotFeederID, gotTier)
	}
}

func TestSeedOutcomes_RealPostgres_UnknownFeederFailsFK(t *testing.T) {
	db := newTestDB(t)
	ctx := context.Background()
	repo := interventionoutcomes.NewSQLRepository(db)

	seeds := []interventionoutcomes.InterventionSeed{{
		ID:                     uuid.NewString(),
		QueryID:                uuid.NewString(),
		FeederID:               uuid.NewString(), // never inserted into feeders
		PredictedPriorityScore: 0.5,
		PredictedPriorityTier:  "low",
	}}

	if err := repo.SeedOutcomes(ctx, seeds); err == nil {
		t.Fatal("expected FK violation for a feeder_id with no matching feeders row, got nil error")
	}
}

func TestSeedOutcomes_RealPostgres_ConflictDoesNothing(t *testing.T) {
	db := newTestDB(t)
	ctx := context.Background()
	repo := interventionoutcomes.NewSQLRepository(db)

	feederID := uuid.NewString()
	seedFeeder(t, db, feederID)

	id := uuid.NewString()
	first := []interventionoutcomes.InterventionSeed{{
		ID: id, QueryID: uuid.NewString(), FeederID: feederID,
		PredictedPriorityScore: 0.5, PredictedPriorityTier: "low",
	}}
	if err := repo.SeedOutcomes(ctx, first); err != nil {
		t.Fatalf("first seed failed: %v", err)
	}

	// Mark an operator action, as if a real user acted on it.
	if err := repo.RecordAction(ctx, id, interventionoutcomes.ActionDispatched, time.Now().UTC()); err != nil {
		t.Fatalf("RecordAction failed: %v", err)
	}

	// A re-run of ranking for the same id must NOT clobber the operator's action.
	retry := []interventionoutcomes.InterventionSeed{{
		ID: id, QueryID: uuid.NewString(), FeederID: feederID,
		PredictedPriorityScore: 0.99, PredictedPriorityTier: "critical",
	}}
	if err := repo.SeedOutcomes(ctx, retry); err != nil {
		t.Fatalf("retry seed failed: %v", err)
	}

	var action, tier string
	err := db.Pool.QueryRow(ctx,
		`SELECT action_taken, predicted_priority_tier FROM intervention_outcomes WHERE id = $1`, id,
	).Scan(&action, &tier)
	if err != nil {
		t.Fatalf("readback failed: %v", err)
	}
	if action != string(interventionoutcomes.ActionDispatched) {
		t.Fatalf("ON CONFLICT DO NOTHING should have preserved the dispatched action, got %q", action)
	}
	if tier != "low" {
		t.Fatalf("ON CONFLICT DO NOTHING should have preserved the original tier 'low', got %q", tier)
	}
}

func TestRecordAction_RealPostgres_UnknownIDReturnsNotFound(t *testing.T) {
	db := newTestDB(t)
	repo := interventionoutcomes.NewSQLRepository(db)

	err := repo.RecordAction(context.Background(), uuid.NewString(), interventionoutcomes.ActionDispatched, time.Now().UTC())
	if err != interventionoutcomes.ErrOutcomeNotFound {
		t.Fatalf("expected ErrOutcomeNotFound, got %v", err)
	}
}

func TestRecordOutageCheck_RealPostgres(t *testing.T) {
	db := newTestDB(t)
	ctx := context.Background()
	repo := interventionoutcomes.NewSQLRepository(db)

	feederID := uuid.NewString()
	seedFeeder(t, db, feederID)

	id := uuid.NewString()
	seeds := []interventionoutcomes.InterventionSeed{{
		ID: id, QueryID: uuid.NewString(), FeederID: feederID,
		PredictedPriorityScore: 0.6, PredictedPriorityTier: "medium",
	}}
	if err := repo.SeedOutcomes(ctx, seeds); err != nil {
		t.Fatalf("seed failed: %v", err)
	}

	checkedAt := time.Now().UTC()
	if err := repo.RecordOutageCheck(ctx, id, true, checkedAt); err != nil {
		t.Fatalf("RecordOutageCheck failed: %v", err)
	}

	var occurred bool
	if err := db.Pool.QueryRow(ctx, `SELECT outage_occurred FROM intervention_outcomes WHERE id = $1`, id).Scan(&occurred); err != nil {
		t.Fatalf("readback failed: %v", err)
	}
	if !occurred {
		t.Fatal("expected outage_occurred=true")
	}
}

func TestRecordReward_RealPostgres(t *testing.T) {
	db := newTestDB(t)
	ctx := context.Background()
	repo := interventionoutcomes.NewSQLRepository(db)

	feederID := uuid.NewString()
	seedFeeder(t, db, feederID)

	id := uuid.NewString()
	seeds := []interventionoutcomes.InterventionSeed{{
		ID: id, QueryID: uuid.NewString(), FeederID: feederID,
		PredictedPriorityScore: 0.6, PredictedPriorityTier: "medium",
	}}
	if err := repo.SeedOutcomes(ctx, seeds); err != nil {
		t.Fatalf("seed failed: %v", err)
	}

	if err := repo.RecordReward(ctx, id, 0.73, time.Now().UTC()); err != nil {
		t.Fatalf("RecordReward failed: %v", err)
	}

	var reward float64
	if err := db.Pool.QueryRow(ctx, `SELECT reward_value FROM intervention_outcomes WHERE id = $1`, id).Scan(&reward); err != nil {
		t.Fatalf("readback failed: %v", err)
	}
	if reward != 0.73 {
		t.Fatalf("expected reward_value=0.73, got %v", reward)
	}
}
