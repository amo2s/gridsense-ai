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
// Single-tenant deployment: no routing metadata, the payload is broadcast to every
// active subscriber.
type GatewayEvent struct {
	Payload *model.AnomalyEvent `json:"payload"`
}

// SubscriptionManager acts as a thread-safe multiplexer, bridging Redis Pub/Sub to GraphQL WebSockets.
type SubscriptionManager struct {
	redisClient *cache.RedisClient
	// subscribers is the flat set of active client channels. Single-tenant: every
	// event is fanned out to every subscriber, so no routing key is needed.
	subscribers map[chan<- *model.AnomalyEvent]struct{}
	mu          sync.RWMutex
}

// NewSubscriptionManager initializes the multiplexer.
func NewSubscriptionManager(redisClient *cache.RedisClient) *SubscriptionManager {
	return &SubscriptionManager{
		redisClient: redisClient,
		subscribers: make(map[chan<- *model.AnomalyEvent]struct{}),
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

// processIngressMessage deserializes the Redis payload and fans it out to every
// active subscriber.
func (sm *SubscriptionManager) processIngressMessage(rawPayload string) {
	var event GatewayEvent
	if err := json.Unmarshal([]byte(rawPayload), &event); err != nil {
		log.Printf("Failed to unmarshal telemetry event: %v", err)
		return
	}

	sm.mu.RLock()
	defer sm.mu.RUnlock()

	if len(sm.subscribers) == 0 {
		return // No active UI clients; safely drop the event.
	}

	// Fan-out to every active WebSocket connection.
	for clientCh := range sm.subscribers {
		select {
		case clientCh <- event.Payload:
			// Successfully delivered.
		case <-time.After(50 * time.Millisecond):
			// Shed load: drop the event for this specific client if their buffer is full
			// to prevent a single slow network connection from freezing the entire BFF.
			log.Printf("Dropped event: client buffer full")
		}
	}
}

// Subscribe registers a new Next.js client for real-time updates.
// The provided context MUST be the GraphQL request context so we can detect client disconnects.
func (sm *SubscriptionManager) Subscribe(ctx context.Context) (<-chan *model.AnomalyEvent, error) {
	clientCh := make(chan *model.AnomalyEvent, subscriberBufferSize)

	sm.mu.Lock()
	sm.subscribers[clientCh] = struct{}{}
	sm.mu.Unlock()

	// Spawn a lightweight watcher goroutine to clean up memory when the client disconnects.
	go func() {
		<-ctx.Done()
		sm.unsubscribe(clientCh)
	}()

	return clientCh, nil
}

// unsubscribe securely removes a client channel from the multiplexer set.
func (sm *SubscriptionManager) unsubscribe(clientCh chan<- *model.AnomalyEvent) {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	if _, exists := sm.subscribers[clientCh]; exists {
		delete(sm.subscribers, clientCh)
		close(clientCh)
	}
}