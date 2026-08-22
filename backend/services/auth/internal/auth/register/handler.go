package register

import (
	"encoding/json"
	"errors"
	"net/http"

	// Update this import path to match your module name in go.mod
	"gridsense/auth/internal/shared"
)

// RegisterRequest dictates the exact JSON structure we expect from the frontend.
type RegisterRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

// Handler binds the HTTP transport layer to the business logic service.
type Handler struct {
	service Service
}

// NewHandler acts as the dependency injection constructor.
func NewHandler(s Service) *Handler {
	return &Handler{service: s}
}

// HandleRegister is the main HTTP endpoint function.
func (h *Handler) HandleRegister(w http.ResponseWriter, r *http.Request) {
	// 1. Defend Against Memory Exhaustion (DDoS Protection)
	// Restrict the incoming JSON payload to a maximum of 1 Megabyte.
	r.Body = http.MaxBytesReader(w, r.Body, 1048576)

	// 2. Strict JSON Parsing
	var req RegisterRequest
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields() // Reject payloads containing unexpected fields
	
	if err := decoder.Decode(&req); err != nil {
		shared.RespondBadRequest(w, "Invalid JSON payload format", err)
		return
	}

	// 3. Trigger the Service Layer (Step 3.3 Blueprint Requirement)
	// We pass r.Context() so if the user closes their browser early, the DB query cancels.
	user, err := h.service.Register(r.Context(), req.Email, req.Password)
	if err != nil {
		// Map domain errors to standard HTTP status codes
		if errors.Is(err, ErrEmailAlreadyExists) {
			shared.WriteError(w, http.StatusConflict, "CONFLICT", "This email is already in use.", err)
			return
		}
		
		// If it's a generic bad request (like missing fields)
		if err.Error() == "email and password are required" {
			shared.RespondBadRequest(w, err.Error(), err)
			return
		}

		// Fallback for severe system crashes (database offline, etc.)
		shared.RespondInternal(w, err)
		return
	}

	// 4. Return Success Response
	// The blueprint mandates returning a success response WITHOUT exposing tokens.
	// Since our `User` struct uses `json:"-"` on the PasswordHash, it is automatically sanitized.
	shared.RespondSuccess(w, http.StatusCreated, user)
}