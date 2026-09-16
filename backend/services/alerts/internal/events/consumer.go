package events

import (
	"fmt"
	"os"
	"time"

	"github.com/ThreeDotsLabs/watermill-redisstream/pkg/redisstream"
	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"
)

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
			BlockTime: 2 * time.Second,
		},
		adapter,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to construct watermill redis subscriber: %w", err)
	}

	logger.Info("Watermill Redis subscriber initialized", zap.String("consumer_id", consumerID))
	return sub, nil
}
