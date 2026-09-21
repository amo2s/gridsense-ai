package middleware

import (
	"context"

	"google.golang.org/grpc"
	"google.golang.org/grpc/metadata"
)

// UnaryAuthPropagator intercepts outgoing unary gRPC calls, attaching the caller's
// JWT to outgoing metadata so the Gateway can validate it itself.
func UnaryAuthPropagator() grpc.UnaryClientInterceptor {
	return func(ctx context.Context, method string, req, reply interface{}, cc *grpc.ClientConn, invoker grpc.UnaryInvoker, opts ...grpc.CallOption) error {
		return invoker(appendAuthMetadata(ctx), method, req, reply, cc, opts...)
	}
}

// StreamAuthPropagator intercepts outgoing streaming gRPC calls (e.g. OperationalEventStream).
func StreamAuthPropagator() grpc.StreamClientInterceptor {
	return func(ctx context.Context, desc *grpc.StreamDesc, cc *grpc.ClientConn, method string, streamer grpc.Streamer, opts ...grpc.CallOption) (grpc.ClientStream, error) {
		return streamer(appendAuthMetadata(ctx), desc, cc, method, opts...)
	}
}

// appendAuthMetadata forwards the caller's raw JWT as outgoing metadata.
// If no token is present in context, the request goes out unauthenticated and
// the Gateway's own auth interceptor is responsible for rejecting it.
func appendAuthMetadata(ctx context.Context) context.Context {
	rawToken, ok := GetRawToken(ctx)
	if !ok || rawToken == "" {
		return ctx
	}
	return metadata.AppendToOutgoingContext(ctx, "authorization", "Bearer "+rawToken)
}