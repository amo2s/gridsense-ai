package dispatcher

import (
	"context"
	"fmt"

	"github.com/bytedance/sonic"
	"go.uber.org/zap"

	// Note: Adjust module path if your go.mod is not named "alerts"
	"github.com/gridsense-ai/alerts/internal/evaluator"
)

// SSEHub manages concurrent Server-Sent Event clients and broadcasts alerts.
type SSEHub struct {
	clients    map[chan []byte]bool
	register   chan chan []byte
	unregister chan chan []byte
	broadcast  chan []byte
	logger     *zap.Logger
}

// NewSSEHub constructs a new thread-safe broadcast hub without mutex bottlenecks.
func NewSSEHub(logger *zap.Logger) *SSEHub {
	return &SSEHub{
		clients:    make(map[chan []byte]bool),
		register:   make(chan chan []byte),
		unregister: make(chan chan []byte),
		broadcast:  make(chan []byte, 256), // Buffered to prevent caller blocking during traffic spikes
		logger:     logger,
	}
}

// Run executes the central dispatch loop. It guarantees thread safety by synchronizing all state changes via channels.
// This must be started in a dedicated background goroutine.
func (h *SSEHub) Run(ctx context.Context) {
	h.logger.Info("SSE Hub dispatch loop started")
	for {
		select {
		case <-ctx.Done():
			h.logger.Info("Shutting down SSE Hub")
			for client := range h.clients {
				close(client)
			}
			return

		case client := <-h.register:
			h.clients[client] = true
			h.logger.Debug("SSE client registered", zap.Int("active_clients", len(h.clients)))

		case client := <-h.unregister:
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				close(client)
				h.logger.Debug("SSE client unregistered", zap.Int("active_clients", len(h.clients)))
			}

		case message := <-h.broadcast:
			for client := range h.clients {
				select {
				case client <- message:
					// Message dispatched successfully to the client's buffer
				default:
					// Client buffer is full; assume network partition or dead connection.
					// Drop client aggressively to prevent pipeline stalling.
					close(client)
					delete(h.clients, client)
					h.logger.Warn("Dropped slow/unresponsive SSE client", zap.Int("active_clients", len(h.clients)))
				}
			}
		}
	}
}

// Broadcast conditionally serializes and queues the event if the RouteUI bitmask is flagged.
func (h *SSEHub) Broadcast(event interface{}, routeMatrix evaluator.DispatchRoute) error {
	if (routeMatrix & evaluator.RouteUI) == 0 {
		return nil // UI routing not flagged for this event, skip broadcast
	}

	payload, err := sonic.Marshal(event)
	if err != nil {
		h.logger.Error("Failed to serialize event for SSE broadcast", zap.Error(err))
		return fmt.Errorf("failed to marshal sse payload: %w", err)
	}

	// Non-blocking push to the hub's broadcast channel
	select {
	case h.broadcast <- payload:
		return nil
	default:
		h.logger.Warn("Hub broadcast channel is full, dropping event to preserve ingestion throughput")
		return nil
	}
}

// Subscribe provisions a new client channel and registers it with the hub.
func (h *SSEHub) Subscribe() chan []byte {
	client := make(chan []byte, 16) // Small buffer per client
	h.register <- client
	return client
}

// Unsubscribe safely removes a client channel from the hub via the centralized loop.
func (h *SSEHub) Unsubscribe(client chan []byte) {
	h.unregister <- client
}