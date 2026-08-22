package middleware

import (
	"net/http"

	// Using the strict module path established in your go.mod
	"gridsense/auth/internal/shared"
)

// RequireRoles enforces strict Role-Based Access Control on specific endpoints.
// It uses a variadic parameter (...string), allowing you to pass one or multiple
// authorized roles flawlessly (e.g., RequireRoles("Admin", "Manager")).
func RequireRoles(allowedRoles ...string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// 1. Instant Context Extraction (Step 5.2 Blueprint Requirement)
			// We pull the authenticated user's claims directly from the request memory.
			claims, ok := GetClaimsFromContext(r.Context())
			if !ok {
				// Defensive Go Architecture: If claims are missing, it means a developer
				// forgot to attach the AuthMiddleware before this RBAC middleware.
				shared.RespondUnauthorized(w, "Authentication required before verifying permissions", nil)
				return
			}

			// 2. Authorization Enforcement
			// Iterate through the list of allowed roles and compare them to the user's actual role.
			isAuthorized := false
			for _, permittedRole := range allowedRoles {
				if claims.Role == permittedRole {
					isAuthorized = true
					break
				}
			}

			// 3. Strict Rejection
			// If the loop finishes and the user's role wasn't in the allowed list, block them.
			if !isAuthorized {
				shared.RespondForbidden(w, "You do not have the required permissions to access this resource", nil)
				return
			}

			// 4. Grant Access
			// The user possesses the correct role. Hand control over to the final API route.
			next.ServeHTTP(w, r)
		})
	}
}
