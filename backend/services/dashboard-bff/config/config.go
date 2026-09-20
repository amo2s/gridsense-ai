package config

import (
	"log"
	"os"

	"github.com/joho/godotenv"
)

// Config holds the environment variables strictly required for the Dashboard BFF.
type Config struct {
	Port           string
	GatewayGRPCURL string
	RedisURL       string
	JWTSecret      []byte // Stored as bytes for optimized cryptographic operations
}

// LoadConfig parses and validates the environment state, failing fast on missing secrets.
func LoadConfig() *Config {
	// Attempt to load the .env file locally; silently ignore in production/Docker
	_ = godotenv.Load()

	cfg := &Config{
		Port:           getEnvOrDefault("BFF_PORT", "8082"),
		GatewayGRPCURL: getEnvOrFatal("GATEWAY_GRPC_URL"),
		RedisURL:       getEnvOrFatal("REDIS_URL"),
		JWTSecret:      []byte(getEnvOrFatal("JWT_SECRET")),
	}

	return cfg
}

// getEnvOrFatal instantly crashes the service if a critical dependency is missing.
func getEnvOrFatal(key string) string {
	value := os.Getenv(key)
	if value == "" {
		log.Fatalf("CRITICAL CONFIGURATION ERROR: Environment variable %s is missing or empty.", key)
	}
	return value
}

// getEnvOrDefault provides safe fallback values for non-critical settings.
func getEnvOrDefault(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}