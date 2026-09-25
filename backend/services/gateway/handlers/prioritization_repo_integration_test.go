package handlers_test

// Layer 3 test: real Postgres (DATABASE_URL). Covers handlers.NewSQLPrioritizationRepo
// (Engine D): FetchFusedSignals (the areas -> feeders -> reliability_scores/
// risk_predictions/anomalies LATERAL join), and PersistPrioritization
// (per-asset UUID generation + ON CONFLICT (query_id, feeder_id) DO UPDATE
// into priorities, which intentionally preserves intervention_id on conflict).

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"

	"gateway/database"
	"gateway/handlers"
)

func newPrioritizationTestDB(t *testing.T) *database.PostgresDB {
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
		ctx := context.Background()
		// priorities has no FK to feeders/areas, so it needs its own cleanup.
		if _, err := db.Pool.Exec(ctx, `TRUNCATE priorities RESTART IDENTITY`); err != nil {
			t.Logf("cleanup: failed to truncate priorities: %v", err)
		}
		if _, err := db.Pool.Exec(ctx, `TRUNCATE areas CASCADE`); err != nil {
			t.Logf("cleanup: failed to truncate areas: %v", err)
		}
		db.Close()
	})

	return db
}

func seedArea(t *testing.T, db *database.PostgresDB, areaID string) {
	t.Helper()
	_, err := db.Pool.Exec(context.Background(),
		`INSERT INTO areas (id, name, state) VALUES ($1, $2, $3)`, areaID, "test-area", "TS")
	if err != nil {
		t.Fatalf("failed to seed areas row: %v", err)
	}
}

func seedPrioritizationFeeder(t *testing.T, db *database.PostgresDB, feederID, areaID string) {
	t.Helper()
	_, err := db.Pool.Exec(context.Background(),
		`INSERT INTO feeders (id, area_id, name) VALUES ($1, $2, $3)`, feederID, areaID, "test-feeder")
	if err != nil {
		t.Fatalf("failed to seed feeders row: %v", err)
	}
}

func TestFetchFusedSignals_RealPostgres_InsufficientAssets(t *testing.T) {
	db := newPrioritizationTestDB(t)
	ctx := context.Background()
	repo := handlers.NewSQLPrioritizationRepo(db)

	areaID := uuid.NewString()
	seedArea(t, db, areaID)
	seedPrioritizationFeeder(t, db, uuid.NewString(), areaID) // only 1 feeder

	_, err := repo.FetchFusedSignals(ctx, areaID)
	if err != handlers.ErrInsufficientAssets {
		t.Fatalf("expected ErrInsufficientAssets, got %v", err)
	}
}

func TestFetchFusedSignals_RealPostgres_JoinsAllThreeSources(t *testing.T) {
	db := newPrioritizationTestDB(t)
	ctx := context.Background()
	repo := handlers.NewSQLPrioritizationRepo(db)

	areaID := uuid.NewString()
	seedArea(t, db, areaID)

	feederWithData := uuid.NewString()
	feederBareMinimum := uuid.NewString()
	seedPrioritizationFeeder(t, db, feederWithData, areaID)
	seedPrioritizationFeeder(t, db, feederBareMinimum, areaID)

	now := time.Now().UTC()
	if _, err := db.Pool.Exec(ctx,
		`INSERT INTO reliability_scores (feeder_id, score, duration_penalty, frequency_penalty, generated_at)
		 VALUES ($1, $2, $3, $4, $5)`,
		feederWithData, 72.5, 0.1, 0.05, now,
	); err != nil {
		t.Fatalf("failed to seed reliability_scores: %v", err)
	}
	if _, err := db.Pool.Exec(ctx,
		`INSERT INTO risk_predictions (feeder_id, generated_at, horizon, score, level, model_version, contributing_factors)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
		feederWithData, now, 24, 0.65, "high", "b-1.0", `[]`,
	); err != nil {
		t.Fatalf("failed to seed risk_predictions: %v", err)
	}
	// Anomaly within the last 24h so it's picked up by the "> NOW() - INTERVAL '24 hours'" filter.
	if _, err := db.Pool.Exec(ctx,
		`INSERT INTO anomalies (feeder_id, detected_at, type, severity, score)
		 VALUES ($1, $2, $3, $4, $5)`,
		feederWithData, now, "voltage_sag", "high", 0.9,
	); err != nil {
		t.Fatalf("failed to seed anomalies: %v", err)
	}

	signals, err := repo.FetchFusedSignals(ctx, areaID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(signals) != 2 {
		t.Fatalf("expected 2 signals (one per feeder), got %d", len(signals))
	}

	var withData, bareMin *handlers.MultiEngineSignals
	for i := range signals {
		switch signals[i].FeederID {
		case feederWithData:
			withData = &signals[i]
		case feederBareMinimum:
			bareMin = &signals[i]
		}
	}
	if withData == nil || bareMin == nil {
		t.Fatalf("expected both seeded feeders in result, got: %+v", signals)
	}

	// Feeder with real rows: joined values should come through.
	if withData.ReliabilityScore != 72.5 || withData.DurationPenalty != 0.1 {
		t.Fatalf("reliability join mismatch: %+v", withData)
	}
	if withData.RiskScore != 0.65 {
		t.Fatalf("risk join mismatch: %+v", withData)
	}
	if !withData.IsAnomaly || withData.AnomalyConfidence != 0.9 {
		t.Fatalf("anomaly join mismatch (score 0.9 > 0.8 threshold should set IsAnomaly=true): %+v", withData)
	}

	// Feeder with nothing: COALESCE defaults must apply, not nulls/errors.
	if bareMin.ReliabilityScore != 100 || bareMin.DurationPenalty != 0 || bareMin.FrequencyPenalty != 0 {
		t.Fatalf("expected COALESCE defaults (100, 0, 0) for bare feeder, got: %+v", bareMin)
	}
	if bareMin.RiskScore != 0 {
		t.Fatalf("expected RiskScore default 0, got %v", bareMin.RiskScore)
	}
	if bareMin.IsAnomaly || bareMin.AnomalyConfidence != 0 {
		t.Fatalf("expected no anomaly for bare feeder, got: %+v", bareMin)
	}
}

func TestPersistPrioritization_RealPostgres_InsertAndReadback(t *testing.T) {
	db := newPrioritizationTestDB(t)
	ctx := context.Background()
	repo := handlers.NewSQLPrioritizationRepo(db)

	queryID := uuid.NewString()
	resp := handlers.PrioritizationResponse{
		QueryID:     queryID,
		GeneratedAt: time.Now().UTC(),
		RankedAssets: []handlers.RankedAsset{
			{FeederID: "feeder-a", RankPosition: 1, PriorityScore: 0.9, PriorityTier: "critical",
				Explanations: []handlers.ShapAttribution{{FeatureName: "risk", Contribution: 0.5}}},
			{FeederID: "feeder-b", RankPosition: 2, PriorityScore: 0.4, PriorityTier: "low"},
		},
	}

	ids, err := repo.PersistPrioritization(ctx, resp)
	if err != nil {
		t.Fatalf("PersistPrioritization failed: %v", err)
	}
	if len(ids) != 2 || ids["feeder-a"] == "" || ids["feeder-b"] == "" {
		t.Fatalf("expected generated intervention_id per feeder, got: %+v", ids)
	}
	if ids["feeder-a"] == ids["feeder-b"] {
		t.Fatal("expected distinct intervention_ids per feeder, got identical values")
	}

	var tier string
	var interventionID string
	err = db.Pool.QueryRow(ctx,
		`SELECT priority_tier, intervention_id FROM priorities WHERE query_id = $1 AND feeder_id = $2`,
		queryID, "feeder-a",
	).Scan(&tier, &interventionID)
	if err != nil {
		t.Fatalf("readback failed: %v", err)
	}
	if tier != "critical" || interventionID != ids["feeder-a"] {
		t.Fatalf("row mismatch: tier=%q intervention_id=%q", tier, interventionID)
	}
}

func TestPersistPrioritization_RealPostgres_ConflictPreservesInterventionID(t *testing.T) {
	db := newPrioritizationTestDB(t)
	ctx := context.Background()
	repo := handlers.NewSQLPrioritizationRepo(db)

	queryID := uuid.NewString()
	first := handlers.PrioritizationResponse{
		QueryID: queryID, GeneratedAt: time.Now().UTC(),
		RankedAssets: []handlers.RankedAsset{
			{FeederID: "feeder-c", RankPosition: 1, PriorityScore: 0.5, PriorityTier: "medium"},
		},
	}
	firstIDs, err := repo.PersistPrioritization(ctx, first)
	if err != nil {
		t.Fatalf("first persist failed: %v", err)
	}
	originalInterventionID := firstIDs["feeder-c"]

	// Re-run for the same (query_id, feeder_id): score/tier update, but
	// intervention_id must NOT change (comment in the repo says so explicitly).
	retry := handlers.PrioritizationResponse{
		QueryID: queryID, GeneratedAt: time.Now().UTC(),
		RankedAssets: []handlers.RankedAsset{
			{FeederID: "feeder-c", RankPosition: 1, PriorityScore: 0.95, PriorityTier: "critical"},
		},
	}
	if _, err := repo.PersistPrioritization(ctx, retry); err != nil {
		t.Fatalf("retry persist failed: %v", err)
	}

	var score float64
	var tier, interventionID string
	err = db.Pool.QueryRow(ctx,
		`SELECT priority_score, priority_tier, intervention_id FROM priorities WHERE query_id = $1 AND feeder_id = $2`,
		queryID, "feeder-c",
	).Scan(&score, &tier, &interventionID)
	if err != nil {
		t.Fatalf("readback failed: %v", err)
	}
	if score != 0.95 || tier != "critical" {
		t.Fatalf("expected updated score/tier from retry, got score=%v tier=%q", score, tier)
	}
	if interventionID != originalInterventionID {
		t.Fatalf("intervention_id must be preserved across ON CONFLICT UPDATE: original=%q got=%q",
			originalInterventionID, interventionID)
	}
}