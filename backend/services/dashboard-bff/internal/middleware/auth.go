package middleware

import (
	"context"
	"errors"
	"net/http"
	"strings"

	"github.com/golang-jwt/jwt/v5"
)

// contextKey uses an unexported type to guarantee zero collisions in the context map.
type contextKey struct {
	name string
}

var (
	// TenantContextKey is the memory address used to securely store and retrieve the identity.
	TenantContextKey = &contextKey{"tenant_context"}
)

// TenantIdentity strictly holds the verified core claims extracted from the JWT.
type TenantIdentity struct {
	UserID   string
	TenantID string
	Role     string
}

// AuthClaims represents the expected cryptographic payload of the incoming Next.js JWT.
type AuthClaims struct {
	UserID   string `json:"user_id"`
	TenantID string `json:"tenant_id"`
	Role     string `json:"role"`
	jwt.RegisteredClaims
}

// AuthMiddleware constructs the HTTP interceptor for JWT cryptographic validation.
func AuthMiddleware(secret []byte) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			authHeader := r.Header.Get("Authorization")
			if authHeader == "" {
				http.Error(w, "missing authorization header", http.StatusUnauthorized)
				return
			}

			// Fast-path prefix check to avoid allocations on malformed headers.
			if len(authHeader) < 8 || !strings.HasPrefix(authHeader, "Bearer ") {
				http.Error(w, "malformed authorization payload", http.StatusUnauthorized)
				return
			}

			tokenStr := authHeader[7:]

			// Parse the token while enforcing memory-safe typed claims.
			token, err := jwt.ParseWithClaims(tokenStr, &AuthClaims{}, func(t *jwt.Token) (interface{}, error) {
				// Strictly enforce HMAC to prevent algorithm downgrade injection attacks.
				if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
					return nil, errors.New("unauthorized cryptosystem signature")
				}
				return secret, nil
			})

			if err != nil || !token.Valid {
				http.Error(w, "cryptographic validation failed", http.StatusUnauthorized)
				return
			}

			claims, ok := token.Claims.(*AuthClaims)
			if !ok {
				http.Error(w, "corrupt token claims structure", http.StatusUnauthorized)
				return
			}

			// Package the verified identity.
			identity := &TenantIdentity{
				UserID:   claims.UserID,
				TenantID: claims.TenantID,
				Role:     claims.Role,
			}

			// Inject the strongly-typed identity into the request context and propagate.
			ctx := context.WithValue(r.Context(), TenantContextKey, identity)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// GetTenantIdentity is a type-safe accessor used by the GraphQL resolvers and gRPC propagator.
func GetTenantIdentity(ctx context.Context) (*TenantIdentity, error) {
	identity, ok := ctx.Value(TenantContextKey).(*TenantIdentity)
	if !ok || identity == nil {
		return nil, errors.New("unauthenticated request boundary")
	}
	return identity, nil
}