package domain

import (
	"time"

	"github.com/go-playground/validator/v10"
)

// EventType defines the categorical routing boundary for incoming streams.
type EventType string

const (
	EventTypeAuth    EventType = "AUTH_EVENT"
	EventTypeError   EventType = "SYSTEM_ERROR"
	EventTypeAnomaly EventType = "FEEDER_ANOMALY"
)

// BaseEvent represents the common envelope for all incoming Watermill messages.
type BaseEvent struct {
	EventID   string    `json:"event_id" validate:"required,uuid"`
	TraceID   string    `json:"trace_id" validate:"required"`
	Type      EventType `json:"type" validate:"required,oneof=AUTH_EVENT SYSTEM_ERROR FEEDER_ANOMALY"`
	Timestamp time.Time `json:"timestamp" validate:"required"`
	Source    string    `json:"source" validate:"required"`
}

// AuthPayload represents authentication events (e.g., failed logins) from the Go Gateway.
type AuthPayload struct {
	BaseEvent
	UserID        string `json:"user_id" validate:"required,uuid"`
	Action        string `json:"action" validate:"required"`
	IPAddress     string `json:"ip_address" validate:"required,ip"`
	FailureReason string `json:"failure_reason,omitempty"`
}

// ErrorPayload represents critical system exceptions.
type ErrorPayload struct {
	BaseEvent
	ErrorCode    string `json:"error_code" validate:"required"`
	ErrorMessage string `json:"error_message" validate:"required"`
	StackTrace   string `json:"stack_trace,omitempty"`
	Component    string `json:"component" validate:"required"`
}

// AnomalyPayload represents intelligence risk spikes from FastAPI engines (B & C).
type AnomalyPayload struct {
	BaseEvent
	FeederID        string                 `json:"feeder_id" validate:"required"`
	RiskScore       float64                `json:"risk_score" validate:"required,min=0,max=100"`
	Severity        string                 `json:"severity" validate:"required,oneof=INFO WARNING CRITICAL PANIC"`
	MetricsSnapshot map[string]interface{} `json:"metrics_snapshot,omitempty"`
}

// Validate is a thread-safe, global validator instance configured for domain entities.
// It caches struct info and should be reused across the application to prevent allocations.
var Validate = validator.New()