package logout

import (
	"errors"
	"net/http"
	"strings"
	"time"

	// Update this import path to match your module name in go.mod
	"gridsense/auth/internal/shared"
)

// Handler connects the HTTP transport layer to the logout business logic.
type Handler struct {
	service Service
	secure  bool // Toggles the Secure flag on cookies based on the environment
}

// NewHandler creates a new handler with the required service and secure cookie flag.
func NewHandler(s Service, secureCookie bool) *Handler {
	return &Handler{
		service: s,
		secure:  secureCookie,
	}
}

// HandleLogout processes the logout request, revokes tokens in Redis, and clears browser cookies.
func (h *Handler) HandleLogout(w http.ResponseWriter, r *http.Request) {
	// 1. Extract the Access Token from the Authorization Header
	authHeader := r.Header.Get("Authorization")
	if authHeader == "" {
		shared.RespondUnauthorized(w, "Missing Authorization header", nil)
		return
	}

	// Expecting strict format: "Bearer <token>"
	parts := strings.Split(authHeader, " ")
	if len(parts) != 2 || strings.ToLower(parts[0]) != "bearer" {
		shared.RespondUnauthorized(w, "Invalid Authorization header format", nil)
		return
	}
	accessToken := parts[1]

	// 2. Trigger the Service Layer 
	// This writes the token to the Redis blocklist and deletes the refresh session cache.
	err := h.service.Logout(r.Context(), accessToken)
	if err != nil {
		// If the token is already expired/invalid, we still want to proceed and wipe their cookies.
		// However, for severe system errors (e.g., Redis is offline), we return a 500.
		if !errors.Is(err, ErrInvalidToken) {
			shared.RespondInternal(w, err)
			return
		}
	}

	// 3. Destroy the Client-Side Session (Blueprint Requirement)
	// We overwrite the existing cookie with empty values and force it to expire immediately.
	cookie := &http.Cookie{
		Name:     "refresh_token",
		Value:    "",
		Path:     "/api/auth/refresh",
		Expires:  time.Unix(0, 0), // January 1, 1970
		MaxAge:   -1,              // Tells the browser to delete the cookie immediately
		HttpOnly: true,
		Secure:   h.secure,
		SameSite: http.SameSiteStrictMode,
	}
	http.SetCookie(w, cookie)

	// 4. Return Success Response
	payload := map[string]string{
		"message": "Successfully logged out",
	}
	shared.RespondSuccess(w, http.StatusOK, payload)
}