package throttle

import (
	"context"
	"time"

	"github.com/redis/go-redis/v9"
)

// RateLimiter defines the contract for deduplication and rate limiting algorithms.
type RateLimiter interface {
	// Allow evaluates if a specific key has exceeded its limit within the defined time window.
	Allow(ctx context.Context, key string, limit int, window time.Duration) (bool, error)
}

// redisSlidingWindowLimiter implements RateLimiter using atomic Lua scripts.
type redisSlidingWindowLimiter struct {
	client redis.UniversalClient
	script *redis.Script
}

// NewRedisLimiter initializes a high-performance Lua-backed sliding window rate limiter.
func NewRedisLimiter(client redis.UniversalClient) RateLimiter {
	// The Lua script guarantees 100% atomicity for the read-evaluate-write cycle.
	// KEYS[1]: Rate limit identifier (e.g., "throttle:feeder_id:rule_id")
	// ARGV[1]: Window size in milliseconds
	// ARGV[2]: Current timestamp in milliseconds
	// ARGV[3]: Maximum allowed requests in the window
	lua := `
		local key = KEYS[1]
		local window = tonumber(ARGV[1])
		local now = tonumber(ARGV[2])
		local limit = tonumber(ARGV[3])
		
		local clearBefore = now - window
		
		-- Remove older events outside the sliding window
		redis.call('ZREMRANGEBYSCORE', key, 0, clearBefore)
		
		-- Count events currently in the window
		local count = redis.call('ZCARD', key)
		
		if count < limit then
			-- Allow: add current timestamp and reset TTL to prevent memory leaks
			redis.call('ZADD', key, now, now)
			redis.call('PEXPIRE', key, window)
			return 1
		else
			-- Block: rate limit exceeded
			return 0
		end
	`
	return &redisSlidingWindowLimiter{
		client: client,
		script: redis.NewScript(lua),
	}
}

// Allow executes the Lua script against the Redis cluster.
func (l *redisSlidingWindowLimiter) Allow(ctx context.Context, key string, limit int, window time.Duration) (bool, error) {
	now := time.Now().UnixMilli()
	windowMs := window.Milliseconds()

	// script.Run automatically handles EVALSHA caching optimization internally
	result, err := l.script.Run(ctx, l.client, []string{key}, windowMs, now, limit).Int()
	if err != nil {
		return false, err
	}

	return result == 1, nil
}