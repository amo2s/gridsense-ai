package handlers

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"time"

	"gateway/bridge"
	"gateway/database"
)

// ReliabilityHandler coordinates data aggregation and execution dispatch for reliability endpoints.
type ReliabilityHandler struct {
	db     *database.PostgresDB
	engine *bridge.EngineAClient
}

// NewReliabilityHandler instantiates a new handler with injected dependencies.
func NewReliabilityHandler(db *database.PostgresDB, engine *bridge.EngineAClient) *ReliabilityHandler {
	return &ReliabilityHandler{
		db:     db,
		engine: engine,
	}
}

type errorResponse struct {
	Error string `json:"error"`
}

func writeError(w http.ResponseWriter, msg string, code int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(errorResponse{Error: msg})
}

// Evaluate handles GET/POST requests to calculate the 24-hour reliability score for a given feeder.
func (h *ReliabilityHandler) Evaluate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodPost {
		writeError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	feederID := r.URL.Query().Get("feeder_id")
	if feederID == "" {
		writeError(w, "Query parameter 'feeder_id' is required", http.StatusBadRequest)
		return
	}

	// Default cycle timestamp to UTC now if not explicitly passed
	cycleTime := time.Now().UTC()
	if timestampStr := r.URL.Query().Get("timestamp"); timestampStr != "" {
		parsedTime, err := time.Parse(time.RFC3339, timestampStr)
		if err != nil {
			writeError(w, "Invalid timestamp format (must be RFC3339 / ISO 8601)", http.StatusBadRequest)
			return
		}
		cycleTime = parsedTime.UTC()
	}

	// Explicit request-scoped timeout budget covering both the DB fetch and
	// the Engine A dispatch. Without this, a hung Engine A call blocks
	// indefinitely aside from the server's blunt global WriteTimeout, which
	// is meant as a last-resort cutoff, not an intentional per-request
	// deadline. Matches the pattern used by Engine B's prediction handler.
	ctx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
	defer cancel()

	// 1. Fetch grid asset data and 24-hour interruption history from Supabase
	payload, err := h.db.FetchOperationalPayload(ctx, feederID, cycleTime)
	if err != nil {
		log.Printf("[ERROR] Database fetch failed for feeder %s: %v", feederID, err)
		writeError(w, "Asset not found or unable to fetch telemetry", http.StatusNotFound)
		return
	}

	// 2. Dispatch the aggregated payload to Engine A
	egressResult, err := h.engine.EvaluateReliability(ctx, payload)
	if err != nil {
		log.Printf("[ERROR] Engine A evaluation failed for feeder %s: %v", feederID, err)
		writeError(w, "Calculation engine execution failure", http.StatusBadGateway)
		return
	}

	// 3. Return the deterministic output to the caller
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	if err := json.NewEncoder(w).Encode(egressResult); err != nil {
		log.Printf("[ERROR] Failed to marshal egress response: %v", err)
	}
}