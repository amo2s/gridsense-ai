package models

import "time"

// ==========================================
// Ingestion Contracts (Go -> Python Engine A)
// ==========================================

// AssetMetadata represents the physical parameters of the grid infrastructure.
type AssetMetadata struct {
	FeederID     string  `json:"feeder_id"`
	VoltageClass string  `json:"voltage_class"`
	CapacityMW   float64 `json:"capacity_mw"`
}

// InterruptionRecord tracks discrete outage events.
type InterruptionRecord struct {
	StartTime       time.Time `json:"start_time"`
	DurationMinutes float64   `json:"duration_minutes"`
}

// OperationalPayload is the master strict-boundary wrapper dispatched to Engine A.
type OperationalPayload struct {
	CycleTimestamp time.Time            `json:"cycle_timestamp"`
	Asset          AssetMetadata        `json:"asset"`
	Interruptions  []InterruptionRecord `json:"interruptions"`
}

// ==========================================
// Egress Contracts (Python Engine A -> Go -> Frontend)
// ==========================================

// SubScoreMetrics contains the fractional math breakdown.
type SubScoreMetrics struct {
	BaseAvailability float64 `json:"base_availability"`
	DurationPenalty  float64 `json:"duration_penalty"`
	FrequencyPenalty float64 `json:"frequency_penalty"`
}

// VulnerabilityWindow represents the isolated time blocks where reliability failed.
type VulnerabilityWindow struct {
	StartTime   time.Time `json:"start_time"`
	EndTime     time.Time `json:"end_time"`
	SeverityTag string    `json:"severity_tag"`
}

// AuditMetadata provides deterministic proof of execution.
type AuditMetadata struct {
	CycleTimestamp       time.Time `json:"cycle_timestamp"`
	CalculationLatencyMS float64   `json:"calculation_latency_ms"`
	EngineVersion        string    `json:"engine_version"`
}

// EgressPayload is the immutable response returned to the frontend.
type EgressPayload struct {
	FeederID             string                `json:"feeder_id"`
	ReliabilityScore     int                   `json:"reliability_score"`
	RiskBand             string                `json:"risk_band"`
	Trajectory           string                `json:"trajectory"`
	SubScores            SubScoreMetrics       `json:"sub_scores"`
	VulnerabilityWindows []VulnerabilityWindow `json:"vulnerability_windows"`
	Audit                AuditMetadata         `json:"audit"`
}