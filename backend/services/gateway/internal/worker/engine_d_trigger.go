package worker

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"

	"gateway/handlers"
	interventionoutcomes "gateway/intervention_outcomes"
)

const (
	StreamName = "gridsense:alerts:stream"
	GroupName  = "engine-d-workers"
	ConsumerID = "gateway-node-1"
)

// AnomalyStreamPayload represents the deserialized Watermill JSON payload
// published to gridsense:alerts:stream by the Python AI engines.
type AnomalyStreamPayload struct {
	EventID         string                 `json:"event_id"`
	TraceID         string                 `json:"trace_id"`
	Type            string                 `json:"type"`
	Timestamp       interface{}            `json:"timestamp"`
	Source          string                 `json:"source"`
	FeederID        string                 `json:"feeder_id"`
	RiskScore       float64                `json:"risk_score"`
	Severity        string                 `json:"severity"`
	MetricsSnapshot map[string]interface{} `json:"metrics_snapshot,omitempty"`
}

// EngineDTriggerWorker listens to the Upstash Redis stream for critical anomaly
// events from Engine C, resolves the associated operational area for the anomalous
// feeder, and automatically triggers the Engine D prioritization pipeline.
type EngineDTriggerWorker struct {
	redisClient        *redis.Client
	prioritizationRepo handlers.PrioritizationRepository
	aiClient           handlers.EngineDClient
	outcomesRepo       interventionoutcomes.Repository
}

// NewEngineDTriggerWorker constructs the worker and ensures the Redis Consumer Group exists.
func NewEngineDTriggerWorker(
	redisClient *redis.Client,
	prioritizationRepo handlers.PrioritizationRepository,
	aiClient handlers.EngineDClient,
	outcomesRepo ...interventionoutcomes.Repository,
) *EngineDTriggerWorker {
	var ocRepo interventionoutcomes.Repository
	if len(outcomesRepo) > 0 {
		ocRepo = outcomesRepo[0]
	}

	w := &EngineDTriggerWorker{
		redisClient:        redisClient,
		prioritizationRepo: prioritizationRepo,
		aiClient:           aiClient,
		outcomesRepo:       ocRepo,
	}

	// Step 2.2: Ensure Redis Consumer Group exists using XGroupCreateMkStream
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := w.ensureConsumerGroup(ctx); err != nil {
		slog.Warn("Failed to ensure consumer group during constructor initialization; will retry in Run loop",
			"stream", StreamName,
			"group", GroupName,
			"error", err,
		)
	}

	return w
}

func (w *EngineDTriggerWorker) ensureConsumerGroup(ctx context.Context) error {
	err := w.redisClient.XGroupCreateMkStream(ctx, StreamName, GroupName, "$").Err()
	if err != nil {
		if strings.Contains(err.Error(), "BUSYGROUP") {
			slog.Debug("Redis stream consumer group already exists, skipping creation",
				"stream", StreamName,
				"group", GroupName,
			)
			return nil
		}
		return err
	}
	slog.Info("Successfully created Redis stream consumer group",
		"stream", StreamName,
		"group", GroupName,
		"start_id", "$",
	)
	return nil
}

// Run executes the continuous Redis Stream consumer loop with blocking XReadGroup calls.
func (w *EngineDTriggerWorker) Run(ctx context.Context) {
	slog.Info("Engine D event-driven trigger worker started listening to Redis stream",
		"stream", StreamName,
		"group", GroupName,
		"consumer", ConsumerID,
	)

	// Ensure consumer group in case of transient Redis startup delay
	_ = w.ensureConsumerGroup(ctx)

	for {
		select {
		case <-ctx.Done():
			slog.Info("Engine D trigger worker shutting down: context canceled")
			return
		default:
		}

		entries, err := w.redisClient.XReadGroup(ctx, &redis.XReadGroupArgs{
			Group:    GroupName,
			Consumer: ConsumerID,
			Streams:  []string{StreamName, ">"},
			Count:    10,
			Block:    2 * time.Second,
		}).Result()

		if err != nil {
			if errors.Is(err, redis.Nil) {
				// Normal timeout when no messages arrive within Block duration
				continue
			}
			if errors.Is(err, context.Canceled) || ctx.Err() != nil {
				slog.Info("Engine D trigger worker shutting down: context canceled")
				return
			}
			if strings.Contains(err.Error(), "NOGROUP") {
				slog.Warn("Consumer group missing, re-creating...", "group", GroupName)
				_ = w.ensureConsumerGroup(ctx)
				time.Sleep(500 * time.Millisecond)
				continue
			}

			slog.Error("Redis stream XReadGroup read failed", "error", err)
			select {
			case <-ctx.Done():
				return
			case <-time.After(500 * time.Millisecond):
			}
			continue
		}

		for _, stream := range entries {
			for _, msg := range stream.Messages {
				w.processMessage(ctx, msg)
			}
		}
	}
}

func (w *EngineDTriggerWorker) processMessage(ctx context.Context, msg redis.XMessage) {
	// Step 2.4: Payload Parsing (Watermill Envelope)
	var rawPayload interface{}
	if p, ok := msg.Values["_watermill_message_payload"]; ok {
		rawPayload = p
	} else if p, ok := msg.Values["payload"]; ok {
		rawPayload = p
	}

	if rawPayload == nil {
		slog.Warn("Stream message missing _watermill_message_payload field, acknowledging and skipping",
			"msg_id", msg.ID,
		)
		w.ack(ctx, msg.ID)
		return
	}

	var payloadBytes []byte
	switch v := rawPayload.(type) {
	case string:
		payloadBytes = []byte(v)
	case []byte:
		payloadBytes = v
	default:
		payloadBytes = []byte(fmt.Sprintf("%v", v))
	}

	if len(payloadBytes) == 0 {
		slog.Warn("Stream message payload is empty, acknowledging and skipping", "msg_id", msg.ID)
		w.ack(ctx, msg.ID)
		return
	}

	var alert AnomalyStreamPayload
	if err := json.Unmarshal(payloadBytes, &alert); err != nil {
		slog.Error("Failed to unmarshal alert payload from Redis stream, acknowledging and skipping",
			"msg_id", msg.ID,
			"error", err,
		)
		w.ack(ctx, msg.ID)
		return
	}

	// Step 2.5: Business Logic & Trigger
	// Check if source == "Engine C" AND severity == "CRITICAL"
	isEngineC := strings.EqualFold(strings.TrimSpace(alert.Source), "Engine C")
	isCritical := strings.EqualFold(strings.TrimSpace(alert.Severity), "CRITICAL")

	if !isEngineC || !isCritical {
		slog.Debug("Skipping non-critical or non-Engine C event",
			"msg_id", msg.ID,
			"source", alert.Source,
			"severity", alert.Severity,
		)
		w.ack(ctx, msg.ID)
		return
	}

	// Extract and validate feeder_id
	feederID := alert.FeederID
	if feederID == "" || feederID == "FDR-UNKNOWN" {
		if infResult, ok := alert.MetricsSnapshot["inference_result"].(map[string]interface{}); ok {
			if fid, ok := infResult["feeder_id"].(string); ok && fid != "" {
				feederID = fid
			}
		}
	}

	if feederID == "" || feederID == "FDR-UNKNOWN" {
		slog.Warn("Engine C critical anomaly missing valid feeder_id, acknowledging",
			"msg_id", msg.ID,
			"raw_feeder_id", alert.FeederID,
		)
		w.ack(ctx, msg.ID)
		return
	}

	// Call GetAreaIDByFeederID using extracted feeder_id
	resolveCtx, cancelResolve := context.WithTimeout(ctx, 3*time.Second)
	defer cancelResolve()

	areaID, err := w.prioritizationRepo.GetAreaIDByFeederID(resolveCtx, feederID)
	if err != nil {
		slog.Error("Failed to resolve area_id for feeder",
			"feeder_id", feederID,
			"msg_id", msg.ID,
			"error", err,
		)
		// Acknowledge to prevent poison pills from replaying indefinitely
		w.ack(ctx, msg.ID)
		return
	}

	if areaID == "" {
		slog.Warn("Feeder resolved to empty area_id, acknowledging and skipping Engine D trigger",
			"feeder_id", feederID,
			"msg_id", msg.ID,
		)
		w.ack(ctx, msg.ID)
		return
	}

	slog.Info("Engine D automatically triggered via Engine C anomaly",
		"feeder_id", feederID,
		"area_id", areaID,
		"event_id", alert.EventID,
		"severity", alert.Severity,
		"risk_score", alert.RiskScore,
		"msg_id", msg.ID,
	)

	triggerCtx, cancelTrigger := context.WithTimeout(ctx, 15*time.Second)
	defer cancelTrigger()

	if err := w.ExecutePrioritization(triggerCtx, areaID); err != nil {
		slog.Error("Engine D automated prioritization execution failed",
			"area_id", areaID,
			"feeder_id", feederID,
			"msg_id", msg.ID,
			"error", err,
		)
		// If data is insufficient for ranking (e.g., fewer than 2 feeders), ack so it doesn't loop
		if errors.Is(err, handlers.ErrInsufficientAssets) {
			w.ack(ctx, msg.ID)
		}
		return
	}

	slog.Info("Engine D prioritization pipeline successfully completed for area",
		"area_id", areaID,
		"feeder_id", feederID,
		"msg_id", msg.ID,
	)

	// Step 2.6: Acknowledge processed message
	w.ack(ctx, msg.ID)
}

// ExecutePrioritization triggers the Engine D multi-engine fusion, ONNX ranking inference,
// PostgreSQL persistence, and intervention outcome seeding.
func (w *EngineDTriggerWorker) ExecutePrioritization(ctx context.Context, areaID string) error {
	signals, err := w.prioritizationRepo.FetchFusedSignals(ctx, areaID)
	if err != nil {
		return fmt.Errorf("failed to fetch fused signals for area %s: %w", areaID, err)
	}

	payloadBytes, err := json.Marshal(handlers.PrioritizationRequest{
		QueryID: areaID,
		Assets:  signals,
	})
	if err != nil {
		return fmt.Errorf("failed to marshal prioritization payload: %w", err)
	}

	rankingResult, err := w.aiClient.Rank(ctx, payloadBytes)
	if err != nil {
		return fmt.Errorf("engine d inference failed for area %s: %w", areaID, err)
	}

	interventionIDs, err := w.prioritizationRepo.PersistPrioritization(ctx, *rankingResult)
	if err != nil {
		return fmt.Errorf("failed to persist prioritization for area %s: %w", areaID, err)
	}

	if w.outcomesRepo != nil {
		seeds := make([]interventionoutcomes.InterventionSeed, 0, len(rankingResult.RankedAssets))
		for _, asset := range rankingResult.RankedAssets {
			id, ok := interventionIDs[asset.FeederID]
			if !ok {
				continue
			}
			shapFeatures := make([]interventionoutcomes.ShapAttribution, len(asset.Explanations))
			for i, s := range asset.Explanations {
				shapFeatures[i] = interventionoutcomes.ShapAttribution{
					FeatureName:  s.FeatureName,
					Contribution: s.Contribution,
				}
			}
			seeds = append(seeds, interventionoutcomes.InterventionSeed{
				ID:                     id,
				QueryID:                rankingResult.QueryID,
				FeederID:               asset.FeederID,
				PredictedPriorityScore: asset.PriorityScore,
				PredictedPriorityTier:  asset.PriorityTier,
				ShapTopFeatures:        shapFeatures,
			})
		}

		if err := w.outcomesRepo.SeedOutcomes(ctx, seeds); err != nil {
			slog.Error("failed to seed intervention outcomes for event-driven run",
				"area_id", areaID,
				"error", err,
			)
		}
	}

	return nil
}

func (w *EngineDTriggerWorker) ack(ctx context.Context, msgID string) {
	ackCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()

	if err := w.redisClient.XAck(ackCtx, StreamName, GroupName, msgID).Err(); err != nil {
		slog.Error("Failed to XAck stream message",
			"stream", StreamName,
			"group", GroupName,
			"msg_id", msgID,
			"error", err,
		)
	}
}
