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

type contextKey string

const (
	UserIDKey contextKey = "user_id"
	RoleKey   contextKey = "role"
	StatusKey contextKey = "status"
)

var (
	ErrInvalidToken   = errors.New("invalid or expired token")
	ErrInvalidPayload = errors.New("invalid token payload")
)

type jsonError struct {
	Error string `json:"error"`
}

func writeJSONError(w http.ResponseWriter, message string, statusCode int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	json.NewEncoder(w).Encode(jsonError{Error: message})
}

// ValidateJWTWithClaims parses a JWT and extracts sub, role, and status.
func ValidateJWTWithClaims(tokenString, jwtSecret string) (string, string, string, error) {
	secretKey := []byte(jwtSecret)

	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return secretKey, nil
	})

	if err != nil || !token.Valid {
		return "", "", "", ErrInvalidToken
	}

	if claims, ok := token.Claims.(jwt.MapClaims); ok {
		sub, _ := claims["sub"].(string)
		role, _ := claims["role"].(string)
		status, _ := claims["status"].(string)
		if sub != "" {
			return sub, role, status, nil
		}
	}

	return "", "", "", ErrInvalidPayload
}

// ValidateJWT wraps ValidateJWTWithClaims to preserve the original signature for existing users (e.g. gRPC).
func ValidateJWT(tokenString, jwtSecret string) (string, error) {
	sub, _, _, err := ValidateJWTWithClaims(tokenString, jwtSecret)
	return sub, err
}

// RequireAuth wraps an http.Handler to enforce standard JWT validation.
func RequireAuth(jwtSecret string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Method == http.MethodOptions {
				next.ServeHTTP(w, r)
				return
			}
			authHeader := r.Header.Get("Authorization")
			if authHeader == "" {
				writeJSONError(w, "Missing Authorization header", http.StatusUnauthorized)
				return
			}

			parts := strings.SplitN(authHeader, " ", 2)
			if len(parts) != 2 || strings.ToLower(parts[0]) != "bearer" {
				writeJSONError(w, "Invalid Authorization header format", http.StatusUnauthorized)
				return
			}

			tokenString := parts[1]

			userID, err := ValidateJWT(tokenString, jwtSecret)
			if err != nil {
				if errors.Is(err, ErrInvalidToken) {
					writeJSONError(w, "Invalid or expired token", http.StatusUnauthorized)
				} else if errors.Is(err, ErrInvalidPayload) {
					writeJSONError(w, "Invalid token payload", http.StatusUnauthorized)
				} else {
					writeJSONError(w, err.Error(), http.StatusUnauthorized)
				}
				return
			}

			ctx := context.WithValue(r.Context(), UserIDKey, userID)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// RequireRole wraps an http.Handler to enforce JWT validation and strict role+status matching.
func RequireRole(jwtSecret, requiredRole, requiredStatus string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Method == http.MethodOptions {
				next.ServeHTTP(w, r)
				return
			}
			authHeader := r.Header.Get("Authorization")
			if authHeader == "" {
				writeJSONError(w, "Missing Authorization header", http.StatusUnauthorized)
				return
			}

			parts := strings.SplitN(authHeader, " ", 2)
			if len(parts) != 2 || strings.ToLower(parts[0]) != "bearer" {
				writeJSONError(w, "Invalid Authorization header format", http.StatusUnauthorized)
				return
			}

			tokenString := parts[1]

			userID, role, status, err := ValidateJWTWithClaims(tokenString, jwtSecret)
			if err != nil {
				if errors.Is(err, ErrInvalidToken) {
					writeJSONError(w, "Invalid or expired token", http.StatusUnauthorized)
				} else if errors.Is(err, ErrInvalidPayload) {
					writeJSONError(w, "Invalid token payload", http.StatusUnauthorized)
				} else {
					writeJSONError(w, err.Error(), http.StatusUnauthorized)
				}
				return
			}

			if !strings.EqualFold(role, requiredRole) || !strings.EqualFold(status, requiredStatus) {
				writeJSONError(w, "Forbidden: insufficient permissions", http.StatusForbidden)
				return
			}

			ctx := context.WithValue(r.Context(), UserIDKey, userID)
			ctx = context.WithValue(ctx, RoleKey, role)
			ctx = context.WithValue(ctx, StatusKey, status)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func GetUserID(ctx context.Context) (string, bool) {
	userID, ok := ctx.Value(UserIDKey).(string)
	return userID, ok
}

