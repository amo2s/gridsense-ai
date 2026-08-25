package config

import (
	"log"
	"os"

	"github.com/joho/godotenv"
)

// Config acts as a strongly-typed, in-memory store for all environment variables.
// This prevents scattering os.Getenv() calls throughout the codebase.
type Config struct {
	GatewayPort        string // e.g., "8080"
	DatabaseURL        string // PostgreSQL connection pool string
	JWTSecret          string // Shared secret to validate Next.js user tokens
	EngineAURL         string // Docker bridge URL for Python Engine A (e.g., http://engine_a:8000)
	InternalServiceKey string // X-Gateway-Token to authenticate with Engine A
	AuthServiceURL     string // Docker bridge URL for routing to your Auth Microservice (e.g., http://auth_service:8081)
}

// LoadConfig parses the environment variables and validates their presence.
func LoadConfig() *Config {
	// Attempt to load the .env file if running locally.
	// We ignore the error because in a production Docker/Kubernetes environment, 
	// variables are often injected directly by the orchestrator without a .env file.
	_ = godotenv.Load()

	cfg := &Config{
		GatewayPort:        getEnvOrFatal("GATEWAY_PORT"),
		DatabaseURL:        getEnvOrFatal("DATABASE_URL"),
		JWTSecret:          getEnvOrFatal("JWT_SECRET"),
		EngineAURL:         getEnvOrFatal("ENGINE_A_URL"),
		InternalServiceKey: getEnvOrFatal("INTERNAL_SERVICE_KEY"),
		AuthServiceURL:     getEnvOrFatal("AUTH_SERVICE_URL"),
	}

	return cfg
}

// getEnvOrFatal is a helper function that enforces the fail-fast principle.
// If a required variable is missing, the application fatally crashes instantly.
func getEnvOrFatal(key string) string {
	value := os.Getenv(key)
	if value == "" {
		log.Fatalf("CRITICAL CONFIGURATION ERROR: Environment variable %s is missing or empty.", key)
	}
	return value
}