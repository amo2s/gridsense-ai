package handlers

import (
	"log"
	"os"
)

// mustGetEnv returns a required environment variable and exits at startup if it is
// missing, instead of silently falling back to a guessable default.
func mustGetEnv(key string) string {
	v := os.Getenv(key)
	if v == "" {
		log.Fatalf("CRITICAL CONFIGURATION ERROR: Environment variable %s is missing or empty.", key)
	}
	return v
}