package login

import (
	"encoding/json"
	"errors"
	"net/http"
	"time"

	// Update this import path to match your module name in go.mod
	"gridsense/auth/internal/shared"
)

// LoginRequest defines the exact JSON structure expected from the client.
type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

// Handler connects the HTTP transport layer to the business logic service.
type Handler struct {
	service Service
	secure  bool // Toggles the Secure flag on cookies based on the environment
}

// NewHandler creates a new handler with the required dependencies.
func NewHandler(s Service, secureCookie bool) *Handler {
	return &Handler{
		service: s,
		secure:  secureCookie,
	}
}

// HandleLogin processes the incoming request and issues session tokens.
func (h *Handler) HandleLogin(w http.ResponseWriter, r *http.Request) {
	// 1. Limit Request Size (1MB) to prevent memory exhaustion
	r.Body = http.MaxBytesReader(w, r.Body, 1048576)

	// 2. Strict JSON Parsing
	var req LoginRequest
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields() // Reject unexpected fields

	if err := decoder.Decode(&req); err != nil {
		shared.RespondBadRequest(w, "Invalid JSON payload format", err)
		return
	}

	// 3. Trigger the Service Layer
	result, err := h.service.Login(r.Context(), req.Email, req.Password)
	if err != nil {
		// Map domain errors to proper HTTP status codes
		switch {
		case errors.Is(err, ErrInvalidCredentials):
			shared.RespondUnauthorized(w, "Invalid email or password", err)
		case errors.Is(err, ErrAccountNotApproved):
			shared.RespondForbidden(w, "Account approval is pending", err)
		case errors.Is(err, ErrAccountRejected):
			shared.RespondForbidden(w, "Account access has been rejected", err)
		case errors.Is(err, ErrMissingCredentials):
			shared.RespondBadRequest(w, "Email and password are required", err)
		default:
			shared.RespondInternal(w, err)
		}
		return
	}

	// 4. Secure Cookie Configuration (Step 4.3 Blueprint Requirement)
	cookie := &http.Cookie{
		Name:     "refresh_token",
		Value:    result.RefreshToken,
		Path:     "/api/auth/refresh", // Restrict where the browser sends this cookie
		Expires:  time.Now().Add(7 * 24 * time.Hour),
		HttpOnly: true, // Hide from JavaScript
		Secure:   h.secure, // Require HTTPS in production
		SameSite: http.SameSiteStrictMode, // Prevent CSRF attacks
	}
	http.SetCookie(w, cookie)

	// 5. Return Success Response
	// We return the Access Token and the sanitized User record, omitting the refresh token.
	payload := map[string]interface{}{
		"access_token": result.AccessToken,
		"user":         result.User,
	}

	shared.RespondSuccess(w, http.StatusOK, payload)
}