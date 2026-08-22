package login

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	// Update this import path to match your actual module name in go.mod
	"gridsense/auth/internal/shared"
)

// =========================================================================
// Sentinel Domain Errors
// =========================================================================
var (
	ErrInvalidCredentials = errors.New("invalid email or password")
	ErrAccountNotApproved = errors.New("account approval is pending administrator review")
	ErrAccountRejected    = errors.New("account access has been rejected")
	ErrMissingCredentials = errors.New("both email and password are required")
)

// =========================================================================
// Domain Models
// =========================================================================

// User represents the minimal database payload needed for session creation.
// PasswordHash is strictly tagged with json:"-" to mathematically prevent leaks.
type User struct {
	ID           string    `json:"id"`
	Email        string    `json:"email"`
	PasswordHash string    `json:"-"`
	Role         string    `json:"role"`
	Status       string    `json:"status"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// LoginResult packages the newly minted session tokens alongside the sanitized user record.
type LoginResult struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"-"` // Prevents the refresh token from being exposed in JSON bodies
	User         *User  `json:"user"`
}

// =========================================================================
// Service Layer Interface & Constructor
// =========================================================================

// Service defines the strict business operations for user authentication.
type Service interface {
	Login(ctx context.Context, email, password string) (*LoginResult, error)
}

type loginService struct {
	db        *pgxpool.Pool
	redis     *shared.RedisClient
	jwtSecret []byte
}

// NewService acts as the dependency injection constructor.
// It securely wires up the PostgreSQL pool, Redis client, and cryptographic key.
func NewService(db *pgxpool.Pool, redis *shared.RedisClient, jwtSecret []byte) Service {
	return &loginService{
		db:        db,
		redis:     redis,
		jwtSecret: jwtSecret,
	}
}

// =========================================================================
// Business Logic Execution
// =========================================================================

// Login orchestrates the entire authentication flow from input validation to Redis session mapping.
func (s *loginService) Login(ctx context.Context, email, password string) (*LoginResult, error) {
	// 1. Aggressive Input Sanitization
	cleanEmail := strings.TrimSpace(strings.ToLower(email))
	if cleanEmail == "" || strings.TrimSpace(password) == "" {
		return nil, ErrMissingCredentials
	}

	// 2. Fetch User Record from PostgreSQL
	query := `
		SELECT id, email, password_hash, role, status, created_at, updated_at
		FROM users
		WHERE email = $1
	`
	u := &User{}

	// Pass ctx so the query cancels instantly if the HTTP request times out
	err := s.db.QueryRow(ctx, query, cleanEmail).Scan(
		&u.ID, &u.Email, &u.PasswordHash, &u.Role, &u.Status, &u.CreatedAt, &u.UpdatedAt,
	)

	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			// Security Measure: Always return a generic error to prevent attackers
			// from discovering which email addresses exist in the system.
			return nil, ErrInvalidCredentials
		}
		// Wrap unexpected database crashes with context
		return nil, fmt.Errorf("database query error: %w", err)
	}

	// 3. Status Gate Enforcement (Step 4.1 Blueprint Requirement)
	// Explicitly block the process if the account is not "Approved".
	switch u.Status {
	case "Pending":
		return nil, ErrAccountNotApproved
	case "Rejected":
		return nil, ErrAccountRejected
	case "Approved":
		// User is authorized to proceed
	default:
		return nil, ErrAccountNotApproved
	}

	// 4. Cryptographic Password Verification
	// Executes a constant-time memory-hard Argon2id check to prevent timing and GPU attacks.
	isValid, err := shared.VerifyPassword(password, u.PasswordHash)
	if err != nil {
		return nil, fmt.Errorf("cryptographic verification system failure: %w", err)
	}
	if !isValid {
		return nil, ErrInvalidCredentials
	}

	// 5. Token Generation (Step 4.2 Blueprint Requirement)
	accessToken, refreshToken, err := shared.GenerateTokenPair(
		u.ID,
		u.Email,
		u.Role,
		u.Status,
		s.jwtSecret,
	)
	if err != nil {
		return nil, fmt.Errorf("token generation engine failed: %w", err)
	}

	// 6. Stateful Session Tracking in Redis (Step 4.2 Blueprint Requirement)
	// Maps the newly generated refresh token to the User ID in Redis for exactly 7 days.
	sessionKey := fmt.Sprintf("session:%s", u.ID)
	sessionDuration := 7 * 24 * time.Hour

	// Using the context here ensures Redis honors the server-wide request timeout
	if err := s.redis.Set(ctx, sessionKey, refreshToken, sessionDuration); err != nil {
		return nil, fmt.Errorf("failed to persist active session to memory cache: %w", err)
	}

	// 7. Package and Return Results
	return &LoginResult{
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
		User:         u,
	}, nil
}
