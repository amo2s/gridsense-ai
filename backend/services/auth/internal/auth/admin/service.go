package admin

import (
	"context"
	"errors"
	"fmt"
	"strings"
)

// Sentinel Validation Errors
var (
	ErrInvalidUserID = errors.New("a valid user ID is required")
)

// =========================================================================
// Service Interface & Constructor
// =========================================================================

// Service defines the exact administrative capabilities.
type Service interface {
	GetPendingUsers(ctx context.Context) ([]*User, error)
	ApproveUser(ctx context.Context, userID string) error
	DeleteUser(ctx context.Context, userID string) error
}

type adminService struct {
	repo Repository
}

// NewService injects the repository dependency.
func NewService(repo Repository) Service {
	return &adminService{repo: repo}
}

// =========================================================================
// Business Logic Operations
// =========================================================================

// GetPendingUsers fetches the list of accounts waiting for approval.
func (s *adminService) GetPendingUsers(ctx context.Context) ([]*User, error) {
	users, err := s.repo.GetPendingUsers(ctx)
	if err != nil {
		return nil, fmt.Errorf("service failed to retrieve pending users: %w", err)
	}
	return users, nil
}

// ApproveUser validates the input and transitions a user's status to "Approved".
func (s *adminService) ApproveUser(ctx context.Context, userID string) error {
	cleanID := strings.TrimSpace(userID)
	if cleanID == "" {
		return ErrInvalidUserID
	}

	// Hardcode "Approved" so the frontend or an attacker cannot pass arbitrary statuses.
	if err := s.repo.UpdateUserStatus(ctx, cleanID, "Approved"); err != nil {
		return fmt.Errorf("service failed to approve user: %w", err)
	}

	return nil
}

// DeleteUser validates the input and permanently wipes the record.
func (s *adminService) DeleteUser(ctx context.Context, userID string) error {
	cleanID := strings.TrimSpace(userID)
	if cleanID == "" {
		return ErrInvalidUserID
	}

	if err := s.repo.DeleteUser(ctx, cleanID); err != nil {
		return fmt.Errorf("service failed to delete user: %w", err)
	}

	return nil
}