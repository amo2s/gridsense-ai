package shared

import (
	"errors"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// Sentinel Token Errors for strict control flow
var (
	ErrTokenExpired = errors.New("token has expired")
	ErrTokenInvalid = errors.New("token is invalid or tampered with")
)

// TokenClaims maps the exact data payload we are injecting into our JWTs.
// It embeds jwt.RegisteredClaims to automatically handle expiry (exp) and issued-at (iat) logic.
type TokenClaims struct {
	UserID string `json:"user_id"`
	Email  string `json:"email"`
	Role   string `json:"role"`
	Status string `json:"status"`
	jwt.RegisteredClaims
}

// GenerateTokenPair creates both a short-lived access token and a long-lived refresh token.
// Access Token: Used for rapid, stateless API calls (15 mins).
// Refresh Token: Minimal payload, used only to get a new Access Token (7 days).
func GenerateTokenPair(userID, email, role, status string, secret []byte) (string, string, error) {
	now := time.Now()

	// 1. Construct Access Token Claims (15 Minutes)
	accessClaims := TokenClaims{
		UserID: userID,
		Email:  email,
		Role:   role,
		Status: status,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   userID,
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(15 * time.Minute)),
			Issuer:    "gridsense-auth-service",
		},
	}
	accessTokenRaw := jwt.NewWithClaims(jwt.SigningMethodHS256, accessClaims)
	accessToken, err := accessTokenRaw.SignedString(secret)
	if err != nil {
		return "", "", fmt.Errorf("failed to sign access token: %w", err)
	}

	// 2. Construct Refresh Token Claims (7 Days)
	// Notice we only include the Subject (UserID), keeping the payload tiny and reducing attack surface.
	refreshClaims := jwt.RegisteredClaims{
		Subject:   userID,
		IssuedAt:  jwt.NewNumericDate(now),
		ExpiresAt: jwt.NewNumericDate(now.Add(7 * 24 * time.Hour)),
		Issuer:    "gridsense-auth-service",
	}
	refreshTokenRaw := jwt.NewWithClaims(jwt.SigningMethodHS256, refreshClaims)
	refreshToken, err := refreshTokenRaw.SignedString(secret)
	if err != nil {
		return "", "", fmt.Errorf("failed to sign refresh token: %w", err)
	}

	return accessToken, refreshToken, nil
}

// ValidateToken decodes, verifies the cryptographic signature, and checks the expiration.
func ValidateToken(tokenString string, secret []byte) (*TokenClaims, error) {
	// Parse the token with a strict callback function to verify the signing algorithm
	token, err := jwt.ParseWithClaims(tokenString, &TokenClaims{}, func(t *jwt.Token) (interface{}, error) {
		// BRUTAL SECURITY: Enforce HMAC SHA-256. 
		// If an attacker changes the header to "alg": "none" or "RS256", reject it immediately.
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		// Go requires the secret to be returned as a []byte here
		return secret, nil
	})

	// Handle specific JWT parsing errors (e.g., Expired vs Tampered)
	if err != nil {
		if errors.Is(err, jwt.ErrTokenExpired) {
			return nil, ErrTokenExpired
		}
		return nil, ErrTokenInvalid
	}

	// Safely cast the parsed claims back into our strongly-typed TokenClaims struct
	claims, ok := token.Claims.(*TokenClaims)
	if !ok || !token.Valid {
		return nil, ErrTokenInvalid
	}

	return claims, nil
}