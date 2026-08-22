package config

import (
	"log"
	"os"
	"strings"

	"github.com/joho/godotenv"
)

// Config strictly defines the memory structure for our environment variables.
type Config struct {
	Port                  string
	DatabaseURL           string
	UpstashRedisRestURL   string
	UpstashRedisRestToken string
	JWTSecret             []byte // Pre-allocated as bytes for direct cryptographic use
	Environment           string
	CookieSecure          bool
}

// LoadConfig parses, validates, and locks in the environment state.
func LoadConfig() *Config {
	// 1. Attempt to load the local .env file.
	// We don't throw a fatal error here because cloud environments
	// bypass .env files and inject secrets directly into the OS environment.
	if err := godotenv.Load(); err != nil {
		log.Println("Notice: No local .env file found. Reading directly from OS environment.")
	}

	// 2. Parse and lock variables into the struct
	cfg := &Config{
		Port:                  getEnvOrDefault("AUTH_PORT", "8081"),
		Environment:           strings.ToLower(getEnvOrDefault("ENV", "development")),
		DatabaseURL:           requireEnv("DATABASE_URL"),
		UpstashRedisRestURL:   requireEnv("UPSTASH_REDIS_REST_URL"),
		UpstashRedisRestToken: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
		JWTSecret:             []byte(requireEnv("JWT_SECRET")),
	}

	// 3. Strict Security: Enforce Secure/HttpOnly cookie properties in production.
	cfg.CookieSecure = cfg.Environment == "production"

	log.Printf("Auth configuration verified. Environment: %s", cfg.Environment)
	return cfg
}

// requireEnv ensures critical secrets are present, failing fast if they are missing.
func requireEnv(key string) string {
	value := os.Getenv(key)
	if strings.TrimSpace(value) == "" {
		// Immediately halt the application if a security secret is missing.
		log.Fatalf("CRITICAL STARTUP ERROR: Required environment variable '%s' is missing or empty", key)
	}
	return value
}

// getEnvOrDefault provides safe fallback values for non-critical routing settings.
func getEnvOrDefault(key, fallback string) string {
	if value, exists := os.LookupEnv(key); exists && strings.TrimSpace(value) != "" {
		return value
	}
	return fallback
}