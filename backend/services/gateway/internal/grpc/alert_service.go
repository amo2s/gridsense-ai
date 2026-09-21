package server

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
	"github.com/sony/gobreaker"
	"golang.org/x/sync/singleflight"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"gateway/bridge"
	"gateway/database"
	"gateway/handlers" // ASSUMED import path: Engine C repo/client interfaces, response type, sentinel errors
	interventionoutcomes "gateway/intervention_outcomes"
	"gateway/middleware"
	"gateway/models"
	pb "gridsense-ai/backend/services/dashboard-bff/proto/gen/gateway/v1/proto"
)

// AlertBridgeClient defines the communication interface for core domain logic.
type AlertBridgeClient interface {
	FetchActiveAlerts(ctx context.Context) ([]models.Alert, error)
	AcknowledgeAlert(ctx context.Context, alertID string, payload *models.AcknowledgePayload) error
	LogIntervention(ctx context.Context, payload *models.InterventionPayload) error
}

const (
	alertRPCTimeout          = 10 * time.Second // parity with REST alert handlers
	anomalyRPCTimeout        = 8 * time.Second  // parity with REST DetectAnomaly (Engine C)
	predictionRPCTimeout     = 8 * time.Second  // parity with REST ExecuteInference (Engine B)
	prioritizationRPCTimeout = 8 * time.Second  // parity with REST RankInterventions (Engine D)
	reliabilityRPCTimeout    = 8 * time.Second  // parity with REST ReliabilityHandler.Evaluate (Engine A)
)

// GatewayGRPCServer implements the pb.GatewayServiceServer interface.
// Notice the absence of OpenTelemetry/Prometheus boilerplate. In gRPC, metrics and tracing
// are handled cleanly via global Unary/Stream Interceptors mounted in main.go, keeping business logic pure.
type GatewayGRPCServer struct {
	pb.UnimplementedGatewayServiceServer
	client      AlertBridgeClient
	redisClient *redis.Client

	// Engine C (anomaly detection)
	anomalyRepo   handlers.AnomalyRepository
	engineCClient handlers.EngineCClient
	anomalyGrp    singleflight.Group

	// Engine B (failure-risk prediction)
	// NOTE: separate singleflight group from Engine C. Both key on feederID, so
	// sharing one group would let a DetectAnomaly call collide with a PredictRisk
	// call for the same feeder and return the wrong type.
	telemetryRepo handlers.TelemetryRepository
	engineBClient handlers.AIClient
	predictGrp    singleflight.Group

	// Engine D (intervention prioritization)
	// Separate singleflight group: keyed on query_id (an area ID), not a feeder ID.
	prioritizationRepo handlers.PrioritizationRepository
	engineDClient      handlers.EngineDClient
	outcomesRepo       interventionoutcomes.Repository // may be nil; seeding is skipped if so
	rankGrp            singleflight.Group

	// Engine A (deterministic reliability scoring)
	// Concrete types, matching the REST ReliabilityHandler. No singleflight: REST had none.
	db      *database.PostgresDB
	engineA *bridge.EngineAClient
}

// NewGatewayGRPCServer constructs the gRPC handler.
func NewGatewayGRPCServer(
	client AlertBridgeClient,
	redisClient *redis.Client,
	anomalyRepo handlers.AnomalyRepository,
	engineCClient handlers.EngineCClient,
	telemetryRepo handlers.TelemetryRepository,
	engineBClient handlers.AIClient,
	prioritizationRepo handlers.PrioritizationRepository,
	engineDClient handlers.EngineDClient,
	outcomesRepo interventionoutcomes.Repository,
	db *database.PostgresDB,
	engineA *bridge.EngineAClient,
) *GatewayGRPCServer {
	return &GatewayGRPCServer{
		client:             client,
		redisClient:        redisClient,
		anomalyRepo:        anomalyRepo,
		engineCClient:      engineCClient,
		telemetryRepo:      telemetryRepo,
		engineBClient:      engineBClient,
		prioritizationRepo: prioritizationRepo,
		engineDClient:      engineDClient,
		outcomesRepo:       outcomesRepo,
		db:                 db,
		engineA:            engineA,
	}
}

// toGRPCError maps domain and infrastructure errors to gRPC status codes,
// mirroring the REST handleError functions.
func toGRPCError(err error, msg string) error {
	var code codes.Code
	switch {
	// Domain errors (Engine C)
	case errors.Is(err, handlers.ErrFeederNotFound):
		code = codes.NotFound
	case errors.Is(err, handlers.ErrInsufficientData), errors.Is(err, handlers.ErrInsufficientAssets):
		code = codes.FailedPrecondition
	case errors.Is(err, handlers.ErrAIValidation):
		code = codes.Internal
	// Infrastructure errors
	case errors.Is(err, gobreaker.ErrOpenState):
		code = codes.Unavailable
	case errors.Is(err, gobreaker.ErrTooManyRequests):
		code = codes.ResourceExhausted
	case errors.Is(err, handlers.ErrAIUpstream):
		code = codes.Unavailable
	case errors.Is(err, context.DeadlineExceeded):
		code = codes.DeadlineExceeded
	case errors.Is(err, context.Canceled):
		code = codes.Canceled
	default:
		code = codes.Internal
	}
	return status.Errorf(code, "%s: %v", msg, err)
}

// callerID returns the authenticated user's ID (the JWT sub claim) that the auth
// interceptor stored in the context. Handlers use it instead of any client-supplied identity.
func callerID(ctx context.Context) (string, error) {
	id, ok := ctx.Value(middleware.UserIDKey).(string)
	if !ok || id == "" {
		return "", status.Error(codes.Unauthenticated, "authenticated user not found in context")
	}
	return id, nil
}

var errInvalidTimestamp = errors.New("invalid timestamp format (must be RFC3339 / ISO 8601)")

// parseTimestamp parses an optional RFC3339 timestamp, returning fallback when s is empty.
func parseTimestamp(s string, fallback time.Time) (time.Time, error) {
	if s == "" {
		return fallback, nil
	}
	t, err := time.Parse(time.RFC3339, s)
	if err != nil {
		return time.Time{}, errInvalidTimestamp
	}
	return t.UTC(), nil
}

// GetAnomalyTimeline directly replaces the REST FetchActive endpoint.
func (s *GatewayGRPCServer) GetAnomalyTimeline(ctx context.Context, req *pb.AnomalyTimelineRequest) (*pb.AnomalyTimelineResponse, error) {
	ctx, cancel := context.WithTimeout(ctx, alertRPCTimeout)
	defer cancel()

	alerts, err := s.client.FetchActiveAlerts(ctx)
	if err != nil {
		return nil, toGRPCError(err, "failed to fetch active alerts")
	}

	var events []*pb.AnomalyEvent
	for _, a := range alerts {
		events = append(events, &pb.AnomalyEvent{
			EventId:     a.ID,
			AreaId:      a.EntityID,
			EventType:   a.Type,
			Severity:    a.Severity,
			Description: a.Message,
			Timestamp:   a.CreatedAt.Format(time.RFC3339),
		})
	}

	return &pb.AnomalyTimelineResponse{Events: events}, nil
}

// AcknowledgeAlert handles the operator resolution workflow.
func (s *GatewayGRPCServer) AcknowledgeAlert(ctx context.Context, req *pb.AcknowledgeAlertRequest) (*pb.AcknowledgeAlertResponse, error) {
	if req.GetAlertId() == "" {
		return nil, status.Error(codes.InvalidArgument, "invalid request: alert ID is required")
	}

	// Identity comes from the authenticated token, never from the request body.
	userID, err := callerID(ctx)
	if err != nil {
		return nil, err
	}

	ctx, cancel := context.WithTimeout(ctx, alertRPCTimeout)
	defer cancel()

	payload := &models.AcknowledgePayload{
		UserID:   userID,
		Comment:  req.GetNotes(),
		Resolved: true,
	}

	if err := s.client.AcknowledgeAlert(ctx, req.GetAlertId(), payload); err != nil {
		return nil, toGRPCError(err, "failed to acknowledge alert")
	}

	return &pb.AcknowledgeAlertResponse{Success: true}, nil
}

// LogIntervention tracks manual operator actions for the Engine D RL pipeline.
func (s *GatewayGRPCServer) LogIntervention(ctx context.Context, req *pb.LogInterventionRequest) (*pb.LogInterventionResponse, error) {
	ctx, cancel := context.WithTimeout(ctx, alertRPCTimeout)
	defer cancel()

	// Identity comes from the authenticated token, never from the request body.
	operatorID, err := callerID(ctx)
	if err != nil {
		return nil, err
	}

	timestamp, err := parseTimestamp(req.GetTimestamp(), time.Now().UTC())
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, err.Error())
	}

	payload := &models.InterventionPayload{
		AlertID:     req.GetAlertId(),
		FeederID:    req.GetFeederId(),
		OperatorID:  operatorID,
		ActionTaken: req.GetActionTaken(),
		Notes:       req.GetNotes(),
		Timestamp:   timestamp,
	}

	if err := s.client.LogIntervention(ctx, payload); err != nil {
		return nil, toGRPCError(err, "failed to log intervention")
	}

	return &pb.LogInterventionResponse{Success: true}, nil
}

// DetectAnomaly runs Engine C multivariate anomaly detection for a feeder.
// Replaces the REST AnomalyHandler.DetectAnomaly endpoint.
func (s *GatewayGRPCServer) DetectAnomaly(ctx context.Context, req *pb.DetectAnomalyRequest) (*pb.DetectAnomalyResponse, error) {
	feederID := req.GetFeederId()
	if _, err := uuid.Parse(feederID); err != nil {
		return nil, status.Error(codes.InvalidArgument, handlers.ErrInvalidUUID.Error())
	}

	ctx, cancel := context.WithTimeout(ctx, anomalyRPCTimeout)
	defer cancel()

	// Singleflight deduplication to prevent slamming Engine C for concurrent UI renders
	v, err, _ := s.anomalyGrp.Do(feederID, func() (interface{}, error) {
		return s.processAnomalyRequest(ctx, feederID)
	})
	if err != nil {
		return nil, toGRPCError(err, "anomaly detection failed")
	}

	r := v.(*handlers.AnomalyResponse)

	attributions := make([]*pb.AttributionFactor, 0, len(r.RankedAttributions))
	for _, a := range r.RankedAttributions {
		attributions = append(attributions, &pb.AttributionFactor{
			Feature:   a.Feature,
			Magnitude: a.Magnitude,
			Source:    a.Source,
		})
	}

	return &pb.DetectAnomalyResponse{
		FeederId:        r.FeederID,
		Timestamp:       r.Timestamp.Format(time.RFC3339),
		IsAnomaly:       r.IsAnomaly,
		Severity:        r.Severity,
		ConfidenceScore: r.ConfidenceScore,
		LayerFlags: &pb.LayerFlags{
			Layer1Stat:  r.LayerFlags.Layer1Stat,
			Layer2Seas:  r.LayerFlags.Layer2Seas,
			Layer3Multi: r.LayerFlags.Layer3Multi,
		},
		RankedAttributions: attributions,
		Reasons:            r.Reasons,
		InferenceLatencyMs: r.InferenceLatencyMs,
		ModelVersion:       r.ModelVersion,
	}, nil
}

// processAnomalyRequest is the Engine C orchestration: telemetry fetch, inference, async persistence.
func (s *GatewayGRPCServer) processAnomalyRequest(ctx context.Context, feederID string) (*handlers.AnomalyResponse, error) {
	readings, err := s.anomalyRepo.FetchEngineCTelemetry(ctx, feederID)
	if err != nil {
		slog.Error("Engine C telemetry lookup failed", "feeder_id", feederID, "error", err)
		return nil, err
	}

	payloadBytes, err := json.Marshal(handlers.AnomalyRequest{Readings: readings})
	if err != nil {
		slog.Error("Engine C payload encode failed", "feeder_id", feederID, "error", err)
		return nil, err
	}

	result, err := s.engineCClient.Detect(ctx, payloadBytes)
	if err != nil {
		slog.Error("Engine C inference failed", "feeder_id", feederID, "error", err)
		return nil, err
	}

	// Asynchronous persistence if an anomaly is actually detected.
	if result.IsAnomaly {
		go func(p handlers.AnomalyResponse) {
			bgCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			if err := s.anomalyRepo.PersistAnomaly(bgCtx, p); err != nil {
				slog.Error("background anomaly persistence failed", "feeder_id", p.FeederID, "error", err)
			}
		}(*result)
	}

	return result, nil
}

// PredictRisk runs Engine B failure-risk prediction for a feeder.
// Replaces the REST PredictionHandler.ExecuteInference endpoint.
func (s *GatewayGRPCServer) PredictRisk(ctx context.Context, req *pb.PredictRiskRequest) (*pb.PredictRiskResponse, error) {
	feederID := req.GetFeederId()
	if _, err := uuid.Parse(feederID); err != nil {
		return nil, status.Error(codes.InvalidArgument, handlers.ErrInvalidUUID.Error())
	}

	ctx, cancel := context.WithTimeout(ctx, predictionRPCTimeout)
	defer cancel()

	// Singleflight deduplication to prevent slamming Engine B for concurrent UI renders
	v, err, _ := s.predictGrp.Do(feederID, func() (interface{}, error) {
		return s.processPredictionRequest(ctx, feederID)
	})
	if err != nil {
		return nil, toGRPCError(err, "risk prediction failed")
	}

	r := v.(*handlers.PredictionResponse)

	factors := make([]*pb.FeatureAttribution, 0, len(r.ContributingFactors))
	for _, f := range r.ContributingFactors {
		factors = append(factors, &pb.FeatureAttribution{
			FeatureName:  f.FeatureName,
			Contribution: f.Contribution,
		})
	}

	return &pb.PredictRiskResponse{
		FeederId:            r.FeederID,
		GeneratedAt:         r.GeneratedAt.Format(time.RFC3339),
		HorizonHours:        int32(r.HorizonHours),
		RiskScore:           r.RiskScore,
		RiskLevel:           r.RiskLevel,
		ModelVersion:        r.ModelVersion,
		ContributingFactors: factors,
	}, nil
}

// processPredictionRequest is the Engine B orchestration: telemetry fetch, inference, async persistence.
func (s *GatewayGRPCServer) processPredictionRequest(ctx context.Context, feederID string) (*handlers.PredictionResponse, error) {
	readings, err := s.telemetryRepo.FetchHistoricalTelemetry(ctx, feederID)
	if err != nil {
		slog.Error("telemetry lookup failed", "feeder_id", feederID, "error", err)
		return nil, err
	}

	if len(readings) < 24 {
		return nil, handlers.ErrInsufficientData
	}

	payloadBytes, err := json.Marshal(handlers.PredictionRequest{
		FeederID: feederID,
		Readings: readings,
	})
	if err != nil {
		slog.Error("payload encode failed", "feeder_id", feederID, "error", err)
		return nil, err
	}

	prediction, err := s.engineBClient.Predict(ctx, payloadBytes)
	if err != nil {
		slog.Error("ai prediction failed", "feeder_id", feederID, "error", err)
		return nil, err
	}

	// Asynchronous persistence so the client isn't blocked on the DB write,
	// and response status isn't tied to persistence success.
	go func(p handlers.PredictionResponse) {
		bgCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := s.telemetryRepo.PersistPrediction(bgCtx, p); err != nil {
			slog.Error("background prediction persistence failed", "feeder_id", p.FeederID, "error", err)
		}
	}(*prediction)

	return prediction, nil
}

// RankInterventions runs Engine D prioritization across the feeders of an area.
// Replaces the REST PrioritizationHandler.RankInterventions endpoint.
func (s *GatewayGRPCServer) RankInterventions(ctx context.Context, req *pb.RankInterventionsRequest) (*pb.RankInterventionsResponse, error) {
	queryID := req.GetQueryId() // typically maps to an area_id
	if _, err := uuid.Parse(queryID); err != nil {
		return nil, status.Error(codes.InvalidArgument, handlers.ErrInvalidQueryID.Error())
	}

	ctx, cancel := context.WithTimeout(ctx, prioritizationRPCTimeout)
	defer cancel()

	// Singleflight deduplication to prevent slamming Engine D for concurrent UI renders
	v, err, _ := s.rankGrp.Do(queryID, func() (interface{}, error) {
		return s.processRankingRequest(ctx, queryID)
	})
	if err != nil {
		return nil, toGRPCError(err, "intervention ranking failed")
	}

	r := v.(*handlers.PrioritizationResponse)

	assets := make([]*pb.RankedAsset, 0, len(r.RankedAssets))
	for _, a := range r.RankedAssets {
		explanations := make([]*pb.FeatureAttribution, 0, len(a.Explanations))
		for _, e := range a.Explanations {
			explanations = append(explanations, &pb.FeatureAttribution{
				FeatureName:  e.FeatureName,
				Contribution: e.Contribution,
			})
		}
		assets = append(assets, &pb.RankedAsset{
			FeederId:      a.FeederID,
			RankPosition:  int32(a.RankPosition),
			PriorityScore: a.PriorityScore,
			PriorityTier:  a.PriorityTier,
			Explanations:  explanations,
		})
	}

	return &pb.RankInterventionsResponse{
		QueryId:      r.QueryID,
		GeneratedAt:  r.GeneratedAt.Format(time.RFC3339),
		ModelVersion: r.ModelVersion,
		RankedAssets: assets,
	}, nil
}

// processRankingRequest is the Engine D orchestration: fused signal fetch, ranking,
// async persistence, and intervention outcome seeding.
func (s *GatewayGRPCServer) processRankingRequest(ctx context.Context, queryID string) (*handlers.PrioritizationResponse, error) {
	signals, err := s.prioritizationRepo.FetchFusedSignals(ctx, queryID)
	if err != nil {
		slog.Error("fused signals lookup failed", "query_id", queryID, "error", err)
		return nil, err
	}

	payloadBytes, err := json.Marshal(handlers.PrioritizationRequest{
		QueryID: queryID,
		Assets:  signals,
	})
	if err != nil {
		slog.Error("Engine D payload encode failed", "query_id", queryID, "error", err)
		return nil, err
	}

	rankingResult, err := s.engineDClient.Rank(ctx, payloadBytes)
	if err != nil {
		slog.Error("Engine D inference failed", "query_id", queryID, "error", err)
		return nil, err
	}

	go func(p handlers.PrioritizationResponse) {
		bgCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()

		interventionIDs, err := s.prioritizationRepo.PersistPrioritization(bgCtx, p)
		if err != nil {
			slog.Error("background priority persistence failed", "query_id", p.QueryID, "error", err)
			return
		}

		if s.outcomesRepo == nil {
			return
		}

		seeds := make([]interventionoutcomes.InterventionSeed, 0, len(p.RankedAssets))
		for _, asset := range p.RankedAssets {
			id, ok := interventionIDs[asset.FeederID]
			if !ok {
				continue
			}
			seeds = append(seeds, interventionoutcomes.InterventionSeed{
				InterventionID:         id,
				FeederID:               asset.FeederID,
				PredictedPriorityScore: asset.PriorityScore,
				PredictedPriorityTier:  asset.PriorityTier,
				ShapTopFeatures:        toOutcomeShapAttributions(asset.Explanations),
			})
		}

		if err := s.outcomesRepo.SeedOutcomes(bgCtx, seeds); err != nil {
			slog.Error("intervention outcome seeding failed", "query_id", p.QueryID, "error", err)
		}
	}(*rankingResult)

	return rankingResult, nil
}

// toOutcomeShapAttributions maps handlers.ShapAttribution to
// interventionoutcomes.ShapAttribution. This mirrors handlers.convertShapAttributions,
// which is unexported and therefore not callable from this package.
func toOutcomeShapAttributions(in []handlers.ShapAttribution) []interventionoutcomes.ShapAttribution {
	out := make([]interventionoutcomes.ShapAttribution, len(in))
	for i, s := range in {
		out[i] = interventionoutcomes.ShapAttribution{
			FeatureName:  s.FeatureName,
			Contribution: s.Contribution,
		}
	}
	return out
}

// EvaluateReliability calculates the 24-hour reliability score for a feeder via Engine A.
// Replaces the REST ReliabilityHandler.Evaluate endpoint.
func (s *GatewayGRPCServer) EvaluateReliability(ctx context.Context, req *pb.EvaluateReliabilityRequest) (*pb.EvaluateReliabilityResponse, error) {
	feederID := req.GetFeederId()
	if feederID == "" {
		return nil, status.Error(codes.InvalidArgument, "feeder_id is required")
	}

	// Default cycle timestamp to UTC now if not explicitly passed
	cycleTime, err := parseTimestamp(req.GetTimestamp(), time.Now().UTC())
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, err.Error())
	}

	// Single time budget covering both the DB fetch and the Engine A dispatch.
	ctx, cancel := context.WithTimeout(ctx, reliabilityRPCTimeout)
	defer cancel()

	// 1. Fetch grid asset data and 24-hour interruption history
	payload, err := s.db.FetchOperationalPayload(ctx, feederID, cycleTime)
	if err != nil {
		slog.Error("database fetch failed", "feeder_id", feederID, "error", err)
		// Mirrors REST: every fetch failure maps to not-found. FetchOperationalPayload
		// exposes no sentinel to distinguish a missing asset from a DB outage.
		return nil, status.Error(codes.NotFound, "asset not found or unable to fetch telemetry")
	}

	// 2. Dispatch the aggregated payload to Engine A
	result, err := s.engineA.EvaluateReliability(ctx, payload)
	if err != nil {
		slog.Error("Engine A evaluation failed", "feeder_id", feederID, "error", err)

		// Engine A errors carry no sentinels apart from the wrapped gobreaker errors,
		// so anything not matched below maps to Unavailable (REST: 502).
		code := codes.Unavailable // includes gobreaker.ErrOpenState
		switch {
		case errors.Is(err, gobreaker.ErrTooManyRequests):
			code = codes.ResourceExhausted
		case errors.Is(err, context.DeadlineExceeded):
			code = codes.DeadlineExceeded
		case errors.Is(err, context.Canceled):
			code = codes.Canceled
		}
		return nil, status.Errorf(code, "reliability evaluation failed: %v", err)
	}

	// 3. Map the deterministic output to the wire contract
	windows := make([]*pb.VulnerabilityWindow, 0, len(result.VulnerabilityWindows))
	for _, w := range result.VulnerabilityWindows {
		windows = append(windows, &pb.VulnerabilityWindow{
			StartTime:   w.StartTime.Format(time.RFC3339),
			EndTime:     w.EndTime.Format(time.RFC3339),
			SeverityTag: w.SeverityTag,
		})
	}

	return &pb.EvaluateReliabilityResponse{
		FeederId:         result.FeederID,
		ReliabilityScore: int32(result.ReliabilityScore),
		RiskBand:         result.RiskBand,
		Trajectory:       result.Trajectory,
		SubScores: &pb.SubScoreMetrics{
			BaseAvailability: result.SubScores.BaseAvailability,
			DurationPenalty:  result.SubScores.DurationPenalty,
			FrequencyPenalty: result.SubScores.FrequencyPenalty,
		},
		VulnerabilityWindows: windows,
		Audit: &pb.AuditMetadata{
			CycleTimestamp:       result.Audit.CycleTimestamp.Format(time.RFC3339),
			CalculationLatencyMs: result.Audit.CalculationLatencyMS,
			EngineVersion:        result.Audit.EngineVersion,
		},
	}, nil
}

// BroadcastAnomaly completely replaces the HTTP/SSE proxy mechanism.
// The core Gateway invokes this internally to push real-time events to Redis,
// where the BFF's multiplexer reads them and fans out to GraphQL WebSockets.
func (s *GatewayGRPCServer) BroadcastAnomaly(ctx context.Context, tenantID string, event *pb.AnomalyEvent) error {
	if tenantID == "" || event == nil {
		return errors.New("tenant ID and event payload are strictly required for broadcast")
	}

	// Match the GatewayEvent struct expected by the BFF's SubscriptionManager
	envelope := map[string]interface{}{
		"tenant_id": tenantID,
		"payload":   event,
	}

	data, err := json.Marshal(envelope)
	if err != nil {
		return status.Errorf(codes.Internal, "failed to serialize telemetry envelope: %v", err)
	}

	if err := s.redisClient.Publish(ctx, "system:operational_events", data).Err(); err != nil {
		return status.Errorf(codes.Internal, "redis publish failed: %v", err)
	}

	return nil
}