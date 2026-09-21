package middleware

import (
	"context"

	"google.golang.org/grpc"
	"google.golang.org/grpc/metadata"
)

const (
	// Metadata keys must be lowercase as per HTTP/2 and gRPC specifications.
	TenantIDHeader = "x-tenant-id"
	UserIDHeader   = "x-user-id"
	RoleHeader     = "x-role"
)

// UnaryTenantPropagator intercepts outgoing unary gRPC calls, attaching the verified identity to the transport metadata.
func UnaryTenantPropagator() grpc.UnaryClientInterceptor {
	return func(ctx context.Context, method string, req, reply interface{}, cc *grpc.ClientConn, invoker grpc.UnaryInvoker, opts ...grpc.CallOption) error {
		outCtx := appendIdentityMetadata(ctx)
		return invoker(outCtx, method, req, reply, cc, opts...)
	}
}

// StreamTenantPropagator intercepts outgoing streaming gRPC calls (e.g., OperationalEventStream).
func StreamTenantPropagator() grpc.StreamClientInterceptor {
	return func(ctx context.Context, desc *grpc.StreamDesc, cc *grpc.ClientConn, method string, streamer grpc.Streamer, opts ...grpc.CallOption) (grpc.ClientStream, error) {
		outCtx := appendIdentityMetadata(ctx)
		return streamer(outCtx, desc, cc, method, opts...)
	}
}

// appendIdentityMetadata securely pulls the typed identity from the context boundary and packs it for network transmission.
func appendIdentityMetadata(ctx context.Context) context.Context {
	identity, err := GetTenantIdentity(ctx)
	if err != nil || identity == nil {
		// If identity is absent, pass the context unchanged.
		// The core Gateway assumes the responsibility of dropping unauthenticated RPCs.
		return ctx
	}

	// AppendToOutgoingContext safely merges with any existing metadata rather than overwriting it.
	outCtx := metadata.AppendToOutgoingContext(ctx,
		TenantIDHeader, identity.TenantID,
		UserIDHeader, identity.UserID,
		RoleHeader, identity.Role,
	)

	// Also forward the raw JWT token if available for gateway re-validation
	if rawToken, ok := GetRawToken(ctx); ok {
		outCtx = metadata.AppendToOutgoingContext(outCtx, "authorization", "Bearer "+rawToken)
	}

	return outCtx
}
