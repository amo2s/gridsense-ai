package shared

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// NewDBPool initializes a highly optimized, resilient PostgreSQL connection pool.
func NewDBPool(databaseURL string) (*pgxpool.Pool, error) {
	// 1. Parse the raw Supabase URL into a pgxpool configuration object.
	config, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("failed to parse database configuration: %w", err)
	}

	// 2. Strict Pool Tuning for Supabase Limits & High Concurrency
	config.MaxConns = 25                      // Caps concurrent connections to avoid choking Supabase
	config.MinConns = 5                       // Maintains warm connections for instant query execution
	config.MaxConnLifetime = 1 * time.Hour    // Safely cycles out aging connections
	config.MaxConnIdleTime = 15 * time.Minute // Drops connections sitting idle to free up resources
	config.HealthCheckPeriod = 1 * time.Minute // Actively verifies idle connections are still alive

	// 3. Fail-Fast Context: Give the system exactly 10 seconds to connect on startup.
	// If Supabase is down or the network drops, we fail immediately rather than hanging indefinitely.
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	log.Println("Establishing connection pool to Supabase...")
	
	// 4. Create the pool using the advanced configuration
	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		return nil, fmt.Errorf("failed to initialize connection pool: %w", err)
	}

	// 5. Hard Verification: Ping the database to guarantee the credentials and network actually work.
	if err := pool.Ping(ctx); err != nil {
		pool.Close() // Clean up the hanging pool memory before returning the error
		return nil, fmt.Errorf("database ping failed, check credentials and network: %w", err)
	}

	log.Println("Supabase connection pool successfully established and verified.")
	return pool, nil
}