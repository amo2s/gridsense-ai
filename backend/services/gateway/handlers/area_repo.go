package handlers

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"gateway/database"
	"gateway/models"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// AreaSummary is an alias to models.AreaSummary for package convenience.
type AreaSummary = models.AreaSummary

// AreaRepository defines the data access contract for operational grid areas.
type AreaRepository interface {
	FetchAllAreas(ctx context.Context) ([]AreaSummary, error)
}

// pgxAreaRepo implements AreaRepository using pgxpool.Pool.
type pgxAreaRepo struct {
	db *database.PostgresDB
}

// NewSQLAreaRepo constructs a new instance of AreaRepository backed by PostgreSQL.
func NewSQLAreaRepo(db *database.PostgresDB) AreaRepository {
	return &pgxAreaRepo{db: db}
}

// FetchAllAreas retrieves all operational grid areas from PostgreSQL ordered by name ascending.
func (r *pgxAreaRepo) FetchAllAreas(ctx context.Context) ([]AreaSummary, error) {
	queryCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()

	slog.Debug("executing FetchAllAreas query against areas table")

	const query = `SELECT id, name, state FROM areas ORDER BY name ASC;`

	rows, err := r.db.Pool.Query(queryCtx, query)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "42P01" {
			// Undefined table 42P01 (e.g. table not created yet in test/dev environment)
			slog.Warn("areas table not found; returning empty slice", "code", pgErr.Code)
			return []AreaSummary{}, nil
		}
		if errors.Is(err, pgx.ErrNoRows) {
			return []AreaSummary{}, nil
		}
		return nil, fmt.Errorf("failed to execute areas query: %w", err)
	}
	defer rows.Close()

	areas := make([]AreaSummary, 0)
	for rows.Next() {
		var a AreaSummary
		if err := rows.Scan(&a.ID, &a.Name, &a.State); err != nil {
			return nil, fmt.Errorf("failed to scan area row: %w", err)
		}
		areas = append(areas, a)
	}

	if err := rows.Err(); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return []AreaSummary{}, nil
		}
		return nil, fmt.Errorf("error during areas row iteration: %w", err)
	}

	return areas, nil
}
