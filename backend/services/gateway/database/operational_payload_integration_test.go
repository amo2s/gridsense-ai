package database_test

// Layer 3 test: real Postgres (DATABASE_URL). Covers database.FetchOperationalPayload
// (Engine A): the batched assets + interruptions query. Note assets.feeder_id
// is varchar — a separate identifier domain from feeders.id (uuid) used
// everywhere else in the gateway. No FK ties these two spaces together.

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"

	"gateway/database"
)

func newOperationalTestDB(t *testing.T) *database.PostgresDB {
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
		if _, err := db.Pool.Exec(context.Background(), `TRUNCATE assets CASCADE`); err != nil {
			t.Logf("cleanup: failed to truncate assets: %v", err)
		}
		db.Close()
	})

	return db
}

func seedAsset(t *testing.T, db *database.PostgresDB, feederID string) {
	t.Helper()
	_, err := db.Pool.Exec(context.Background(),
		`INSERT INTO assets (feeder_id, voltage_class, capacity_mw) VALUES ($1, $2, $3)`,
		feederID, "11kV", 15.5,
	)
	if err != nil {
		t.Fatalf("failed to seed assets row: %v", err)
	}
}

func seedInterruption(t *testing.T, db *database.PostgresDB, feederID string, startTime time.Time, durationMin float64) {
	t.Helper()
	_, err := db.Pool.Exec(context.Background(),
		`INSERT INTO interruptions (feeder_id, start_time, duration_minutes) VALUES ($1, $2, $3)`,
		feederID, startTime, durationMin,
	)
	if err != nil {
		t.Fatalf("failed to seed interruptions row: %v", err)
	}
}

func TestFetchOperationalPayload_RealPostgres_AssetNotFound(t *testing.T) {
	db := newOperationalTestDB(t)

	_, err := db.FetchOperationalPayload(context.Background(), "no-such-feeder-"+uuid.NewString(), time.Now().UTC())
	if err == nil {
		t.Fatal("expected an error for an unknown feeder_id, got nil")
	}
}

func TestFetchOperationalPayload_RealPostgres_AssetMetadata(t *testing.T) {
	db := newOperationalTestDB(t)
	ctx := context.Background()

	feederID := "FEEDER-" + uuid.NewString()[:8]
	seedAsset(t, db, feederID)

	payload, err := db.FetchOperationalPayload(ctx, feederID, time.Now().UTC())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if payload.Asset.FeederID != feederID {
		t.Fatalf("expected Asset.FeederID=%q, got %q", feederID, payload.Asset.FeederID)
	}
	if payload.Asset.VoltageClass != "11kV" || payload.Asset.CapacityMW != 15.5 {
		t.Fatalf("asset metadata mismatch: %+v", payload.Asset)
	}
}

func TestFetchOperationalPayload_RealPostgres_InterruptionsWithinWindowOnly(t *testing.T) {
	db := newOperationalTestDB(t)
	ctx := context.Background()

	feederID := "FEEDER-" + uuid.NewString()[:8]
	seedAsset(t, db, feederID)

	cycleEnd := time.Date(2026, 1, 2, 0, 0, 0, 0, time.UTC)
	inWindow := cycleEnd.Add(-12 * time.Hour)  // within the 24h window
	beforeWindow := cycleEnd.Add(-30 * time.Hour) // outside: > 24h before cycleEnd
	afterWindow := cycleEnd.Add(1 * time.Hour)    // outside: after cycleEnd

	seedInterruption(t, db, feederID, inWindow, 45)
	seedInterruption(t, db, feederID, beforeWindow, 10)
	seedInterruption(t, db, feederID, afterWindow, 20)

	payload, err := db.FetchOperationalPayload(ctx, feederID, cycleEnd)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if payload.CycleTimestamp != cycleEnd {
		t.Fatalf("expected CycleTimestamp=%v, got %v", cycleEnd, payload.CycleTimestamp)
	}
	if len(payload.Interruptions) != 1 {
		t.Fatalf("expected exactly 1 interruption inside the 24h window, got %d: %+v",
			len(payload.Interruptions), payload.Interruptions)
	}
	if payload.Interruptions[0].DurationMinutes != 45 {
		t.Fatalf("expected the in-window interruption (45 min), got %+v", payload.Interruptions[0])
	}
}

func TestFetchOperationalPayload_RealPostgres_NoInterruptionsReturnsEmptySlice(t *testing.T) {
	db := newOperationalTestDB(t)
	ctx := context.Background()

	feederID := "FEEDER-" + uuid.NewString()[:8]
	seedAsset(t, db, feederID)

	payload, err := db.FetchOperationalPayload(ctx, feederID, time.Now().UTC())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if payload.Interruptions == nil {
		t.Fatal("expected an empty slice, got nil (make([]..., 0) should prevent this)")
	}
	if len(payload.Interruptions) != 0 {
		t.Fatalf("expected 0 interruptions, got %d", len(payload.Interruptions))
	}
}