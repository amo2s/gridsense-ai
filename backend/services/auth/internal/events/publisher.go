package events

import (
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/ThreeDotsLabs/watermill"
	"github.com/ThreeDotsLabs/watermill-redisstream/pkg/redisstream"
	"github.com/ThreeDotsLabs/watermill/message"
	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
)

// AuthEventTopic is the canonical Redis stream name for auth-originated events.
const AuthEventTopic = "admin.auth.events"

// AuthEvent defines the standard JSON envelope published by the Auth Service
// to notify downstream consumers (Alerts) of authentication lifecycle events.
type AuthEvent struct {
	EventID   string    `json:"event_id"`
	TraceID   string    `json:"trace_id"`
	Type      string    `json:"type"`
	Source    string    `json:"source"`
	Timestamp time.Time `json:"timestamp"`
	EventType string    `json:"event_type"`
	UserID    string    `json:"user_id"`
	UserName  string    `json:"user_name"`
	UserEmail string    `json:"user_email"`
	Action    string    `json:"action"`
	IPAddress string    `json:"ip_address,omitempty"`
}

// Publisher wraps the Watermill Redis stream publisher for auth events.
type Publisher struct {
	pub *redisstream.Publisher
}

// NewPublisher initializes a Watermill Redis stream publisher using the standard
// go-redis TCP client (NOT the Upstash REST client). Requires the `rediss://` URL.
func NewPublisher(redisURL string) (*Publisher, error) {
	opts, err := redis.ParseURL(redisURL)
	if err != nil {
		return nil, fmt.Errorf("failed to parse redis URL for event publisher: %w", err)
	}

	client := redis.NewClient(opts)

	pub, err := redisstream.NewPublisher(
		redisstream.PublisherConfig{
			Client:     client,
			Marshaller: redisstream.DefaultMarshallerUnmarshaller{},
		},
		watermill.NewStdLogger(false, false),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to initialize watermill redis publisher: %w", err)
	}

	log.Println("Auth event publisher initialized successfully")
	return &Publisher{pub: pub}, nil
}

// PublishAuthEvent marshals and publishes an AuthEvent to the admin.auth.events topic.
// This operation is designed to be non-blocking; callers should invoke it asynchronously.
func (p *Publisher) PublishAuthEvent(event AuthEvent) error {
	// Fill in envelope fields if missing
	if event.EventID == "" {
		event.EventID = uuid.New().String()
	}
	if event.TraceID == "" {
		event.TraceID = uuid.New().String()
	}
	if event.Timestamp.IsZero() {
		event.Timestamp = time.Now().UTC()
	}
	event.Type = "AUTH_EVENT"
	event.Source = "auth-service"

	payload, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("failed to marshal auth event: %w", err)
	}

	msg := message.NewMessage(event.EventID, payload)

	if err := p.pub.Publish(AuthEventTopic, msg); err != nil {
		return fmt.Errorf("failed to publish auth event to %s: %w", AuthEventTopic, err)
	}

	return nil
}

// Close gracefully shuts down the publisher connection.
func (p *Publisher) Close() error {
	return p.pub.Close()
}
