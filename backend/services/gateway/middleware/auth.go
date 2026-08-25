package middleware

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/golang-jwt/jwt/v5"
)

// contextKey is an unexported custom type to prevent collisions in the context map.
type contextKey string

const (
	// UserIDKey is the context key used to store the authenticated user's ID.
	UserIDKey contextKey = "user_id"
)

// jsonError represents a standardized API error response.
type jsonError struct {
	Error string `json:"error"`
}

// requireAuth is a helper to write standard JSON error responses.
func writeJSONError(w http.ResponseWriter, message string, statusCode int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	json.NewEncoder(w).Encode(jsonError{Error: message})
}

// RequireAuth wraps an http.Handler to enforce JWT validation.
func RequireAuth(jwtSecret string) func(http.Handler) http.Handler {
	// Parse the secret once during initialization to avoid allocating on every request
	secretKey := []byte(jwtSecret)

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// 1. Extract the Authorization header
			authHeader := r.Header.Get("Authorization")
			if authHeader == "" {
				writeJSONError(w, "Missing Authorization header", http.StatusUnauthorized)
				return
			}

			// 2. Validate the "Bearer <token>" format securely
			parts := strings.SplitN(authHeader, " ", 2)
			if len(parts) != 2 || strings.ToLower(parts[0]) != "bearer" {
				writeJSONError(w, "Invalid Authorization header format", http.StatusUnauthorized)
				return
			}

			tokenString := parts[1]

			// 3. Parse and cryptographically verify the token signature
			token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
				// Strictly enforce HMAC signing to prevent algorithm confusion attacks
				if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
					return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
				}
				return secretKey, nil
			})

			if err != nil || !token.Valid {
				writeJSONError(w, "Invalid or expired token", http.StatusUnauthorized)
				return
			}

			// 4. Extract claims and inject into the request context
			if claims, ok := token.Claims.(jwt.MapClaims); ok {
				// Assuming 'sub' holds the user ID based on standard JWT specs
				if sub, ok := claims["sub"].(string); ok {
					// Create a derived context containing the user ID
					ctx := context.WithValue(r.Context(), UserIDKey, sub)
					// Pass the new context down the chain to the actual handler
					next.ServeHTTP(w, r.WithContext(ctx))
					return
				}
			}

			writeJSONError(w, "Invalid token payload", http.StatusUnauthorized)
		})
	}
}

// GetUserID securely retrieves the authenticated user's ID from the request context.
// Handlers can call this to know exactly who is making the request.
func GetUserID(ctx context.Context) (string, bool) {
	userID, ok := ctx.Value(UserIDKey).(string)
	return userID, ok
}