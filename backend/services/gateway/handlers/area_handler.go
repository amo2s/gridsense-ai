package handlers

import (
	"encoding/json"
	"log/slog"
	"net/http"
)

// AreaHandler handles HTTP requests relating to operational grid areas.
type AreaHandler struct {
	repo AreaRepository
}

// NewAreaHandler constructs a new AreaHandler with the injected AreaRepository.
func NewAreaHandler(repo AreaRepository) *AreaHandler {
	return &AreaHandler{repo: repo}
}

// HandleGetAreas retrieves all operational grid areas and writes the JSON payload.
func (h *AreaHandler) HandleGetAreas(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusMethodNotAllowed)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "Method not allowed"})
		return
	}

	ctx := r.Context()
	areas, err := h.repo.FetchAllAreas(ctx)
	if err != nil {
		slog.Error("failed to retrieve operational areas", "error", err)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "failed to retrieve operational areas"})
		return
	}

	if areas == nil {
		areas = []AreaSummary{}
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	if err := json.NewEncoder(w).Encode(areas); err != nil {
		slog.Error("failed to encode areas response", "error", err)
	}
}
