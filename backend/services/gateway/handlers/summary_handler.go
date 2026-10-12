package handlers

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"gateway/database"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// PredictionSummaryDTO maps the latest materialized risk prediction record
// directly from the risk_predictions PostgreSQL table.
type PredictionSummaryDTO struct {
	FeederID            string          `json:"feeder_id"`
	GeneratedAt         time.Time       `json:"generated_at"`
	Horizon             int             `json:"horizon_hours"`
	RiskScore           float64         `json:"risk_score"`
	RiskLevel           string          `json:"risk_level"`
	ModelVersion        string          `json:"model_version"`
	ContributingFactors json.RawMessage `json:"contributing_factors"`
}

// SummaryHandler encapsulates read-only queries for Engine B materialized risk views.
type SummaryHandler struct {
	db *database.PostgresDB
}

// NewSummaryHandler constructs a new SummaryHandler with the injected database connection pool.
func NewSummaryHandler(db *database.PostgresDB) *SummaryHandler {
	return &SummaryHandler{db: db}
}

// GetEngineBSummary serves the latest materialized risk prediction for a specific grid asset.
// Adheres strictly to the Read-Only Expansion Principle and returns HTTP 404 on missing predictions.
func (h *SummaryHandler) GetEngineBSummary(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusMethodNotAllowed)
		_ = json.NewEncoder(w).Encode(map[string]string{
			"error": "Method Not Allowed",
		})
		return
	}

	feederID := strings.TrimSpace(r.URL.Query().Get("feeder_id"))
	if feederID == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]string{
			"error":   "Bad Request",
			"message": "Missing required query parameter 'feeder_id'",
		})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	const query = `
		SELECT 
			feeder_id, 
			generated_at, 
			horizon, 
			score, 
			level, 
			model_version, 
			contributing_factors 
		FROM risk_predictions 
		WHERE feeder_id = $1 
		ORDER BY generated_at DESC 
		LIMIT 1;
	`

	var summary PredictionSummaryDTO
	var rawFactors []byte

	err := h.db.Pool.QueryRow(ctx, query, feederID).Scan(
		&summary.FeederID,
		&summary.GeneratedAt,
		&summary.Horizon,
		&summary.RiskScore,
		&summary.RiskLevel,
		&summary.ModelVersion,
		&rawFactors,
	)

	if err != nil {
		// Gracefully handle not found scenario (pgx.ErrNoRows or sql.ErrNoRows)
		if errors.Is(err, pgx.ErrNoRows) || errors.Is(err, sql.ErrNoRows) {
			slog.Info("no historical predictions found for feeder", "feeder_id", feederID)
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusNotFound)
			_ = json.NewEncoder(w).Encode(map[string]string{
				"error":     "Not Found",
				"feeder_id": feederID,
				"message":   "No historical outage-risk predictions exist for this grid asset yet.",
			})
			return
		}

		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "42P01" {
			// Undefined table 42P01
			slog.Warn("risk_predictions table not found; returning 404", "code", pgErr.Code, "feeder_id", feederID)
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusNotFound)
			_ = json.NewEncoder(w).Encode(map[string]string{
				"error":     "Not Found",
				"feeder_id": feederID,
				"message":   "No historical outage-risk predictions exist for this grid asset yet.",
			})
			return
		}

		slog.Error("failed to query risk_predictions", "feeder_id", feederID, "error", err)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		_ = json.NewEncoder(w).Encode(map[string]string{
			"error":   "Internal Server Error",
			"message": "Failed to retrieve materialized risk prediction from database",
		})
		return
	}

	if len(rawFactors) == 0 {
		summary.ContributingFactors = json.RawMessage("[]")
	} else {
		summary.ContributingFactors = json.RawMessage(rawFactors)
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	if err := json.NewEncoder(w).Encode(summary); err != nil {
		slog.Error("failed to encode prediction summary response", "feeder_id", feederID, "error", err)
	}
}
