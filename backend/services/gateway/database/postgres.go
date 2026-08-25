package database

import (
	"context"
	"fmt"
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

	var interruptions []models.InterruptionRecord
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
