package graph

import (
	"gridsense-ai/backend/services/dashboard-bff/internal/grpcclient"
)

// This file will not be regenerated automatically.
//
// It serves as dependency injection for your app, add any dependencies you require
// here.

type Resolver struct {
	GatewayClient *grpcclient.GatewayClient
}