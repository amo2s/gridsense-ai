package register

import (
	"context"
	"errors"
	"fmt"
	"strings"

	// Update this import path to match your module name in go.mod
	"gridsense/auth/internal/shared"
)

// =========================================================================
// Service Layer Interface & Constructor
// =========================================================================

// Service defines the strict contract for the registration feature.
type Service interface {
	Register(ctx context.Context, email, password string) (*User, error)
}

type registerService struct {
	repo Repository
}

// NewService securely injects the repository.
func NewService(repo Repository) Service {
	return &registerService{repo: repo}
}

// =========================================================================
// Business Logic
// =========================================================================

// Register sanitizes input, hashes the password, and writes to Supabase via repository.
func (s *registerService) Register(ctx context.Context, email, password string) (*User, error) {
	// 1. Sanitize Inputs
	cleanEmail := strings.TrimSpace(strings.ToLower(email))
	if cleanEmail == "" || strings.TrimSpace(password) == "" {
		return nil, errors.New("email and password are required")
	}

	// 2. CPU-Intensive Hashing (Argon2id)
	hashedPassword, err := shared.HashPassword(password)
	if err != nil {
		return nil, fmt.Errorf("failed to hash password: %w", err)
	}

	// 3. Blueprint Enforcement: Default to "Pending" Status
	role := "Staff"     // Default role. Admins must upgrade this later.
	status := "Pending" // STRICTLY enforced by Phase 3.2 requirement

	// 4. Delegate to repository for database insertion
	u, err := s.repo.CreateUser(ctx, cleanEmail, hashedPassword, role, status)
	if err != nil {
		if errors.Is(err, ErrEmailAlreadyExists) {
			return nil, ErrEmailAlreadyExists
		}
		return nil, fmt.Errorf("database insertion failed: %w", err)
	}

	return u, nil
}
