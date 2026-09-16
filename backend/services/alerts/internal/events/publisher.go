package events

import (
	"fmt"

	"github.com/ThreeDotsLabs/watermill"
	"github.com/ThreeDotsLabs/watermill-redisstream/pkg/redisstream"
	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"
)

// zapLoggerAdapter bridges the Uber Zap logger into the Watermill ecosystem.
type zapLoggerAdapter struct {
	logger *zap.Logger
}

func (z *zapLoggerAdapter) Error(msg string, err error, fields watermill.LogFields) {
	z.logger.Error(msg, zap.Error(err), zap.Any("watermill_fields", fields))
}

func (z *zapLoggerAdapter) Info(msg string, fields watermill.LogFields) {
	z.logger.Info(msg, zap.Any("watermill_fields", fields))
}

func (z *zapLoggerAdapter) Debug(msg string, fields watermill.LogFields) {
	z.logger.Debug(msg, zap.Any("watermill_fields", fields))
}

func (z *zapLoggerAdapter) Trace(msg string, fields watermill.LogFields) {
	z.logger.Debug(msg, zap.Any("watermill_fields", fields))
}

func (z *zapLoggerAdapter) With(fields watermill.LogFields) watermill.LoggerAdapter {
	return &zapLoggerAdapter{logger: z.logger.With(zap.Any("watermill_fields", fields))}
}

// NewPublisher constructs a fault-tolerant, thread-safe Watermill publisher 
// bound to the Upstash Redis connection.
func NewPublisher(client redis.UniversalClient, logger *zap.Logger) (*redisstream.Publisher, error) {
	adapter := &zapLoggerAdapter{logger: logger}

	publisher, err := redisstream.NewPublisher(
		redisstream.PublisherConfig{
			Client:     client,
			Marshaller: redisstream.DefaultMarshallerUnmarshaller{},
		},
		adapter,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to initialize watermill redis publisher: %w", err)
	}

	logger.Info("Watermill Redis publisher successfully initialized")
	return publisher, nil
}