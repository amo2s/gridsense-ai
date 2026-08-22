package register

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Sentinel Domain Errors
var (
	ErrEmailAlreadyExists = errors.New("email is already in use")
)

// User represents the database schema. PasswordHash uses json:"-" so it never leaks.
type User struct {
	ID           string    `json:"id"`
	Email        string    `json:"email"`
	PasswordHash string    `json:"-"`
	Role         string    `json:"role"`
	Status       string    `json:"status"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// =========================================================================
// Repository Interface & Constructor
// =========================================================================

// Repository defines the strict database contract for registration operations.
type Repository interface {
	CreateUser(ctx context.Context, email, passwordHash, role, status string) (*User, error)
}

type postgresRepository struct {
	db *pgxpool.Pool
}

// NewRepository injects the Supabase database pool into the register repository.
func NewRepository(db *pgxpool.Pool) Repository {
	return &postgresRepository{db: db}
}

// =========================================================================
// Database Operations
// =========================================================================

// CreateUser inserts a new user record into PostgreSQL and returns the created user with generated fields.
func (r *postgresRepository) CreateUser(ctx context.Context, email, passwordHash, role, status string) (*User, error) {
	query := `
		INSERT INTO users (email, password_hash, role, status)
		VALUES ($1, $2, $3, $4)
		RETURNING id, created_at, updated_at
	`

	u := &User{
		Email:        email,
		PasswordHash: passwordHash,
		Role:         role,
		Status:       status,
	}

	err := r.db.QueryRow(ctx, query, u.Email, u.PasswordHash, u.Role, u.Status).
		Scan(&u.ID, &u.CreatedAt, &u.UpdatedAt)

	if err != nil {
		// Catch Supabase/PostgreSQL unique violation code for duplicate emails
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrEmailAlreadyExists
		}
		return nil, err
	}

	return u, nil
}
