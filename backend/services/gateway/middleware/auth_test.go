package middleware

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

func TestRequireAuth_Exact401Bodies(t *testing.T) {
	secret := "test-secret-key"

	tests := []struct {
		name           string
		authHeader     string
		expectedBody   string
		expectedStatus int
	}{
		{
			name:           "missing authorization header",
			authHeader:     "",
			expectedBody:   `{"error":"Missing Authorization header"}`,
			expectedStatus: http.StatusUnauthorized,
		},
		{
			name:           "malformed authorization header - no space",
			authHeader:     "Bearer",
			expectedBody:   `{"error":"Invalid Authorization header format"}`,
			expectedStatus: http.StatusUnauthorized,
		},
		{
			name:           "malformed authorization header - wrong scheme",
			authHeader:     "Basic token123",
			expectedBody:   `{"error":"Invalid Authorization header format"}`,
			expectedStatus: http.StatusUnauthorized,
		},
		{
			name:           "bad signature",
			authHeader:     "Bearer invalid.token.here",
			expectedBody:   `{"error":"Invalid or expired token"}`,
			expectedStatus: http.StatusUnauthorized,
		},
		{
			name:           "expired token",
			authHeader:     createExpiredToken(secret),
			expectedBody:   `{"error":"Invalid or expired token"}`,
			expectedStatus: http.StatusUnauthorized,
		},
		{
			name:           "non-HMAC algorithm",
			authHeader:     createNonHMACToken(secret),
			expectedBody:   `{"error":"Invalid or expired token"}`,
			expectedStatus: http.StatusUnauthorized,
		},
		{
			name:           "missing sub claim",
			authHeader:     createTokenWithoutSub(secret),
			expectedBody:   `{"error":"Invalid token payload"}`,
			expectedStatus: http.StatusUnauthorized,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest("GET", "/test", nil)
			if tt.authHeader != "" {
				req.Header.Set("Authorization", tt.authHeader)
			}

			rr := httptest.NewRecorder()
			handler := RequireAuth(secret)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(http.StatusOK)
			}))

			handler.ServeHTTP(rr, req)

			if rr.Code != tt.expectedStatus {
				t.Errorf("expected status %d, got %d", tt.expectedStatus, rr.Code)
			}

			body := strings.TrimSpace(rr.Body.String())
			if body != tt.expectedBody {
				t.Errorf("expected body %q, got %q", tt.expectedBody, body)
			}
		})
	}
}

func createExpiredToken(secret string) string {
	claims := jwt.MapClaims{
		"sub": "user123",
		"exp": float64(time.Now().Add(-1 * time.Hour).Unix()),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, _ := token.SignedString([]byte(secret))
	return "Bearer " + tokenString
}

func createNonHMACToken(secret string) string {
	claims := jwt.MapClaims{
		"sub": "user123",
		"exp": float64(time.Now().Add(1 * time.Hour).Unix()),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	tokenString, _ := token.SignedString([]byte(secret))
	return "Bearer " + tokenString
}

func createTokenWithoutSub(secret string) string {
	claims := jwt.MapClaims{
		"exp": float64(time.Now().Add(1 * time.Hour).Unix()),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, _ := token.SignedString([]byte(secret))
	return "Bearer " + tokenString
}
