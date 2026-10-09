package refresh

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"gridsense/auth/internal/shared"
)

type Handler struct {
	service Service
}

func NewHandler(s Service) *Handler {
	return &Handler{service: s}
}

func (h *Handler) HandleRefresh(w http.ResponseWriter, r *http.Request) {
	// First check cookie, then header, then body
	var refreshToken string

	if cookie, err := r.Cookie("refresh_token"); err == nil {
		refreshToken = cookie.Value
	} else if authHeader := r.Header.Get("Authorization"); authHeader != "" {
		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) == 2 && strings.ToLower(parts[0]) == "bearer" {
			refreshToken = parts[1]
		}
	} else if r.Method == http.MethodPost {
		var payload struct {
			RefreshToken string `json:"refresh_token"`
		}
		if err := json.NewDecoder(r.Body).Decode(&payload); err == nil {
			refreshToken = payload.RefreshToken
		}
	}

	if refreshToken == "" {
		shared.RespondUnauthorized(w, "Missing refresh token", nil)
		return
	}

	res, err := h.service.Refresh(r.Context(), refreshToken)
	if err != nil {
		if errors.Is(err, ErrInvalidRefresh) || errors.Is(err, shared.ErrTokenExpired) || errors.Is(err, shared.ErrTokenInvalid) {
			shared.RespondUnauthorized(w, "Session expired or invalid", err)
			return
		}
		shared.RespondInternal(w, err)
		return
	}

	payload := map[string]interface{}{
		"access_token":  res.AccessToken,
		"refresh_token": res.RefreshToken,
	}

	shared.RespondSuccess(w, http.StatusOK, payload)
}
