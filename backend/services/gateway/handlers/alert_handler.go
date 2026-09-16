package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httputil"
	"net/url"
	"time"

	"gateway/models"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
	"github.com/sony/gobreaker"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/codes"
)

// ==========================================
// 1. ERRORS & METRICS
// ==========================================

var (
	ErrInvalidAlertID = errors.New("invalid request: alert ID is required")
)

var (
	alertTracer = otel.Tracer("handlers/alerts")

	alertLatency = promauto.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "alert_gateway_duration_seconds",
		Help:    "Latency of Alert microservice REST requests through the gateway",
		Buckets: prometheus.DefBuckets,
	}, []string{"endpoint", "status"})

	alertErrorCounter = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "alert_gateway_errors_total",
		Help: "Total errors routing to the Alert microservice",
	}, []string{"type"})
)

// ==========================================
// 2. INTERFACES
// ==========================================

// AlertBridgeClient defines the communication interface for standard REST interactions.
type AlertBridgeClient interface {
	FetchActiveAlerts(ctx context.Context) ([]models.Alert, error)
	AcknowledgeAlert(ctx context.Context, alertID string, payload *models.AcknowledgePayload) error
}

// ==========================================
// 3. HTTP HANDLER EXECUTION
// ==========================================

// AlertHandler manages standard REST queries and SSE stream proxying to the Alert microservice.
type AlertHandler struct {
	client   AlertBridgeClient
	sseProxy *httputil.ReverseProxy
}

// NewAlertHandler constructs the handler, configuring the zero-copy reverse proxy for SSE.
func NewAlertHandler(client AlertBridgeClient, microserviceURL string, serviceKey string) (*AlertHandler, error) {
	target, err := url.Parse(microserviceURL)
	if err != nil {
		return nil, fmt.Errorf("invalid alert microservice URL: %w", err)
	}

	proxy := httputil.NewSingleHostReverseProxy(target)
	
	// Modify the Director to inject the internal service key for authorization
	originalDirector := proxy.Director
	proxy.Director = func(req *http.Request) {
		originalDirector(req)
		req.Header.Set("X-Gateway-Token", serviceKey)
		// Strip the gateway prefix if the microservice mounts routes at the root
		// req.URL.Path = strings.TrimPrefix(req.URL.Path, "/api/v1") 
	}

	// -1 instructs the proxy to flush data immediately after every write, critical for SSE
	proxy.FlushInterval = -1 
	
	proxy.ErrorHandler = func(w http.ResponseWriter, r *http.Request, err error) {
		slog.Error("SSE proxy error", "error", err, "client", r.RemoteAddr)
		alertErrorCounter.WithLabelValues("sse_proxy_error").Inc()
		if !errors.Is(err, context.Canceled) {
			http.Error(w, "Stream connection failed", http.StatusBadGateway)
		}
	}

	return &AlertHandler{
		client:   client,
		sseProxy: proxy,
	}, nil
}

// FetchActive retrieves all unresolved alerts for the Next.js dashboard.
func (h *AlertHandler) FetchActive(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	ctx, span := alertTracer.Start(ctx, "HTTP.FetchActiveAlerts")
	defer span.End()

	start := time.Now()

	alerts, err := h.client.FetchActiveAlerts(ctx)
	duration := time.Since(start).Seconds()

	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
		alertLatency.WithLabelValues("fetch_active", "error").Observe(duration)
		h.handleError(w, err)
		return
	}

	alertLatency.WithLabelValues("fetch_active", "success").Observe(duration)

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(alerts); err != nil {
		slog.Error("failed to encode fetch active alerts response", "error", err)
	}
}

// Acknowledge updates an alert's status to resolved.
func (h *AlertHandler) Acknowledge(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	ctx, span := alertTracer.Start(ctx, "HTTP.AcknowledgeAlert")
	defer span.End()

	// Assumes Go 1.22+ wildcard routing routing e.g., /api/v1/alerts/{id}/ack
	alertID := r.PathValue("id")
	if alertID == "" {
		span.RecordError(ErrInvalidAlertID)
		http.Error(w, ErrInvalidAlertID.Error(), http.StatusBadRequest)
		return
	}

	var payload models.AcknowledgePayload
	bodyBytes, err := io.ReadAll(io.LimitReader(r.Body, 1<<16)) // 64 KiB limit
	if err != nil {
		span.RecordError(err)
		http.Error(w, "Failed to read request body", http.StatusBadRequest)
		return
	}
	defer r.Body.Close()

	if err := json.Unmarshal(bodyBytes, &payload); err != nil {
		span.RecordError(err)
		http.Error(w, "Malformed JSON payload", http.StatusBadRequest)
		return
	}

	start := time.Now()
	err = h.client.AcknowledgeAlert(ctx, alertID, &payload)
	duration := time.Since(start).Seconds()

	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
		alertLatency.WithLabelValues("acknowledge", "error").Observe(duration)
		h.handleError(w, err)
		return
	}

	alertLatency.WithLabelValues("acknowledge", "success").Observe(duration)

	w.WriteHeader(http.StatusNoContent)
}

// StreamSSE upgrades the HTTP connection and proxies the live event stream natively.
func (h *AlertHandler) StreamSSE(w http.ResponseWriter, r *http.Request) {
	// Let the ReverseProxy handle the persistent TCP connection natively
	alertErrorCounter.WithLabelValues("sse_connection_opened").Inc()
	h.sseProxy.ServeHTTP(w, r)
}

// handleError maps domain and infrastructure errors to standard HTTP status codes.
func (h *AlertHandler) handleError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, gobreaker.ErrOpenState):
		alertErrorCounter.WithLabelValues("circuit_breaker_open").Inc()
		http.Error(w, "Alert microservice temporarily unavailable", http.StatusServiceUnavailable)
	case errors.Is(err, gobreaker.ErrTooManyRequests):
		alertErrorCounter.WithLabelValues("rate_limited").Inc()
		http.Error(w, "Alert microservice overloaded", http.StatusTooManyRequests)
	default:
		alertErrorCounter.WithLabelValues("upstream_error").Inc()
		http.Error(w, fmt.Sprintf("Alert service error: %v", err), http.StatusBadGateway)
	}
}