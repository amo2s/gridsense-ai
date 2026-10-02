// backend/services/gateway/handlers/auth_handler.go
package handlers

import (
	"io"
	"net/http"
	"time"
)

type AuthHandler struct {
	authServiceURL string
	client         *http.Client
}

func NewAuthHandler(authServiceURL string) *AuthHandler {
	return &AuthHandler{
		authServiceURL: authServiceURL,
		client: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

// ProxyRequest dynamically forwards raw traffic to the Auth Service to prevent payload struct bloat.
func (h *AuthHandler) ProxyRequest(w http.ResponseWriter, r *http.Request) {
	targetURL := h.authServiceURL + r.URL.RequestURI()

	req, err := http.NewRequest(r.Method, targetURL, r.Body)
	if err != nil {
		http.Error(w, "Failed to construct request", http.StatusInternalServerError)
		return
	}

	// Propagate required headers for JWTs and HTTP-Only cookies
	req.Header.Set("Content-Type", r.Header.Get("Content-Type"))
	if authHeader := r.Header.Get("Authorization"); authHeader != "" {
		req.Header.Set("Authorization", authHeader)
	}
	if cookie := r.Header.Get("Cookie"); cookie != "" {
		req.Header.Set("Cookie", cookie)
	}

	// Propagate original client IP
	clientIP := r.Header.Get("X-Forwarded-For")
	if clientIP == "" {
		clientIP = r.RemoteAddr
	}
	req.Header.Set("X-Forwarded-For", clientIP)

	resp, err := h.client.Do(req)
	if err != nil {
		http.Error(w, "Auth service unreachable", http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	// Propagate response headers (critical for Set-Cookie)
	for key, values := range resp.Header {
		for _, value := range values {
			w.Header().Add(key, value)
		}
	}

	w.WriteHeader(resp.StatusCode)
	io.Copy(w, resp.Body)
}
