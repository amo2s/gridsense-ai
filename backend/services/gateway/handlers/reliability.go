package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"net/http"
	"strings"
	"time"

	"gateway/bridge"
	"gateway/database"
	"gateway/models"
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

func Round2Dec(val float64) float64 {
	return math.Round(val*100) / 100
}

func MapRiskBandToStatus(riskBand string) (string, error) {
	switch riskBand {
	case "STABLE":
		return "STABLE", nil
	case "VULNERABLE":
		return "VULNERABLE", nil
	case "CRITICAL", "FAILING":
		return "HIGH_RISK", nil
	default:
		return "", fmt.Errorf("unknown risk_band: %s", riskBand)
	}
}

// Ingest handles POST requests to ingest telemetry, execute Engine A, and persist all data.
func (h *ReliabilityHandler) Ingest(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Cap body to 1 MB
	r.Body = http.MaxBytesReader(w, r.Body, 1024*1024)

	var payload models.OperationalPayload
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(&payload); err != nil {
		writeError(w, "Malformed JSON or unknown field", http.StatusBadRequest)
		return
	}

	// Validation
	if payload.CycleTimestamp.IsZero() {
		writeError(w, "Validation failed: cycle_timestamp is required", http.StatusBadRequest)
		return
	}
	payload.CycleTimestamp = payload.CycleTimestamp.UTC()

	payload.Asset.FeederID = strings.TrimSpace(payload.Asset.FeederID)
	if l := len(payload.Asset.FeederID); l < 1 || l > 50 {
		writeError(w, "Validation failed: asset.feeder_id length must be 1-50 characters", http.StatusBadRequest)
		return
	}
	if l := len(payload.Asset.VoltageClass); l < 1 || l > 20 {
		writeError(w, "Validation failed: asset.voltage_class length must be 1-20 characters", http.StatusBadRequest)
		return
	}

	payload.Asset.CapacityMW = Round2Dec(payload.Asset.CapacityMW)
	if payload.Asset.CapacityMW <= 0 || payload.Asset.CapacityMW > 99999999.99 {
		writeError(w, "Validation failed: asset.capacity_mw must be strictly > 0 and <= 99999999.99", http.StatusBadRequest)
		return
	}

	if len(payload.Interruptions) > 6 {
		writeError(w, "Validation failed: interruptions cannot exceed 6 records", http.StatusBadRequest)
		return
	}

	var totalDuration float64
	minTime := payload.CycleTimestamp.Add(-24 * time.Hour)
	for i, intr := range payload.Interruptions {
		payload.Interruptions[i].DurationMinutes = Round2Dec(intr.DurationMinutes)
		payload.Interruptions[i].StartTime = intr.StartTime.UTC()
		dur := payload.Interruptions[i].DurationMinutes

		if dur < 0 || dur > 720 || math.IsNaN(dur) || math.IsInf(dur, 0) {
			writeError(w, "Validation failed: interruptions[].duration_minutes must be between 0 and 720", http.StatusBadRequest)
			return
		}
		if payload.Interruptions[i].StartTime.Before(minTime) || payload.Interruptions[i].StartTime.After(payload.CycleTimestamp) {
			writeError(w, "Validation failed: interruptions[].start_time must be within 24h before cycle_timestamp", http.StatusBadRequest)
			return
		}
		totalDuration += dur
	}

	if totalDuration > 1440 {
		writeError(w, "Validation failed: total interruption duration exceeds 1440 minutes", http.StatusBadRequest)
		return
	}

	// 12s context budget
	ctx, cancel := context.WithTimeout(r.Context(), 12*time.Second)
	defer cancel()

	egressResult, err := h.engine.EvaluateReliability(ctx, &payload)
	if err != nil {
		log.Printf("[ERROR] Engine A evaluation failed for feeder %s: %v", payload.Asset.FeederID, err)
		writeError(w, "Calculation engine execution failure", http.StatusBadGateway)
		return
	}

	mappedStatus, err := MapRiskBandToStatus(egressResult.RiskBand)
	if err != nil {
		log.Printf("[ERROR] Engine A returned unknown risk_band %s for feeder %s", egressResult.RiskBand, payload.Asset.FeederID)
		writeError(w, "Calculation engine execution failure", http.StatusBadGateway)
		return
	}

	relScore := float64(egressResult.ReliabilityScore)
	if relScore < 0 || relScore > 100 {
		log.Printf("[ERROR] Engine A returned out of bounds reliability_score %v for feeder %s", relScore, payload.Asset.FeederID)
		writeError(w, "Calculation engine execution failure", http.StatusBadGateway)
		return
	}
	relScore = Round2Dec(relScore)

	err = h.db.IngestOperationalPayload(ctx, &payload, relScore, mappedStatus)
	if err != nil {
		log.Printf("[ERROR] DB Ingest failed for feeder %s: %v", payload.Asset.FeederID, err)
		writeError(w, "Internal database error during persistence", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(egressResult)
}

