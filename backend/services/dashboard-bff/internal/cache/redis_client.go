package cache

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

var (
	// ErrCacheMiss is returned when a requested key does not exist.
	ErrCacheMiss = errors.New("cache: key not found or expired")
)

// RedisClient acts as a highly concurrent, connection-pooled interface to the distributed cache.
type RedisClient struct {
	rdb *redis.Client
}

// NewRedisClient establishes a resilient connection pool to Redis.
func NewRedisClient(ctx context.Context, redisURL string) (*RedisClient, error) {
	opts, err := redis.ParseURL(redisURL)
	if err != nil {
		return nil, fmt.Errorf("failed to parse redis url: %w", err)
	}

	// Optimize connection pooling for high-throughput BFF workloads.
	opts.PoolSize = 100
	opts.MinIdleConns = 10
	opts.ConnMaxLifetime = 5 * time.Minute
	opts.DialTimeout = 5 * time.Second
	opts.ReadTimeout = 3 * time.Second
	opts.WriteTimeout = 3 * time.Second

	rdb := redis.NewClient(opts)

	// Fail fast during initialization if the cache layer is unreachable.
	if err := rdb.Ping(ctx).Err(); err != nil {
		return nil, fmt.Errorf("redis readiness ping failed: %w", err)
	}

	return &RedisClient{rdb: rdb}, nil
}

// BuildTenantKey enforces strict logical isolation by universally prefixing cache keys with the tenant ID.
// Format: dashboard:{tenant_id}:{resource}:{aggregation}:{version}
func BuildTenantKey(tenantID, resource, aggregation, version string) string {
	return fmt.Sprintf("dashboard:%s:%s:%s:%s", tenantID, resource, aggregation, version)
}

// Get executes a highly optimized read against the cache.
func (c *RedisClient) Get(ctx context.Context, key string) ([]byte, error) {
	data, err := c.rdb.Get(ctx, key).Bytes()
	if err != nil {
		if errors.Is(err, redis.Nil) {
			return nil, ErrCacheMiss
		}
		return nil, fmt.Errorf("redis get operation failed: %w", err)
	}
	return data, nil
}

// Set persists pre-computed aggregates with a strict mandatory Time-To-Live (TTL).
func (c *RedisClient) Set(ctx context.Context, key string, data []byte, ttl time.Duration) error {
	if ttl <= 0 {
		return errors.New("a positive TTL is strictly required to prevent unbounded memory growth")
	}

	if err := c.rdb.Set(ctx, key, data, ttl).Err(); err != nil {
		return fmt.Errorf("redis set operation failed: %w", err)
	}
	return nil
}

// Invalidate actively purges a cached aggregate (e.g., when a mutation occurs).
func (c *RedisClient) Invalidate(ctx context.Context, key string) error {
	if err := c.rdb.Del(ctx, key).Err(); err != nil {
		return fmt.Errorf("redis delete operation failed: %w", err)
	}
	return nil
}

// Subscribe opens a Pub/Sub channel connection. 
// This is strictly used by the internal/realtime subscription manager.
func (c *RedisClient) Subscribe(ctx context.Context, channel string) *redis.PubSub {
	return c.rdb.Subscribe(ctx, channel)
}

// Close gracefully terminates all idle and active connections in the pool.
func (c *RedisClient) Close() error {
	return c.rdb.Close()
}