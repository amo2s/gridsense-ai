package shared

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"time"
)

// RedisClient provides an HTTP-based interface to Upstash Redis REST API.
type RedisClient struct {
	restURL    string
	token      string
	httpClient *http.Client
}

// upstashResponse represents the standard JSON payload returned by Upstash REST API.
type upstashResponse struct {
	Result interface{} `json:"result"`
	Error  string      `json:"error,omitempty"`
}

// NewRedisClient initializes and verifies an HTTP-based Upstash Redis connection.
func NewRedisClient(restURL, token string) (*RedisClient, error) {
	client := &RedisClient{
		restURL: restURL,
		token:   token,
		httpClient: &http.Client{
			Timeout: 5 * time.Second,
		},
	}

	log.Println("Establishing connection to Upstash Redis (REST)...")

	// Fail-fast startup ping test
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := client.Ping(ctx); err != nil {
		return nil, fmt.Errorf("upstash rest ping failed, check credentials and network: %w", err)
	}

	log.Println("Upstash Redis connection successfully established and verified.")
	return client, nil
}

// Ping sends a PING command to verify connection and credentials.
func (c *RedisClient) Ping(ctx context.Context) error {
	_, err := c.Execute(ctx, "PING")
	return err
}

// Set stores a key-value pair with an optional TTL (in seconds).
func (c *RedisClient) Set(ctx context.Context, key string, value interface{}, expiration time.Duration) error {
	var args []interface{}
	if expiration > 0 {
		args = []interface{}{"SET", key, value, "EX", int(expiration.Seconds())}
	} else {
		args = []interface{}{"SET", key, value}
	}

	_, err := c.Execute(ctx, args...)
	return err
}

// Get retrieves a string value by key.
func (c *RedisClient) Get(ctx context.Context, key string) (string, error) {
	res, err := c.Execute(ctx, "GET", key)
	if err != nil {
		return "", err
	}
	if res == nil {
		return "", fmt.Errorf("key not found")
	}

	val, ok := res.(string)
	if !ok {
		return "", fmt.Errorf("unexpected value type from redis")
	}
	return val, nil
}

// Del deletes one or more keys.
func (c *RedisClient) Del(ctx context.Context, keys ...string) error {
	args := append([]interface{}{"DEL"}, toInterfaceSlice(keys)...)
	_, err := c.Execute(ctx, args...)
	return err
}

// Execute handles raw commands against the Upstash REST endpoint.
func (c *RedisClient) Execute(ctx context.Context, commandAndArgs ...interface{}) (interface{}, error) {
	jsonBody, err := json.Marshal(commandAndArgs)
	if err != nil {
		return nil, fmt.Errorf("failed to encode redis command: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.restURL, bytes.NewBuffer(jsonBody))
	if err != nil {
		return nil, fmt.Errorf("failed to build request: %w", err)
	}

	req.Header.Set("Authorization", "Bearer "+c.token)
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request execution failed: %w", err)
	}
	defer resp.Body.Close()

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response body: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("upstash error (status %d): %s", resp.StatusCode, string(bodyBytes))
	}

	var parsed upstashResponse
	if err := json.Unmarshal(bodyBytes, &parsed); err != nil {
		return nil, fmt.Errorf("failed to parse response json: %w", err)
	}

	if parsed.Error != "" {
		return nil, fmt.Errorf("redis returned error: %s", parsed.Error)
	}

	return parsed.Result, nil
}

func toInterfaceSlice(slice []string) []interface{} {
	out := make([]interface{}, len(slice))
	for i, v := range slice {
		out[i] = v
	}
	return out
}

// Close is a no-op for HTTP client (kept for interface compatibility)
func (c *RedisClient) Close() error {
	return nil
}
