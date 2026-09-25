package handlers_test

// Layer 3 test: real Postgres (DATABASE_URL). Covers handlers.NewSQLAnomalyRepo
// (Engine C): FetchEngineCTelemetry against power_readings, PersistAnomaly
// against anomalies. Both tables FK feeder_id -> feeders.id (uuid).

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"

	"gateway/database"
	"gateway/handlers"
)

func newAnomalyTestDB(t *testing.T) *database.PostgresDB {
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
		if _, err := db.Pool.Exec(context.Background(), `TRUNCATE feeders CASCADE`); err != nil {
			t.Logf("cleanup: failed to truncate feeders: %v", err)
		}
		db.Close()
	})

	return db
}

func seedAnomalyFeeder(t *testing.T, db *database.PostgresDB, feederID string) {
	t.Helper()
	_, err := db.Pool.Exec(context.Background(),
		`INSERT INTO feeders (id, name) VALUES ($1, $2)`, feederID, "test-feeder")
	if err != nil {
		t.Fatalf("failed to seed feeders row: %v", err)
	}
}

// seedPowerReadings inserts n rows spaced one hour apart, ascending, ending at
// baseTime. The repo requires >= 24 rows or returns ErrInsufficientData, and
// reverses DESC->ASC internally, so seeded order here doesn't need to match
// the repo's internal ordering — only the count and feeder_id matter.
func seedPowerReadings(t *testing.T, db *database.PostgresDB, feederID string, n int, baseTime time.Time) {
	t.Helper()
	ctx := context.Background()
	for i := 0; i < n; i++ {
		ts := baseTime.Add(-time.Duration(i) * time.Hour)
		_, err := db.Pool.Exec(ctx,
			`INSERT INTO power_readings (feeder_id, timestamp, voltage, load, frequency, availability)
			 VALUES ($1, $2, $3, $4, $5, $6)`,
			feederID, ts, 230.0, 0.75, 50.0, 0.99,
		)
		if err != nil {
			t.Fatalf("failed to seed power_readings row %d: %v", i, err)
		}
	}
}

func TestFetchEngineCTelemetry_RealPostgres_InsufficientData(t *testing.T) {
	db := newAnomalyTestDB(t)
	ctx := context.Background()
	repo := handlers.NewSQLAnomalyRepo(db)

	feederID := uuid.NewString()
	seedAnomalyFeeder(t, db, feederID)
	seedPowerReadings(t, db, feederID, 10, time.Now().UTC()) // < 24

	_, err := repo.FetchEngineCTelemetry(ctx, feederID)
	if err != handlers.ErrInsufficientData {
		t.Fatalf("expected ErrInsufficientData, got %v", err)
	}
}

func TestFetchEngineCTelemetry_RealPostgres_ReturnsAscendingOrder(t *testing.T) {
	db := newAnomalyTestDB(t)
	ctx := context.Background()
	repo := handlers.NewSQLAnomalyRepo(db)

	feederID := uuid.NewString()
	seedAnomalyFeeder(t, db, feederID)
	base := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)
	seedPowerReadings(t, db, feederID, 24, base)

	readings, err := repo.FetchEngineCTelemetry(ctx, feederID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(readings) != 24 {
		t.Fatalf("expected 24 readings, got %d", len(readings))
	}
	for i := 1; i < len(readings); i++ {
		if !readings[i].Timestamp.After(readings[i-1].Timestamp) {
			t.Fatalf("readings not strictly ascending at index %d: %v then %v",
				i, readings[i-1].Timestamp, readings[i].Timestamp)
		}
	}
	if readings[0].FeederID != feederID {
		t.Fatalf("expected FeederID=%q, got %q", feederID, readings[0].FeederID)
	}
}

func TestPersistAnomaly_RealPostgres(t *testing.T) {
	db := newAnomalyTestDB(t)
	ctx := context.Background()
	repo := handlers.NewSQLAnomalyRepo(db)

	feederID := uuid.NewString()
	seedAnomalyFeeder(t, db, feederID)

	resp := handlers.AnomalyResponse{
		FeederID:        feederID,
		Timestamp:       time.Now().UTC(),
		IsAnomaly:       true,
		Severity:        "high",
		ConfidenceScore: 0.93,
		Reasons:         []string{"voltage spike", "frequency drift"},
	}

	if err := repo.PersistAnomaly(ctx, resp); err != nil {
		t.Fatalf("PersistAnomaly failed: %v", err)
	}

	var gotFeederID, gotSeverity, gotType string
	err := db.Pool.QueryRow(ctx,
		`SELECT feeder_id, severity, type FROM anomalies WHERE feeder_id = $1`, feederID,
	).Scan(&gotFeederID, &gotSeverity, &gotType)
	if err != nil {
		t.Fatalf("failed to read back persisted anomaly: %v", err)
	}
	if gotFeederID != feederID || gotSeverity != "high" {
		t.Fatalf("row mismatch: feeder_id=%q severity=%q", gotFeederID, gotSeverity)
	}
	if gotType != "Multivariate_Ensemble" {
		t.Fatalf("expected type=Multivariate_Ensemble (hardcoded in PersistAnomaly), got %q", gotType)
	}
}

func TestPersistAnomaly_RealPostgres_UnknownFeederFailsFK(t *testing.T) {
	db := newAnomalyTestDB(t)
	repo := handlers.NewSQLAnomalyRepo(db)

	resp := handlers.AnomalyResponse{
		FeederID:  uuid.NewString(), // never seeded into feeders
		Timestamp: time.Now().UTC(),
		IsAnomaly: true,
		Severity:  "high",
	}

	if err := repo.PersistAnomaly(context.Background(), resp); err == nil {
		t.Fatal("expected FK violation for an unknown feeder_id, got nil error")
	}
}
