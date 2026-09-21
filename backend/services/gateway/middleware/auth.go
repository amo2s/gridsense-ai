package middleware

import (
	"context"
	"encoding/json"
	"errors"
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

// Sentinel errors for JWT validation to allow HTTP middleware to return exact original messages.
var (
	ErrInvalidToken   = errors.New("invalid or expired token")
	ErrInvalidPayload = errors.New("invalid token payload")
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

// ValidateJWT parses and validates a JWT token string, returning the user ID (sub claim).
// This shared function is used by both HTTP middleware and gRPC interceptors.
// Returns sentinel errors for HTTP middleware to map to exact original messages.
func ValidateJWT(tokenString, jwtSecret string) (string, error) {
	secretKey := []byte(jwtSecret)

	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		// Strictly enforce HMAC signing to prevent algorithm confusion attacks
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return secretKey, nil
	})

	if err != nil || !token.Valid {
		return "", ErrInvalidToken
	}

	if claims, ok := token.Claims.(jwt.MapClaims); ok {
		if sub, ok := claims["sub"].(string); ok {
			return sub, nil
		}
	}

	return "", ErrInvalidPayload
}

// RequireAuth wraps an http.Handler to enforce JWT validation.
func RequireAuth(jwtSecret string) func(http.Handler) http.Handler {
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
			userID, err := ValidateJWT(tokenString, jwtSecret)
			if err != nil {
				// Map sentinel errors to original exact HTTP 401 messages
				if errors.Is(err, ErrInvalidToken) {
					writeJSONError(w, "Invalid or expired token", http.StatusUnauthorized)
				} else if errors.Is(err, ErrInvalidPayload) {
					writeJSONError(w, "Invalid token payload", http.StatusUnauthorized)
				} else {
					writeJSONError(w, err.Error(), http.StatusUnauthorized)
				}
				return
			}

			// 4. Inject user ID into the request context
			ctx := context.WithValue(r.Context(), UserIDKey, userID)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// GetUserID securely retrieves the authenticated user's ID from the request context.
// Handlers can call this to know exactly who is making the request.
func GetUserID(ctx context.Context) (string, bool) {
	userID, ok := ctx.Value(UserIDKey).(string)
	return userID, ok
}
