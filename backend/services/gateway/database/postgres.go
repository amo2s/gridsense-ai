package database

import (
	"context"
	"fmt"
	"strings"
	"time"

	"gateway/models"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// PostgresDB wraps the pgx connection pool to provide custom repository methods.
type PostgresDB struct {
	Pool *pgxpool.Pool
}

// InitPool establishes a highly concurrent, thread-safe connection pool to Supabase.
func InitPool(ctx context.Context, databaseURL string) (*PostgresDB, error) {
	if !strings.Contains(databaseURL, "default_query_exec_mode=") {
		if strings.Contains(databaseURL, "?") {
			databaseURL += "&default_query_exec_mode=exec"
		} else {
			databaseURL += "?default_query_exec_mode=exec"
		}
	}
	config, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("failed to parse database config: %w", err)
	}

	// Optimize pool settings for standard microservice workloads
	config.MaxConns = 25
	config.MinConns = 5
	config.MaxConnLifetime = time.Hour
	config.MaxConnIdleTime = 30 * time.Minute

	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		return nil, fmt.Errorf("failed to create connection pool: %w", err)
	}

	// Verify the connection is actually alive before returning
	if err := pool.Ping(ctx); err != nil {
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	return &PostgresDB{Pool: pool}, nil
}

// Close gracefully terminates all connections in the pool.
func (db *PostgresDB) Close() {
	if db.Pool != nil {
		db.Pool.Close()
	}
}

// FetchOperationalPayload retrieves the asset metadata and its 24-hour outage history.
// It uses pgx.Batch to execute both queries in a single network round-trip for maximum performance.
func (db *PostgresDB) FetchOperationalPayload(ctx context.Context, feederID string, cycleEnd time.Time) (*models.OperationalPayload, error) {
	cycleStart := cycleEnd.Add(-24 * time.Hour)

	// Queue both queries into a single batch
	batch := &pgx.Batch{}

	// Query 1: Asset Metadata
	batch.Queue(
		"SELECT feeder_id, voltage_class, capacity_mw FROM assets WHERE feeder_id = $1",
		feederID,
	)

	// Query 2: Interruptions strictly within the 24-hour cycle window
	batch.Queue(
		`SELECT start_time, duration_minutes 
         FROM interruptions 
         WHERE feeder_id = $1 AND start_time >= $2 AND start_time <= $3 
         ORDER BY start_time ASC`,
		feederID, cycleStart, cycleEnd,
	)

	// Send the batch to Supabase
	br := db.Pool.SendBatch(ctx, batch)
	defer br.Close()

	// 1. Scan Asset Metadata
	var asset models.AssetMetadata
	err := br.QueryRow().Scan(&asset.FeederID, &asset.VoltageClass, &asset.CapacityMW)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, fmt.Errorf("asset not found: %s", feederID)
		}
		return nil, fmt.Errorf("failed to fetch asset metadata: %w", err)
	}

	// 2. Scan Interruptions
	rows, err := br.Query()
	if err != nil {
		return nil, fmt.Errorf("failed to execute interruptions query: %w", err)
	}
	defer rows.Close()

	interruptions := make([]models.InterruptionRecord, 0)
	for rows.Next() {
		var record models.InterruptionRecord
		if err := rows.Scan(&record.StartTime, &record.DurationMinutes); err != nil {
			return nil, fmt.Errorf("failed to scan interruption record: %w", err)
		}
		interruptions = append(interruptions, record)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("row iteration error: %w", err)
	}

	// Assemble and return the strict-boundary contract
	payload := &models.OperationalPayload{
		CycleTimestamp: cycleEnd,
		Asset:          asset,
		Interruptions:  interruptions,
	}

	return payload, nil
}

// IngestOperationalPayload persists the ingested payload, Engine A results, and updates the priority ranking in a single transaction.
func (db *PostgresDB) IngestOperationalPayload(
	ctx context.Context, 
	payload *models.OperationalPayload, 
	reliabilityScore float64, 
	mappedStatus string,
) error {
	tx, err := db.Pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	// 1. Advisory Lock (using a deterministic hash of a string, or just a static lock for the whole table)
	// We'll use a static lock ID for grid_assets ranking recomputation to serialize these inserts.
	const rankingLockID = 1337
	_, err = tx.Exec(ctx, "SELECT pg_advisory_xact_lock($1)", rankingLockID)
	if err != nil {
		return fmt.Errorf("failed to acquire advisory lock: %w", err)
	}

	// 2. Upsert assets
	_, err = tx.Exec(ctx, `
		INSERT INTO assets (feeder_id, voltage_class, capacity_mw) 
		VALUES ($1, $2, $3)
		ON CONFLICT (feeder_id) DO UPDATE SET 
			voltage_class = EXCLUDED.voltage_class,
			capacity_mw = EXCLUDED.capacity_mw
	`, payload.Asset.FeederID, payload.Asset.VoltageClass, payload.Asset.CapacityMW)
	if err != nil {
		return fmt.Errorf("failed to upsert asset: %w", err)
	}

	// 3. Delete interruptions within the 24h window
	cycleStart := payload.CycleTimestamp.Add(-24 * time.Hour)
	_, err = tx.Exec(ctx, `
		DELETE FROM interruptions 
		WHERE feeder_id = $1 AND start_time >= $2 AND start_time <= $3
	`, payload.Asset.FeederID, cycleStart, payload.CycleTimestamp)
	if err != nil {
		return fmt.Errorf("failed to delete existing interruptions: %w", err)
	}

	// Insert new interruptions
	if len(payload.Interruptions) > 0 {
		batch := &pgx.Batch{}
		for _, record := range payload.Interruptions {
			batch.Queue(`
				INSERT INTO interruptions (feeder_id, start_time, duration_minutes) 
				VALUES ($1, $2, $3)
			`, payload.Asset.FeederID, record.StartTime, record.DurationMinutes)
		}
		br := tx.SendBatch(ctx, batch)
		err = br.Close()
		if err != nil {
			return fmt.Errorf("failed to insert interruptions: %w", err)
		}
	}

	// 4. Upsert grid_assets
	// urgency_rank is provisionally set to 2147483647
	_, err = tx.Exec(ctx, `
		INSERT INTO grid_assets (id, name, urgency_rank, risk_score, status, active)
		VALUES ($1, $2, 2147483647, $3, $4, true)
		ON CONFLICT (id) DO UPDATE SET
			name = EXCLUDED.name,
			risk_score = EXCLUDED.risk_score,
			status = EXCLUDED.status,
			active = true
	`, payload.Asset.FeederID, payload.Asset.FeederID, reliabilityScore, mappedStatus)
	if err != nil {
		return fmt.Errorf("failed to upsert grid_assets: %w", err)
	}

	// 5. Upsert risk_history
	_, err = tx.Exec(ctx, `
		INSERT INTO risk_history (area_id, risk_value, recorded_at)
		VALUES ($1, $2, $3)
		ON CONFLICT (area_id, recorded_at) DO UPDATE SET
			risk_value = EXCLUDED.risk_value
	`, payload.Asset.FeederID, reliabilityScore, payload.CycleTimestamp)
	if err != nil {
		return fmt.Errorf("failed to upsert risk_history: %w", err)
	}

	// 6. Recompute urgency_rank for ALL active grid_assets
	// active IS NULL is treated as inactive because we use WHERE active = true
	_, err = tx.Exec(ctx, `
		WITH RankedAssets AS (
			SELECT id, ROW_NUMBER() OVER (ORDER BY risk_score ASC, id ASC) as new_rank
			FROM grid_assets
			WHERE active = true
		)
		UPDATE grid_assets
		SET urgency_rank = RankedAssets.new_rank
		FROM RankedAssets
		WHERE grid_assets.id = RankedAssets.id
	`)
	if err != nil {
		return fmt.Errorf("failed to recompute urgency_rank: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("failed to commit transaction: %w", err)
	}

	return nil
}

