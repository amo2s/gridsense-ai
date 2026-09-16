package api

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"go.uber.org/zap"
)

// RegisterRoutes mounts the Alert Microservice endpoints and enforces gateway authentication.
func RegisterRoutes(r chi.Router, controller *AlertController, serviceKey string, logger *zap.Logger) {
	// Group routes to apply the gateway authentication middleware uniformly
	r.Group(func(r chi.Router) {
		r.Use(gatewayAuthMiddleware(serviceKey, logger))

		r.Get("/api/v1/alerts/active", controller.FetchActive)
		r.Patch("/api/v1/alerts/{id}/ack", controller.Acknowledge)
		r.Get("/api/v1/alerts/stream", controller.StreamSSE)
	})
}

// gatewayAuthMiddleware validates the X-Gateway-Token header against the internal service key.
func gatewayAuthMiddleware(expectedKey string, logger *zap.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			token := r.Header.Get("X-Gateway-Token")
			
			if token == "" || token != expectedKey {
				logger.Warn("Unauthorized access attempt rejected",
					zap.String("ip", r.RemoteAddr),
					zap.String("path", r.URL.Path),
				)
				http.Error(w, "Unauthorized: Invalid or missing gateway token", http.StatusUnauthorized)
				return
			}
			
			next.ServeHTTP(w, r)
		})
	}
}