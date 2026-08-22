package admin

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Sentinel Domain Errors
var (
	ErrUserNotFound = errors.New("user not found")
)

// User represents the exact database schema for administrative viewing.
// PasswordHash is omitted entirely because admins never need to see it.
type User struct {
	ID        string    `json:"id"`
	Email     string    `json:"email"`
	Role      string    `json:"role"`
	Status    string    `json:"status"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// =========================================================================
// Repository Interface & Constructor
// =========================================================================

// Repository defines the strict database contract for administrative operations.
type Repository interface {
	GetPendingUsers(ctx context.Context) ([]*User, error)
	UpdateUserStatus(ctx context.Context, userID string, status string) error
	DeleteUser(ctx context.Context, userID string) error
}

type postgresRepository struct {
	db *pgxpool.Pool
}

// NewRepository injects the Supabase database pool into the admin repository.
func NewRepository(db *pgxpool.Pool) Repository {
	return &postgresRepository{db: db}
}

// =========================================================================
// Database Operations (Step 5.3 Blueprint Fulfillment)
// =========================================================================

// GetPendingUsers fetches all accounts waiting for approval, sorted oldest first.
func (r *postgresRepository) GetPendingUsers(ctx context.Context) ([]*User, error) {
	// We only query necessary columns to save bandwidth.
	query := `
		SELECT id, email, role, status, created_at, updated_at
		FROM users
		WHERE status = 'Pending'
		ORDER BY created_at ASC
	`

	rows, err := r.db.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	// Pre-allocate the slice to optimize memory usage (an advanced Go tactic)
	users := make([]*User, 0)

	for rows.Next() {
		u := &User{}
		if err := rows.Scan(&u.ID, &u.Email, &u.Role, &u.Status, &u.CreatedAt, &u.UpdatedAt); err != nil {
			return nil, err
		}
		users = append(users, u)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return users, nil
}

// UpdateUserStatus modifies a user's status (e.g., changing "Pending" to "Approved").
func (r *postgresRepository) UpdateUserStatus(ctx context.Context, userID string, status string) error {
	// RETURNING id allows us to confirm the row was actually updated in one step.
	query := `
		UPDATE users
		SET status = $1
		WHERE id = $2
		RETURNING id
	`

	var returnedID string
	err := r.db.QueryRow(ctx, query, status, userID).Scan(&returnedID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrUserNotFound
		}
		return err
	}

	return nil
}

// DeleteUser permanently removes a user record from the database.
// As requested, this can be executed at any time regardless of the user's current status.
func (r *postgresRepository) DeleteUser(ctx context.Context, userID string) error {
	query := `
		DELETE FROM users
		WHERE id = $1
		RETURNING id
	`

	var returnedID string
	err := r.db.QueryRow(ctx, query, userID).Scan(&returnedID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrUserNotFound
		}
		return err
	}

	return nil
}