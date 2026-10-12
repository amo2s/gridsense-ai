package handlers

import (
	"context"
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

// FeederDTO defines the explicit JSON mapping expected by the frontend.
type FeederDTO struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	Substation   string `json:"substation"`
	VoltageClass string `json:"voltageClass"`
	Status       string `json:"status"`
}

// FeedersResponse encapsulates the array of feeders for consistent envelope serialization.
type FeedersResponse struct {
	Feeders []FeederDTO `json:"feeders"`
}

// AssetHandler manages read-only grid infrastructure queries.
type AssetHandler struct {
	db *database.PostgresDB
}

// NewAssetHandler constructs a new AssetHandler with injected database connection pool.
func NewAssetHandler(db *database.PostgresDB) *AssetHandler {
	return &AssetHandler{db: db}
}

// normalizeFeederStatus ensures status strictly conforms to STABLE, VULNERABLE, or HIGH_RISK.
func normalizeFeederStatus(raw string) string {
	cleaned := strings.ToUpper(strings.TrimSpace(raw))
	switch cleaned {
	case "STABLE", "NORMAL", "HEALTHY", "LOW_RISK", "LOW":
		return "STABLE"
	case "VULNERABLE", "WARNING", "MODERATE", "MEDIUM_RISK", "MEDIUM":
		return "VULNERABLE"
	case "HIGH_RISK", "CRITICAL", "FAILING", "HIGH", "UNSTABLE", "ALERT":
		return "HIGH_RISK"
	default:
		return "STABLE"
	}
}

// GetFeeders executes the strict mapping query against the PostgreSQL feeders table.
func (h *AssetHandler) GetFeeders(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusMethodNotAllowed)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "Method not allowed"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	const query = `
		SELECT 
			id::text, 
			name, 
			'Primary Substation' AS substation, 
			COALESCE(voltage_level, '33kV') AS voltageClass, 
			UPPER(COALESCE(status, 'STABLE')) AS status 
		FROM feeders 
		ORDER BY name ASC;
	`

	rows, err := h.db.Pool.Query(ctx, query)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "42P01" {
			// Undefined table 42P01: gracefully return empty slice
			slog.Warn("feeders table not found; returning empty slice", "code", pgErr.Code)
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(FeedersResponse{Feeders: []FeederDTO{}})
			return
		}

		slog.Error("failed to query feeders", "error", err)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "Failed to retrieve grid assets"})
		return
	}
	defer rows.Close()

	feeders := make([]FeederDTO, 0)
	for rows.Next() {
		var f FeederDTO
		var rawStatus string
		if err := rows.Scan(&f.ID, &f.Name, &f.Substation, &f.VoltageClass, &rawStatus); err != nil {
			slog.Error("feeder row scan failed", "error", err)
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusInternalServerError)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": "Failed to scan grid asset records"})
			return
		}
		f.Status = normalizeFeederStatus(rawStatus)
		feeders = append(feeders, f)
	}

	if err := rows.Err(); err != nil {
		if !errors.Is(err, pgx.ErrNoRows) {
			slog.Error("feeder iteration error", "error", err)
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusInternalServerError)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": "Error reading asset results"})
			return
		}
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	if err := json.NewEncoder(w).Encode(FeedersResponse{Feeders: feeders}); err != nil {
		slog.Error("failed to encode feeders response", "error", err)
	}
}
