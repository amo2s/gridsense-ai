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
			// Skip HTTP header auth for WebSocket upgrades (token is in InitPayload)
			if strings.ToLower(r.Header.Get("Upgrade")) == "websocket" {
				next.ServeHTTP(w, r)
				return
			}

			authHeader := r.Header.Get("Authorization")
			if authHeader == "" {
				http.Error(w, "missing authorization header", http.StatusUnauthorized)
				return
			}

			if len(authHeader) < 8 || !strings.HasPrefix(authHeader, "Bearer ") {
				http.Error(w, "malformed authorization payload", http.StatusUnauthorized)
				return
			}

			tokenStr := authHeader[7:]

			identity, err := ValidateToken(tokenStr, secret)
			if err != nil {
				http.Error(w, err.Error(), http.StatusUnauthorized)
				return
			}

			// Inject the strongly-typed identity into the request context and propagate.
			ctx := context.WithValue(r.Context(), UserContextKey, identity)
			ctx = context.WithValue(ctx, RawTokenContextKey, tokenStr)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// ValidateToken parses and verifies the JWT token string, returning the UserIdentity.
func ValidateToken(tokenStr string, secret []byte) (*UserIdentity, error) {
	token, err := jwt.ParseWithClaims(tokenStr, &AuthClaims{}, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("unauthorized cryptosystem signature")
		}
		return secret, nil
	})

	if err != nil || !token.Valid {
		return nil, errors.New("cryptographic validation failed")
	}

	claims, ok := token.Claims.(*AuthClaims)
	if !ok {
		return nil, errors.New("corrupt token claims structure")
	}

	return &UserIdentity{
		UserID: claims.UserID,
		Role:   claims.Role,
	}, nil
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