package events

import (
	"fmt"
	"os"
	"time"

	"github.com/ThreeDotsLabs/watermill/message"
	"github.com/ThreeDotsLabs/watermill-redisstream/pkg/redisstream"
	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"
)

// ResilientUnmarshaller safely extracts Upstash stream values regardless of string/byte wire formatting.
type ResilientUnmarshaller struct{}

// Unmarshal intercepts the raw Redis hash map before it reaches the Watermill router.
func (u ResilientUnmarshaller) Unmarshal(values map[string]interface{}) (*message.Message, error) {
	// 1. Rigorous UUID extraction with legacy fallback
	var msgUUID string
	if id, ok := values["_watermill_message_uuid"]; ok {
		msgUUID = fmt.Sprintf("%v", id) // Force string conversion safely
	} else if id, ok := values["uuid"]; ok {
		msgUUID = fmt.Sprintf("%v", id) // Fallback for Engine A's older messages
	} else {
		return nil, fmt.Errorf("missing message uuid in stream entry")
	}

	// 2. Aggressive Payload type assertion
	var payload []byte
	var rawPayload interface{}

	if p, ok := values["_watermill_message_payload"]; ok {
		rawPayload = p
	} else if p, ok := values["payload"]; ok {
		rawPayload = p // Fallback for Engine A's older messages
	}

	if rawPayload != nil {
		switch v := rawPayload.(type) {
		case string:
			payload = []byte(v)
		case []byte:
			payload = v
		default:
			payload = []byte(fmt.Sprintf("%v", v)) // Catch-all for generic interfaces
		}
	}

	if len(payload) == 0 {
		return nil, fmt.Errorf("payload is completely empty after type assertion")
	}

	// 3. Reconstruct the Watermill Message envelope
	msg := message.NewMessage(msgUUID, payload)
	msg.Metadata = make(message.Metadata) // Prevent panics downstream

	return msg, nil
}

// NewSubscriber creates a highly concurrent, blocking-read Redis stream consumer.
func NewSubscriber(client redis.UniversalClient, logger *zap.Logger, groupName string) (*redisstream.Subscriber, error) {
	adapter := &zapLoggerAdapter{logger: logger}

	// Dynamic consumer identity enables safe horizontal scaling
	consumerID, err := os.Hostname()
	if err != nil {
		consumerID = "alert-worker-default"
	}

	sub, err := redisstream.NewSubscriber(
		redisstream.SubscriberConfig{
			Client:        client,
			ConsumerGroup: groupName,
			Consumer:      consumerID,
			// Block for 2 seconds waiting for events to minimize idle CPU polling
			BlockTime:    2 * time.Second,
			Unmarshaller: ResilientUnmarshaller{}, // <--- Inject defensive boundary
		},
		adapter,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to construct watermill redis subscriber: %w", err)
	}

	logger.Info("Watermill Redis subscriber initialized", zap.String("consumer_id", consumerID))
	return sub, nil
}