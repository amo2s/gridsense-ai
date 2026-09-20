package realtime

import (
	"context"
	"encoding/json"
	"log"
	"sync"
	"time"

	"gridsense-ai/backend/services/dashboard-bff/graph/model"
	"gridsense-ai/backend/services/dashboard-bff/internal/cache"
)

const (
	// OperationalEventsChannel is the central Redis channel for all Gateway telemetry.
	OperationalEventsChannel = "system:operational_events"
	// subscriberBufferSize prevents slow clients from blocking the Redis consumer loop.
	subscriberBufferSize = 100
)

// GatewayEvent represents the internal payload pushed by the core Gateway to Redis.
// It wraps the frontend event model with routing metadata to enforce tenant isolation.
type GatewayEvent struct {
	TenantID string              `json:"tenant_id"`
	Payload  *model.AnomalyEvent `json:"payload"`
}

// SubscriptionManager acts as a thread-safe multiplexer, bridging Redis Pub/Sub to GraphQL WebSockets.
type SubscriptionManager struct {
	redisClient *cache.RedisClient
	// subscribers maps a TenantID to a set of active client channels.
	subscribers map[string]map[chan<- *model.AnomalyEvent]struct{}
	mu          sync.RWMutex
}

// NewSubscriptionManager initializes the multiplexer.
func NewSubscriptionManager(redisClient *cache.RedisClient) *SubscriptionManager {
	return &SubscriptionManager{
		redisClient: redisClient,
		subscribers: make(map[string]map[chan<- *model.AnomalyEvent]struct{}),
	}
}

// Start spawns the background ingress loop to consume events from Redis.
// It is designed to run indefinitely until the provided context is canceled.
func (sm *SubscriptionManager) Start(ctx context.Context) {
	pubsub := sm.redisClient.Subscribe(ctx, OperationalEventsChannel)
	defer pubsub.Close()

	ch := pubsub.Channel()
	log.Println("Subscription manager ingress loop started...")

	for {
		select {
		case <-ctx.Done():
			log.Println("Subscription manager shutting down gracefully.")
			return
		case msg, ok := <-ch:
			if !ok {
				log.Println("Redis Pub/Sub channel closed unexpectedly.")
				return
			}
			sm.processIngressMessage(msg.Payload)
		}
	}
}

// processIngressMessage deserializes the Redis payload and routes it to the correct tenant.
func (sm *SubscriptionManager) processIngressMessage(rawPayload string) {
	var event GatewayEvent
	if err := json.Unmarshal([]byte(rawPayload), &event); err != nil {
		log.Printf("Failed to unmarshal telemetry event: %v", err)
		return
	}

	sm.mu.RLock()
	defer sm.mu.RUnlock()

	tenantSubscribers, exists := sm.subscribers[event.TenantID]
	if !exists || len(tenantSubscribers) == 0 {
		return // No active UI clients for this tenant; safely drop the event.
	}

	// Fan-out to all active WebSocket connections for this specific tenant.
	for clientCh := range tenantSubscribers {
		select {
		case clientCh <- event.Payload:
			// Successfully delivered.
		case <-time.After(50 * time.Millisecond):
			// Shed load: drop the event for this specific client if their buffer is full
			// to prevent a single slow network connection from freezing the entire BFF.
			log.Printf("Dropped event for tenant %s: client buffer full", event.TenantID)
		}
	}
}

// Subscribe registers a new Next.js client for real-time updates.
// The provided context MUST be the GraphQL request context so we can detect client disconnects.
func (sm *SubscriptionManager) Subscribe(ctx context.Context, tenantID string) (<-chan *model.AnomalyEvent, error) {
	clientCh := make(chan *model.AnomalyEvent, subscriberBufferSize)

	sm.mu.Lock()
	if sm.subscribers[tenantID] == nil {
		sm.subscribers[tenantID] = make(map[chan<- *model.AnomalyEvent]struct{})
	}
	sm.subscribers[tenantID][clientCh] = struct{}{}
	sm.mu.Unlock()

	// Spawn a lightweight watcher goroutine to clean up memory when the client disconnects.
	go func() {
		<-ctx.Done()
		sm.unsubscribe(tenantID, clientCh)
	}()

	return clientCh, nil
}

// unsubscribe securely removes a client channel from the multiplexer map.
func (sm *SubscriptionManager) unsubscribe(tenantID string, clientCh chan<- *model.AnomalyEvent) {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	if tenantMap, exists := sm.subscribers[tenantID]; exists {
		delete(tenantMap, clientCh)
		close(clientCh)

		// Reclaim map memory if this was the last active client for the tenant.
		if len(tenantMap) == 0 {
			delete(sm.subscribers, tenantID)
		}
	}
}