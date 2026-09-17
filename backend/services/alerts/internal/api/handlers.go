package api

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"go.uber.org/zap"

	// Note: Adjust module path if your go.mod is not named "alerts"
	"github.com/gridsense-ai/alerts/internal/db"
	"github.com/gridsense-ai/alerts/internal/dispatcher"
	"github.com/gridsense-ai/alerts/internal/repository"
)

// AcknowledgeRequest maps the incoming JSON payload from the gateway.
type AcknowledgeRequest struct {
	UserID string `json:"user_id"`
	Notes  string `json:"notes,omitempty"`
}

// AlertController manages HTTP interactions for the Alert Microservice.
type AlertController struct {
	repo   repository.AlertRepository
	hub    *dispatcher.SSEHub
	logger *zap.Logger
}

// NewAlertController initializes the HTTP handlers with required dependencies.
func NewAlertController(repo repository.AlertRepository, hub *dispatcher.SSEHub, logger *zap.Logger) *AlertController {
	return &AlertController{
		repo:   repo,
		hub:    hub,
		logger: logger,
	}
}

// FetchActive handles GET requests to retrieve unresolved alerts from PostgreSQL.
func (c *AlertController) FetchActive(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	// Default to 100 alerts with 0 offset
	alerts, err := c.repo.ListActive(ctx, 100, 0)
	if err != nil {
		c.logger.Error("Failed to fetch active alerts from database", zap.Error(err))
		http.Error(w, "Failed to retrieve alerts", http.StatusInternalServerError)
		return
	}

	// Ensure we return an empty array instead of null for frontend maps
	if alerts == nil {
		alerts = []db.Alert{}
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(alerts); err != nil {
		c.logger.Error("Failed to encode alerts response", zap.Error(err))
	}
}

// Acknowledge handles PATCH requests to update an alert's lifecycle status.
func (c *AlertController) Acknowledge(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	alertID := chi.URLParam(r, "id")
	if alertID == "" {
		http.Error(w, "Alert ID is required", http.StatusBadRequest)
		return
	}

	var req AcknowledgeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request payload", http.StatusBadRequest)
		return
	}
	defer r.Body.Close()

	// Update status in the repository using the sqlc-generated params struct
	now := time.Now()
	alertUUID, err := uuid.Parse(alertID)
	if err != nil {
		http.Error(w, "Invalid alert ID format", http.StatusBadRequest)
		return
	}

	// Convert to sql.Null types for nullable fields
	var acknowledgedBy uuid.NullUUID
	if req.UserID != "" {
		uid, err := uuid.Parse(req.UserID)
		if err == nil {
			acknowledgedBy = uuid.NullUUID{UUID: uid, Valid: true}
		}
	}

	updateParams := db.UpdateAlertStatusParams{
		Status:         "RESOLVED",
		AcknowledgedAt: sql.NullTime{Time: now, Valid: true},
		AcknowledgedBy: acknowledgedBy,
		ResolvedAt:     sql.NullTime{Time: now, Valid: true},
		ID:             alertUUID,
	}
	_, err = c.repo.UpdateStatus(ctx, updateParams)
	if err != nil {
		c.logger.Error("Failed to acknowledge alert", zap.Error(err), zap.String("alert_id", alertID))
		http.Error(w, "Failed to update alert status", http.StatusInternalServerError)
		return
	}

	c.logger.Info("Alert acknowledged", zap.String("alert_id", alertID), zap.String("user_id", req.UserID))
	w.WriteHeader(http.StatusNoContent)
}

// StreamSSE handles persistent real-time connections from the API Gateway.
func (c *AlertController) StreamSSE(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		c.logger.Error("Streaming unsupported on current http.ResponseWriter")
		http.Error(w, "Streaming unsupported", http.StatusInternalServerError)
		return
	}

	// Set required headers for Server-Sent Events
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")

	clientChan := c.hub.Subscribe()

	// Ensure the client is unregistered when the connection drops
	defer func() {
		c.hub.Unsubscribe(clientChan)
		c.logger.Debug("SSE stream client disconnected and unregistered")
	}()

	c.logger.Debug("New SSE stream client connected")

	for {
		select {
		case <-r.Context().Done():
			// API Gateway or Next.js client closed the connection
			return
		case msg, ok := <-clientChan:
			if !ok {
				// Hub closed the channel
				return
			}
			// Write the SSE formatted payload
			_, err := w.Write([]byte("data: " + string(msg) + "\n\n"))
			if err != nil {
				c.logger.Error("Failed to write to SSE stream", zap.Error(err))
				return
			}
			// Push the chunk immediately to the gateway proxy
			flusher.Flush()
		}
	}
}
