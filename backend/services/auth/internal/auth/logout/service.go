package logout

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"time"

	// Update this import path to match your module name in go.mod
	"gridsense/auth/internal/shared"
)

// Sentinel Errors
var (
	ErrInvalidToken = errors.New("provided token is invalid or already expired")
)

// Service defines the strict business operation for securely terminating a session.
type Service interface {
	Logout(ctx context.Context, accessToken string) error
}

type logoutService struct {
	redis     *shared.RedisClient
	jwtSecret []byte
}

// NewService securely injects the Upstash Redis client and cryptographic key.
func NewService(redisClient *shared.RedisClient, jwtSecret []byte) Service {
	return &logoutService{
		redis:     redisClient,
		jwtSecret: jwtSecret,
	}
}

// Logout instantly revokes an access token and destroys the stateful refresh session.
func (s *logoutService) Logout(ctx context.Context, accessToken string) error {
	// 1. Parse and Validate the Access Token
	// We must ensure the token is legitimate before we allow someone to log out.
	claims, err := shared.ValidateToken(accessToken, s.jwtSecret)
	if err != nil {
		// If it's already expired, there's nothing to blocklist. We can safely ignore.
		if errors.Is(err, shared.ErrTokenExpired) {
			return nil
		}
		return ErrInvalidToken
	}

	// 2. Precision Lifetime Calculation (Step 4.4 Blueprint Requirement)
	// Calculate exactly how many seconds remain until the token naturally expires.
	remainingTime := time.Until(claims.ExpiresAt.Time)
	if remainingTime <= 0 {
		return nil // Token expired during computation, no blocklist needed
	}

	// 3. Generate a Lightweight Token ID
	// Hashing the token ensures we don't store massive JWT strings in RAM.
	hash := sha256.Sum256([]byte(accessToken))
	tokenID := hex.EncodeToString(hash[:])

	blocklistKey := fmt.Sprintf("blocklist:%s", tokenID)
	sessionKey := fmt.Sprintf("session:%s", claims.UserID)

	// 4. Execute Redis Operations
	// A. Push the token ID to the blocklist with an exact expiration matching its remaining life.
	if err := s.redis.Set(ctx, blocklistKey, "revoked", remainingTime); err != nil {
		return fmt.Errorf("failed to add token to blocklist: %w", err)
	}

	// B. Wipe the refresh token session from Redis.
	if err := s.redis.Del(ctx, sessionKey); err != nil {
		return fmt.Errorf("failed to delete refresh session: %w", err)
	}

	return nil
}
