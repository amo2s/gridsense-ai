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
	// UserContextKey is the memory address used to securely store and retrieve the identity.
	UserContextKey = &contextKey{"user_context"}
	// RawTokenContextKey stores the raw JWT token string for forwarding to gRPC.
	RawTokenContextKey = &contextKey{"raw_token"}
)

// UserIdentity strictly holds the verified core claims extracted from the JWT.
type UserIdentity struct {
	UserID string
	Role   string
}

// AuthClaims represents the expected cryptographic payload of the incoming Next.js JWT.
type AuthClaims struct {
	UserID string `json:"user_id"`
	Role   string `json:"role"`
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
			identity := &UserIdentity{
				UserID: claims.UserID,
				Role:   claims.Role,
			}

			// Inject the strongly-typed identity into the request context and propagate.
			ctx := context.WithValue(r.Context(), UserContextKey, identity)
			// Also store the raw token for forwarding to gRPC.
			ctx = context.WithValue(ctx, RawTokenContextKey, tokenStr)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// GetUserIdentity is a type-safe accessor used by the GraphQL resolvers.
func GetUserIdentity(ctx context.Context) (*UserIdentity, error) {
	identity, ok := ctx.Value(UserContextKey).(*UserIdentity)
	if !ok || identity == nil {
		return nil, errors.New("unauthenticated request boundary")
	}
	return identity, nil
}

// GetRawToken retrieves the raw JWT token string from context for forwarding to gRPC.
func GetRawToken(ctx context.Context) (string, bool) {
	token, ok := ctx.Value(RawTokenContextKey).(string)
	return token, ok
}