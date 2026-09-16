package config

import (
	"fmt"

	"github.com/caarlos0/env/v11"
)

// Config holds all environment-level configuration for the alert microservice.
type Config struct {
	Environment          string `env:"APP_ENV" envDefault:"development"`
	Port                 string `env:"PORT" envDefault:"8001"`
	DatabaseURL          string `env:"DATABASE_URL,required"`
	InternalServiceKey   string `env:"INTERNAL_SERVICE_KEY,required"`
	RedisURL             string `env:"UPSTASH_REDIS_URL,required"`
	AlertStreamName      string `env:"ALERT_STREAM_NAME" envDefault:"gridsense:alerts:stream"`
	DeadLetterStreamName string `env:"ALERT_DLQ_NAME" envDefault:"gridsense:alerts:dlq"`
	ConsumerGroup        string `env:"ALERT_CONSUMER_GROUP" envDefault:"alerts-processor-group"`
}

// Load parses environment variables into the Config struct.
// It returns an error if any required variables are missing or malformed.
func Load() (*Config, error) {
	var cfg Config
	if err := env.Parse(&cfg); err != nil {
		return nil, fmt.Errorf("failed to parse environment configuration: %w", err)
	}

	return &cfg, nil
}