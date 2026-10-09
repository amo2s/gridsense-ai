package login

import (
	"encoding/json"
	"errors"
	"log"
	"net"
	"net/http"
	"strings"

	// Update this import path to match your module name in go.mod
	"gridsense/auth/internal/events"
	"gridsense/auth/internal/shared"
)

// LoginRequest defines the exact JSON structure expected from the client.
type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

// Handler connects the HTTP transport layer to the business logic service.
type Handler struct {
	service   Service
	secure    bool // Toggles the Secure flag on cookies based on the environment
	publisher *events.Publisher
}

// NewHandler creates a new handler with the required dependencies.
func NewHandler(s Service, secureCookie bool, publisher *events.Publisher) *Handler {
	return &Handler{
		service:   s,
		secure:    secureCookie,
		publisher: publisher,
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

	// 4. Return Success Response
	// We return both tokens to the proxy, which will strip them and set HttpOnly cookies.
	payload := map[string]interface{}{
		"access_token":  result.AccessToken,
		"refresh_token": result.RefreshToken,
	}

	shared.RespondSuccess(w, http.StatusOK, payload)

	// Fire auth event asynchronously (non-blocking, best-effort)
	if h.publisher != nil {
		go func() {
			var clientIP string
			if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
				parts := strings.Split(xff, ",")
				clientIP = strings.TrimSpace(parts[0])
			} else if xrip := r.Header.Get("X-Real-IP"); xrip != "" {
				clientIP = strings.TrimSpace(xrip)
			} else {
				clientIP = strings.TrimSpace(r.RemoteAddr)
			}

			if host, _, err := net.SplitHostPort(clientIP); err == nil {
				clientIP = host
			}

			if net.ParseIP(clientIP) == nil {
				clientIP = "0.0.0.0"
			}

			evt := events.AuthEvent{
				EventType: "USER_LOGIN",
				UserID:    result.User.ID,
				UserName:  result.User.Email,
				UserEmail: result.User.Email,
				Action:    "login",
				IPAddress: clientIP,
			}
			if err := h.publisher.PublishAuthEvent(evt); err != nil {
				log.Printf("WARNING: Failed to publish login event: %v", err)
			}
		}()
	}
}
