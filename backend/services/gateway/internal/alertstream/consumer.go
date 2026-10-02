// Package alertstream connects to the Alert microservice's live SSE feed and
// republishes each event to Redis via GatewayGRPCServer.BroadcastAnomaly, so
// the BFF's SubscriptionManager (subscribed to system:operational_events)
// receives real-time updates. This replaces the old REST StreamSSE reverse
// proxy: that proxy forwarded bytes straight to one HTTP client; this
// consumer runs once in the Gateway and fans out to every GraphQL subscriber
// through Redis instead.
//
// ASSUMPTION, unverified against a real payload: the Alert service's SSE
// "data:" lines carry a JSON-encoded models.Alert, the same shape returned
// by GET /api/v1/alerts/active. If the live format differs, only decodeEvent
// needs to change — everything else (connection, reconnect, the Alert->
// AnomalyEvent mapping) stays correct.
package alertstream

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"math"
	"math/rand"
	"net/http"
	"strings"
	"time"

	"gateway/models"
	pb "gridsense-ai/backend/services/dashboard-bff/proto/gen/gateway/v1/proto"
)

// Broadcaster is the one method this package needs from GatewayGRPCServer.
// Defined here (not imported from the server package) to avoid a dependency
// cycle and to keep this consumer trivially testable with a fake.
type Broadcaster interface {
	BroadcastAnomaly(ctx context.Context, event *pb.AnomalyEvent) error
}

type Consumer struct {
	streamURL  string
	serviceKey string // ALERT_INTERNAL_KEY, sent as X-Gateway-Token — same value alertHandler already uses
	httpClient *http.Client
	broadcast  Broadcaster
}

// NewConsumer builds a consumer for the Alert service's SSE stream.
// streamURL is typically <ALERT_SERVICE_URL>/api/v1/alerts/stream.
func NewConsumer(streamURL, serviceKey string, broadcast Broadcaster) *Consumer {
	return &Consumer{
		streamURL:  streamURL,
		serviceKey: serviceKey,
		httpClient: &http.Client{
			// No overall Timeout: an SSE connection is meant to stay open
			// indefinitely. Per-attempt connect behavior is bounded by the
			// context passed to Run.
		},
		broadcast: broadcast,
	}
}

// Run connects and reconnects with jittered exponential backoff until ctx is
// canceled. It never returns except when ctx is done, so callers should run
// it in its own goroutine, matching how subscriptionManager.Start is run in
// the BFF.
func (c *Consumer) Run(ctx context.Context) {
	const (
		initialBackoff = 1 * time.Second
		maxBackoff     = 30 * time.Second
	)
	attempt := 0

	for {
		select {
		case <-ctx.Done():
			slog.Info("alertstream consumer stopping: context canceled")
			return
		default:
		}

		err := c.connectAndStream(ctx)
		if ctx.Err() != nil {
			return // shutdown, not a real failure
		}

		attempt++
		backoff := time.Duration(math.Min(
			float64(initialBackoff)*math.Pow(2, float64(attempt-1)),
			float64(maxBackoff),
		))
		jitter := time.Duration(rand.Int63n(int64(backoff) / 4))
		wait := backoff + jitter

		slog.Warn("alertstream connection lost, reconnecting",
			"error", err, "attempt", attempt, "backoff", wait)

		select {
		case <-ctx.Done():
			return
		case <-time.After(wait):
		}
	}
}

// connectAndStream opens one SSE connection and processes events until the
// connection drops or ctx is canceled. A successful, uneventful stream that
// simply reconnects (e.g. the server closing an idle connection) resets the
// backoff by returning nil; Run's caller re-enters connectAndStream fresh.
func (c *Consumer) connectAndStream(ctx context.Context) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.streamURL, nil)
	if err != nil {
		return fmt.Errorf("failed to build SSE request: %w", err)
	}
	req.Header.Set("X-Gateway-Token", c.serviceKey)
	req.Header.Set("Accept", "text/event-stream")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("SSE connection failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("SSE connection rejected: status %d", resp.StatusCode)
	}

	slog.Info("alertstream connected", "url", c.streamURL)

	scanner := bufio.NewScanner(resp.Body)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024) // allow larger SSE frames

	var dataLines []string
	for scanner.Scan() {
		if ctx.Err() != nil {
			return ctx.Err()
		}

		line := scanner.Text()

		switch {
		case line == "":
			// Blank line = dispatch the buffered event (standard SSE framing).
			if len(dataLines) > 0 {
				c.handleEvent(ctx, strings.Join(dataLines, "\n"))
				dataLines = nil
			}
		case strings.HasPrefix(line, "data:"):
			dataLines = append(dataLines, strings.TrimPrefix(strings.TrimPrefix(line, "data:"), " "))
		case strings.HasPrefix(line, ":"):
			// Comment/heartbeat line, per SSE spec. Ignore.
		default:
			// event:, id:, retry: lines are not currently needed since we
			// treat every dispatched event uniformly.
		}
	}

	if err := scanner.Err(); err != nil {
		return fmt.Errorf("SSE stream read error: %w", err)
	}
	return errors.New("SSE stream closed by server")
}

// handleEvent decodes one dispatched SSE event and broadcasts it. Decode or
// mapping failures are logged and skipped — one malformed event must never
// take down the whole consumer loop.
func (c *Consumer) handleEvent(ctx context.Context, raw string) {
	alert, err := decodeEvent(raw)
	if err != nil {
		slog.Error("alertstream: failed to decode event, skipping", "error", err, "raw", raw)
		return
	}

	event := &pb.AnomalyEvent{
		EventId:     alert.ID,
		AreaId:      alert.EntityID,
		EventType:   alert.Type,
		Severity:    alert.Severity,
		Description: alert.Message,
		Timestamp:   alert.CreatedAt.Format(time.RFC3339),
	}

	if err := c.broadcast.BroadcastAnomaly(ctx, event); err != nil {
		slog.Error("alertstream: broadcast failed, dropping event", "error", err, "event_id", alert.ID)
	}
}

// decodeEvent unmarshals one SSE "data:" payload into models.Alert.
// See the package-level ASSUMPTION comment: change only this function if the
// Alert service's live event schema turns out to differ.
func decodeEvent(raw string) (*models.Alert, error) {
	var alert models.Alert
	if err := json.Unmarshal([]byte(raw), &alert); err != nil {
		return nil, fmt.Errorf("json decode failed: %w", err)
	}
	if alert.ID == "" {
		return nil, errors.New("decoded alert has empty ID")
	}
	return &alert, nil
}
