package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"gateway/database"
)

type HealthHandler struct {
	db *database.PostgresDB
}

func NewHealthHandler(db *database.PostgresDB) *HealthHandler {
	return &HealthHandler{db: db}
}

type healthResponse struct {
	Status   string `json:"status"`
	Database string `json:"database"`
	Uptime   string `json:"uptime"`
}

var startTime = time.Now()

func (h *HealthHandler) HealthCheck(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()

	dbStatus := "connected"
	statusCode := http.StatusOK

	// Ping the Supabase connection pool
	if err := h.db.Pool.Ping(ctx); err != nil {
		dbStatus = "disconnected"
		statusCode = http.StatusServiceUnavailable
	}

	resp := healthResponse{
		Status:   "ok",
		Database: dbStatus,
		Uptime:   time.Since(startTime).Truncate(time.Second).String(),
	}

	if statusCode != http.StatusOK {
		resp.Status = "degraded"
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	_ = json.NewEncoder(w).Encode(resp)
}