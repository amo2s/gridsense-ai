package refresh

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"gridsense/auth/internal/shared"
)

var (
	ErrInvalidRefresh = errors.New("invalid or revoked refresh token")
)

type RefreshResult struct {
	AccessToken  string
	RefreshToken string
}

type cachedPair struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
}

type Service interface {
	Refresh(ctx context.Context, refreshToken string) (*RefreshResult, error)
}

type refreshService struct {
	db        *pgxpool.Pool
	redis     *shared.RedisClient
	jwtSecret []byte
}

func NewService(db *pgxpool.Pool, redis *shared.RedisClient, jwtSecret []byte) Service {
	return &refreshService{
		db:        db,
		redis:     redis,
		jwtSecret: jwtSecret,
	}
}

func (s *refreshService) Refresh(ctx context.Context, refreshToken string) (*RefreshResult, error) {
	// 1. Validate the JWT structure and signature
	claims, err := shared.ValidateToken(refreshToken, s.jwtSecret)
	if err != nil {
		return nil, err
	}

	userID := claims.UserID
	if userID == "" { // For refresh tokens, subject is used, but ValidateToken handles this
		userID = claims.Subject
	}
	if userID == "" {
		return nil, ErrInvalidRefresh
	}

	sessionKey := fmt.Sprintf("session:%s", userID)
	graceKey := fmt.Sprintf("session:%s:grace:%s", userID, refreshToken)

	// 2. Check the active session in Redis
	activeToken, err := s.redis.Get(ctx, sessionKey)
	if err != nil {
		// Key not found or error
		return s.handleReuseOrMissing(ctx, sessionKey, graceKey)
	}

	if activeToken != refreshToken {
		// Token mismatch. Could be a legitimate concurrent retry inside grace window.
		return s.handleReuseOrMissing(ctx, sessionKey, graceKey)
	}

	// 3. Token is valid and active. Proceed to generate new pair.
	return s.rotateSession(ctx, userID, sessionKey, graceKey, refreshToken)
}

func (s *refreshService) handleReuseOrMissing(ctx context.Context, sessionKey, graceKey string) (*RefreshResult, error) {
	// Check grace window
	graceData, err := s.redis.Get(ctx, graceKey)
	if err == nil && graceData != "" {
		// Found in grace window! Return the cached new pair.
		var pair cachedPair
		if err := json.Unmarshal([]byte(graceData), &pair); err == nil {
			return &RefreshResult{
				AccessToken:  pair.AccessToken,
				RefreshToken: pair.RefreshToken,
			}, nil
		}
	}

	// Not in grace window -> this is an illegitimate reuse or expired session.
	// Revoke the entire family to protect the account.
	_ = s.redis.Del(ctx, sessionKey)
	return nil, ErrInvalidRefresh
}

func (s *refreshService) rotateSession(ctx context.Context, userID, sessionKey, graceKey, oldRefreshToken string) (*RefreshResult, error) {
	// Fetch user details from DB to embed in new token
	query := `SELECT email, name, role, status FROM users WHERE id = $1`
	var email, name, role, status string
	err := s.db.QueryRow(ctx, query, userID).Scan(&email, &name, &role, &status)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrInvalidRefresh
		}
		return nil, fmt.Errorf("database query error: %w", err)
	}

	if status != "Approved" {
		return nil, ErrInvalidRefresh
	}

	// Generate new pair
	accessToken, newRefreshToken, err := shared.GenerateTokenPair(
		userID, email, name, role, status, s.jwtSecret,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to generate tokens: %w", err)
	}

	// Save new active session (7 days)
	sessionDuration := 7 * 24 * time.Hour
	if err := s.redis.Set(ctx, sessionKey, newRefreshToken, sessionDuration); err != nil {
		return nil, fmt.Errorf("failed to persist active session: %w", err)
	}

	// Save grace period for old token (10 seconds)
	gracePair := cachedPair{
		AccessToken:  accessToken,
		RefreshToken: newRefreshToken,
	}
	graceBytes, _ := json.Marshal(gracePair)
	_ = s.redis.Set(ctx, graceKey, string(graceBytes), 10*time.Second)

	return &RefreshResult{
		AccessToken:  accessToken,
		RefreshToken: newRefreshToken,
	}, nil
}
