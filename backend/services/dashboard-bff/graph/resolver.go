// graph/resolver.go
package graph

import (
	"gridsense-ai/backend/services/dashboard-bff/internal/cache"
	"gridsense-ai/backend/services/dashboard-bff/internal/grpcclient"
	"gridsense-ai/backend/services/dashboard-bff/internal/realtime"
)

// This file will not be regenerated automatically.
//
// It serves as dependency injection for your app, add any dependencies you require
// here.

type Resolver struct {
	GatewayClient *grpcclient.GatewayClient
	Cache         *cache.RedisClient
	Subscriptions *realtime.SubscriptionManager
}