package grpcclient

import (
	"fmt"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/keepalive"

	pb "gridsense-ai/backend/services/dashboard-bff/proto/gen/gateway/v1"
)

// GatewayClient wraps the generated protobuf client and manages the persistent connection.
type GatewayClient struct {
	Conn   *grpc.ClientConn
	Client pb.GatewayServiceClient
}

// NewGatewayClient establishes a persistent, multiplexed HTTP/2 connection to the core Gateway.
func NewGatewayClient(targetURL string) (*GatewayClient, error) {
	kacp := keepalive.ClientParameters{
		Time:                10 * time.Second,
		Timeout:             time.Second,
		PermitWithoutStream: true,
	}

	// Dial initializes the persistent connection. In a production SaaS environment, 
	// unary and stream interceptors for tenant propagation and retries are appended here.
	conn, err := grpc.Dial(
		targetURL,
		grpc.WithTransportCredentials(insecure.NewCredentials()),
		grpc.WithKeepaliveParams(kacp),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to dial gateway at %s: %w", targetURL, err)
	}

	client := pb.NewGatewayServiceClient(conn)

	return &GatewayClient{
		Conn:   conn,
		Client: client,
	}, nil
}

// Close gracefully terminates the underlying gRPC connection pool during service shutdown.
func (c *GatewayClient) Close() error {
	if c.Conn != nil {
		return c.Conn.Close()
	}
	return nil
}