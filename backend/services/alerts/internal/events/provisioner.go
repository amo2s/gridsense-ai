package events

import (
	"context"
	"strings"

	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"

	"github.com/gridsense-ai/alerts/internal/config"
)

// Provisioner handles the idempotent creation of Redis Streams and Consumer Groups.
type Provisioner struct {
	client *redis.Client
	logger *zap.Logger
}

// NewProvisioner creates a new Provisioner instance.
func NewProvisioner(client *redis.Client, logger *zap.Logger) *Provisioner {
	return &Provisioner{
		client: client,
		logger: logger,
	}
}

// Initialize idempotently provisions the main alert stream and the dead-letter stream,
// ensuring their respective consumer groups exist.
func (p *Provisioner) Initialize(ctx context.Context, cfg *config.Config) error {
	p.logger.Info("Provisioning Redis Streams and Consumer Groups",
		zap.String("stream", cfg.AlertStreamName),
		zap.String("dlq", cfg.DeadLetterStreamName),
		zap.String("group", cfg.ConsumerGroup),
	)

	if err := p.createGroupMkStream(ctx, cfg.AlertStreamName, cfg.ConsumerGroup); err != nil {
		return err
	}

	if err := p.createGroupMkStream(ctx, cfg.DeadLetterStreamName, cfg.ConsumerGroup); err != nil {
		return err
	}

	p.logger.Info("Redis Streams provisioned successfully")
	return nil
}

func (p *Provisioner) createGroupMkStream(ctx context.Context, stream, group string) error {
	err := p.client.XGroupCreateMkStream(ctx, stream, group, "0").Err()
	if err != nil {
		if strings.Contains(err.Error(), "BUSYGROUP") {
			p.logger.Debug("Consumer group already exists, skipping creation",
				zap.String("stream", stream),
				zap.String("group", group),
			)
			return nil
		}
		p.logger.Error("Failed to create consumer group and stream",
			zap.String("stream", stream),
			zap.String("group", group),
			zap.Error(err),
		)
		return err
	}

	p.logger.Info("Successfully created stream and consumer group",
		zap.String("stream", stream),
		zap.String("group", group),
	)
	return nil
}