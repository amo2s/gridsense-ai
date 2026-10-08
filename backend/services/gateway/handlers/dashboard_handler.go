package handlers

import (
	"encoding/json"
	"log"
	"net/http"

	"gateway/bridge"
)

type DashboardHandler struct {
	repo        DashboardRepository
	alertClient *bridge.AlertBridgeClient
}

func NewDashboardHandler(repo DashboardRepository, alertClient *bridge.AlertBridgeClient) *DashboardHandler {
	return &DashboardHandler{
		repo:        repo,
		alertClient: alertClient,
	}
}

// JSON Structs for API responses
type DashboardSummaryResponse struct {
	DashboardSummary struct {
		OverallReliabilityScore float64 `json:"overallReliabilityScore"`
		ActiveHighRiskAreas     int32   `json:"activeHighRiskAreas"`
		TotalActiveAlerts       int     `json:"totalActiveAlerts"`
	} `json:"dashboardSummary"`
}

func (h *DashboardHandler) HandleGetReliabilitySummary(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	timeRange := r.URL.Query().Get("timeRange")
	if timeRange == "" {
		timeRange = "24h"
	}

	summary, err := h.repo.GetDashboardSummary(ctx, timeRange)
	if err != nil {
		log.Printf("ERROR: GetDashboardSummary failed: %v", err)
		http.Error(w, "Failed to retrieve summary", http.StatusInternalServerError)
		return
	}

	// Fetch active alerts for total count
	alerts, err := h.alertClient.FetchActiveAlerts(ctx)
	totalActiveAlerts := 0
	if err != nil {
		log.Printf("WARN: FetchActiveAlerts failed, defaulting to 0: %v", err)
	} else {
		totalActiveAlerts = len(alerts)
	}

	var resp DashboardSummaryResponse
	resp.DashboardSummary.OverallReliabilityScore = summary.OverallReliabilityScore
	resp.DashboardSummary.ActiveHighRiskAreas = summary.ActiveHighRiskAreas
	resp.DashboardSummary.TotalActiveAlerts = totalActiveAlerts

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(resp); err != nil {
		log.Printf("ERROR: JSON encoding failed for HandleGetReliabilitySummary: %v", err)
	}
}

type PriorityAreasResponse struct {
	PriorityAreas []PriorityAreaJSON `json:"priorityAreas"`
}

type PriorityAreaJSON struct {
	ID          string  `json:"id"`
	Name        string  `json:"name"`
	UrgencyRank int32   `json:"urgencyRank"`
	RiskScore   float64 `json:"riskScore"`
	Status      string  `json:"status"`
}

func (h *DashboardHandler) HandleGetPriorityAreas(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	areas, err := h.repo.GetPriorityAreas(ctx)
	if err != nil {
		log.Printf("ERROR: GetPriorityAreas failed: %v", err)
		http.Error(w, "Failed to retrieve priority areas", http.StatusInternalServerError)
		return
	}

	var resp PriorityAreasResponse
	resp.PriorityAreas = make([]PriorityAreaJSON, len(areas))
	for i, a := range areas {
		resp.PriorityAreas[i] = PriorityAreaJSON{
			ID:          a.ID,
			Name:        a.Name,
			UrgencyRank: a.UrgencyRank,
			RiskScore:   a.RiskScore,
			Status:      a.Status,
		}
	}
	
	// Ensure empty array instead of null
	if resp.PriorityAreas == nil {
		resp.PriorityAreas = []PriorityAreaJSON{}
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(resp); err != nil {
		log.Printf("ERROR: JSON encoding failed for HandleGetPriorityAreas: %v", err)
	}
}

type ReliabilityTrendResponse struct {
	ReliabilityTrend []TrendDataPointJSON `json:"reliabilityTrend"`
}

type TrendDataPointJSON struct {
	Timestamp string  `json:"timestamp"`
	Value     float64 `json:"value"`
}

func (h *DashboardHandler) HandleGetReliabilityTrend(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	timeRange := r.URL.Query().Get("timeRange")
	if timeRange == "" {
		timeRange = "24h"
	}

	trend, err := h.repo.GetReliabilityTrend(ctx, timeRange)
	if err != nil {
		log.Printf("ERROR: GetReliabilityTrend failed: %v", err)
		http.Error(w, "Failed to retrieve reliability trend", http.StatusInternalServerError)
		return
	}

	var resp ReliabilityTrendResponse
	resp.ReliabilityTrend = make([]TrendDataPointJSON, len(trend))
	for i, pt := range trend {
		resp.ReliabilityTrend[i] = TrendDataPointJSON{
			Timestamp: pt.Timestamp.Format("2006-01-02T15:04:05Z07:00"),
			Value:     pt.Value,
		}
	}
	
	// Ensure empty array instead of null
	if resp.ReliabilityTrend == nil {
		resp.ReliabilityTrend = []TrendDataPointJSON{}
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(resp); err != nil {
		log.Printf("ERROR: JSON encoding failed for HandleGetReliabilityTrend: %v", err)
	}
}
