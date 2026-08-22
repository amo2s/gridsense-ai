package middleware

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/http"
	"strings"

	// Update this import path to match your module name in go.mod
	"gridsense/auth/internal/shared"
)

// contextKey is a custom type used to prevent context collisions across packages.
type contextKey string

const (
	// UserClaimsKey is the exact key used to store and retrieve token claims in the request context.
	UserClaimsKey contextKey = "user_claims"
)

// AuthMiddleware manages the dependencies required for protecting routes.
type AuthMiddleware struct {
	jwtSecret []byte
	redis     *shared.RedisClient // Using your custom Upstash REST client
}

// NewAuthMiddleware constructs the middleware with the required secret and cache client.
func NewAuthMiddleware(jwtSecret []byte, redisClient *shared.RedisClient) *AuthMiddleware {
	return &AuthMiddleware{
		jwtSecret: jwtSecret,
		redis:     redisClient,
	}
}

// RequireAuth intercepts the HTTP request to enforce strict security checks before allowing access.
func (m *AuthMiddleware) RequireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// 1. Extract the Authorization Header
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			shared.RespondUnauthorized(w, "Missing Authorization header", nil)
			return
		}

		// 2. Validate the "Bearer" Prefix
		parts := strings.Split(authHeader, " ")
		if len(parts) != 2 || strings.ToLower(parts[0]) != "bearer" {
			shared.RespondUnauthorized(w, "Invalid Authorization header format", nil)
			return
		}
		accessToken := parts[1]

		// 3. Cryptographic Token Validation (Blueprint Requirement)
		// This verifies the signature and checks the expiration time.
		claims, err := shared.ValidateToken(accessToken, m.jwtSecret)
		if err != nil {
			shared.RespondUnauthorized(w, "Invalid or expired access token", err)
			return
		}

		// 4. High-Speed Stateful Revocation Check (Blueprint Requirement)
		// We hash the token to match the exact format used by the Logout service.
		hash := sha256.Sum256([]byte(accessToken))
		tokenID := hex.EncodeToString(hash[:])
		blocklistKey := fmt.Sprintf("blocklist:%s", tokenID)

		// Query Upstash REST. If the key exists without an error, the token was revoked.
		val, err := m.redis.Get(r.Context(), blocklistKey)
		if err == nil && val != "" {
			shared.RespondUnauthorized(w, "This session has been revoked. Please log in again.", nil)
			return
		}

		// 5. Context Injection
		// We inject the validated claims into the request context.
		// Downstream handlers can now pull the UserID or Role instantly without parsing the token again.
		ctx := context.WithValue(r.Context(), UserClaimsKey, claims)

		// 6. Pass Control to the Next Handler
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// =========================================================================
// Context Extraction Helper
// =========================================================================

// GetClaimsFromContext is a helper function that your downstream handlers will call
// to instantly retrieve the authenticated user's data from memory.
func GetClaimsFromContext(ctx context.Context) (*shared.TokenClaims, bool) {
	claims, ok := ctx.Value(UserClaimsKey).(*shared.TokenClaims)
	return claims, ok
}
