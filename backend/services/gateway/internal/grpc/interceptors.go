package server

import (
	"context"
	"strings"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"

	"gateway/middleware"
)

var (
	grpcLatency = promauto.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "grpc_server_latency_seconds",
		Help:    "gRPC server request latency in seconds",
		Buckets: prometheus.DefBuckets,
	}, []string{"method", "code"})

	grpcRequests = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "grpc_server_requests_total",
		Help: "Total gRPC server requests",
	}, []string{"method", "code"})
)

// NewMetricsUnaryInterceptor creates a unary interceptor that records request latency and counts.
func NewMetricsUnaryInterceptor() grpc.UnaryServerInterceptor {
	return func(ctx context.Context, req interface{}, info *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (interface{}, error) {
		start := time.Now()
		resp, err := handler(ctx, req)
		duration := time.Since(start).Seconds()

		code := codes.OK
		if err != nil {
			code = status.Code(err)
		}

		grpcLatency.WithLabelValues(info.FullMethod, code.String()).Observe(duration)
		grpcRequests.WithLabelValues(info.FullMethod, code.String()).Inc()

		return resp, err
	}
}

// extractBearerToken extracts and validates a Bearer token from metadata.
// Returns the user ID and error if validation fails.
func extractBearerToken(ctx context.Context, jwtSecret string) (string, error) {
	md, ok := metadata.FromIncomingContext(ctx)
	if !ok {
		return "", status.Error(codes.Unauthenticated, "missing metadata")
	}

	authHeaders := md["authorization"]
	if len(authHeaders) == 0 {
		return "", status.Error(codes.Unauthenticated, "missing authorization header")
	}

	authHeader := authHeaders[0]
	parts := strings.SplitN(authHeader, " ", 2)
	if len(parts) != 2 || strings.ToLower(parts[0]) != "bearer" {
		return "", status.Error(codes.Unauthenticated, "invalid authorization header format")
	}

	userID, err := middleware.ValidateJWT(parts[1], jwtSecret)
	if err != nil {
		return "", status.Error(codes.Unauthenticated, err.Error())
	}

	return userID, nil
}

// NewAuthUnaryInterceptor creates a unary interceptor that validates JWT Bearer tokens.
func NewAuthUnaryInterceptor(jwtSecret string) grpc.UnaryServerInterceptor {
	return func(ctx context.Context, req interface{}, info *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (interface{}, error) {
		userID, err := extractBearerToken(ctx, jwtSecret)
		if err != nil {
			return nil, err
		}

		// Store user ID in context for handlers
		ctx = context.WithValue(ctx, middleware.UserIDKey, userID)

		return handler(ctx, req)
	}
}

// NewAuthStreamInterceptor creates a stream interceptor that validates JWT Bearer tokens.
func NewAuthStreamInterceptor(jwtSecret string) grpc.StreamServerInterceptor {
	return func(srv interface{}, ss grpc.ServerStream, info *grpc.StreamServerInfo, handler grpc.StreamHandler) error {
		userID, err := extractBearerToken(ss.Context(), jwtSecret)
		if err != nil {
			return err
		}

		// Store user ID in context for handlers
		ctx := context.WithValue(ss.Context(), middleware.UserIDKey, userID)

		// Wrap the stream with the new context
		wrapped := &contextServerStream{
			ServerStream: ss,
			ctx:          ctx,
		}

		return handler(srv, wrapped)
	}
}

// contextServerStream wraps grpc.ServerStream to override Context().
type contextServerStream struct {
	grpc.ServerStream
	ctx context.Context
}

func (w *contextServerStream) Context() context.Context {
	return w.ctx
}
