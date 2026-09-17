package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/gridsense-ai/alerts/internal/db"
)

var (
	// ErrAlertNotFound is returned when a requested alert does not exist.
	ErrAlertNotFound = errors.New("alert not found")
	// ErrDatabase indicates a generic infrastructure failure.
	ErrDatabase = errors.New("database operation failed")
)

// AlertRepository defines the persistence contract for the microservice.
type AlertRepository interface {
	Create(ctx context.Context, params db.CreateAlertParams) (db.Alert, error)
	GetByID(ctx context.Context, id uuid.UUID) (db.Alert, error)
	ListActive(ctx context.Context, limit, offset int32) ([]db.Alert, error)
	UpdateStatus(ctx context.Context, params db.UpdateAlertStatusParams) (db.Alert, error)
	FindSimilar(ctx context.Context, params db.FindSimilarAlertsParams) ([]db.Alert, error)
	LogIntervention(ctx context.Context, params db.LogInterventionParams) error // Added for Step 9.2 RL state tracking
}

// pgAlertRepository implements AlertRepository using pgxpool and sqlc.
type pgAlertRepository struct {
	pool    *pgxpool.Pool
	queries *db.Queries
}

// NewAlertRepository constructs a new PostgreSQL-backed alert repository.
func NewAlertRepository(pool *pgxpool.Pool) AlertRepository {
	return &pgAlertRepository{
		pool:    pool,
		queries: db.New(pool), // Injects the pgxpool into the sqlc generated struct
	}
}

// Create inserts a new alert into the database.
func (r *pgAlertRepository) Create(ctx context.Context, params db.CreateAlertParams) (db.Alert, error) {
	alert, err := r.queries.CreateAlert(ctx, params)
	if err != nil {
		return db.Alert{}, fmt.Errorf("%w: %v", ErrDatabase, err)
	}
	return alert, nil
}

// GetByID retrieves a single alert by its UUID.
func (r *pgAlertRepository) GetByID(ctx context.Context, id uuid.UUID) (db.Alert, error) {
	// Note: sqlc defaults to pgtype.UUID for UUIDs in pgx/v5 unless configured otherwise.
	// Ensure the parameter matches the generated signature in db/query.sql.go.
	alert, err := r.queries.GetAlertByID(ctx, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return db.Alert{}, ErrAlertNotFound
		}
		return db.Alert{}, fmt.Errorf("%w: %v", ErrDatabase, err)
	}
	return alert, nil
}

// ListActive retrieves unresolved alerts for the dashboard.
func (r *pgAlertRepository) ListActive(ctx context.Context, limit, offset int32) ([]db.Alert, error) {
	params := db.ListActiveAlertsParams{
		Limit:  limit,
		Offset: offset,
	}
	alerts, err := r.queries.ListActiveAlerts(ctx, params)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrDatabase, err)
	}
	return alerts, nil
}

// UpdateStatus modifies the state and acknowledgment metrics of an existing alert.
func (r *pgAlertRepository) UpdateStatus(ctx context.Context, params db.UpdateAlertStatusParams) (db.Alert, error) {
	alert, err := r.queries.UpdateAlertStatus(ctx, params)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return db.Alert{}, ErrAlertNotFound
		}
		return db.Alert{}, fmt.Errorf("%w: %v", ErrDatabase, err)
	}
	return alert, nil
}

// FindSimilar utilizes pgvector HNSW to locate historically similar alerts.
func (r *pgAlertRepository) FindSimilar(ctx context.Context, params db.FindSimilarAlertsParams) ([]db.Alert, error) {
	alerts, err := r.queries.FindSimilarAlerts(ctx, params)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrDatabase, err)
	}
	return alerts, nil
}

// LogIntervention records operator telemetry for the Engine D RL feedback loop.
func (r *pgAlertRepository) LogIntervention(ctx context.Context, params db.LogInterventionParams) error {
	err := r.queries.LogIntervention(ctx, params)
	if err != nil {
		return fmt.Errorf("%w: %v", ErrDatabase, err)
	}
	return nil
}
