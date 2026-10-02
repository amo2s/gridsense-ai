package admin

import (
	"errors"
	"log"
	"net/http"

	"github.com/go-chi/chi/v5"

	// Using the exact module path from your go.mod
	"gridsense/auth/internal/events"
	"gridsense/auth/internal/shared"
)

// Handler binds the HTTP transport layer to the administrative business logic.
type Handler struct {
	service   Service
	publisher *events.Publisher
}

// NewHandler acts as the dependency injection constructor.
func NewHandler(s Service, publisher *events.Publisher) *Handler {
	return &Handler{service: s, publisher: publisher}
}

// =========================================================================
// HTTP Endpoints (Step 5.3 Blueprint Fulfillment)
// =========================================================================

// HandleGetPendingUsers processes GET requests to list all accounts awaiting approval.
func (h *Handler) HandleGetPendingUsers(w http.ResponseWriter, r *http.Request) {
	users, err := h.service.GetPendingUsers(r.Context())
	if err != nil {
		shared.RespondInternal(w, err)
		return
	}

	// Always return a clean JSON array, even if empty.
	shared.RespondSuccess(w, http.StatusOK, users)
}

// HandleApproveUser processes PATCH/PUT requests to upgrade a user to "Approved".
func (h *Handler) HandleApproveUser(w http.ResponseWriter, r *http.Request) {
	// Extract the target UUID dynamically from the URL path (e.g., /users/{id}/approve)
	userID := chi.URLParam(r, "id")
	if userID == "" {
		shared.RespondBadRequest(w, "User ID is missing from the URL parameters", nil)
		return
	}

	err := h.service.ApproveUser(r.Context(), userID)
	if err != nil {
		// Map strict domain errors to HTTP equivalents
		if errors.Is(err, ErrUserNotFound) {
			shared.WriteError(w, http.StatusNotFound, "NOT_FOUND", "The requested user does not exist", err)
			return
		}
		if errors.Is(err, ErrInvalidUserID) {
			shared.RespondBadRequest(w, "The provided User ID format is invalid", err)
			return
		}

		shared.RespondInternal(w, err)
		return
	}

	payload := map[string]string{"message": "User account has been successfully approved."}
	shared.RespondSuccess(w, http.StatusOK, payload)

	// Fire admin approval event asynchronously
	if h.publisher != nil {
		go func() {
			evt := events.AuthEvent{
				EventType: "USER_APPROVED",
				UserID:    userID,
				Action:    "approve",
			}
			if err := h.publisher.PublishAuthEvent(evt); err != nil {
				log.Printf("WARNING: Failed to publish approval event: %v", err)
			}
		}()
	}
}

// HandleDeleteUser processes DELETE requests to permanently wipe a user record.
func (h *Handler) HandleDeleteUser(w http.ResponseWriter, r *http.Request) {
	// Extract the target UUID dynamically from the URL path
	userID := chi.URLParam(r, "id")
	if userID == "" {
		shared.RespondBadRequest(w, "User ID is missing from the URL parameters", nil)
		return
	}

	err := h.service.DeleteUser(r.Context(), userID)
	if err != nil {
		if errors.Is(err, ErrUserNotFound) {
			shared.WriteError(w, http.StatusNotFound, "NOT_FOUND", "The requested user does not exist", err)
			return
		}
		if errors.Is(err, ErrInvalidUserID) {
			shared.RespondBadRequest(w, "The provided User ID format is invalid", err)
			return
		}

		shared.RespondInternal(w, err)
		return
	}

	payload := map[string]string{"message": "User record has been permanently deleted."}
	shared.RespondSuccess(w, http.StatusOK, payload)

	// Fire admin deletion event asynchronously
	if h.publisher != nil {
		go func() {
			evt := events.AuthEvent{
				EventType: "USER_DELETED",
				UserID:    userID,
				Action:    "delete",
			}
			if err := h.publisher.PublishAuthEvent(evt); err != nil {
				log.Printf("WARNING: Failed to publish deletion event: %v", err)
			}
		}()
	}
}
