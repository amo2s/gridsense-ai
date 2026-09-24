package graph_test

// Layer 1 test: every GraphQL resolver, called directly through the generated
// interfaces (resolver.Query(), resolver.Mutation()), with the Gateway RPC
// layer replaced by fakeGatewayClient (fake_gateway_client_test.go) and, for
// the 4 cache-aside resolvers, a real in-memory Redis via miniredis instead
// of a live Redis server. No network, no bufconn, no real Gateway process.
//
// This is the BFF-side counterpart to the Gateway's alert_service_test.go:
// it exists to catch field-mapping mismatches between pb.* responses and
// graph/model.* structs, the exact class of bug that broke InterventionSeed
// and AnomalyEvent earlier in this project.

import (
	"context"
	"testing"

	"github.com/alicebob/miniredis/v2"

	"gridsense-ai/backend/services/dashboard-bff/graph"
	"gridsense-ai/backend/services/dashboard-bff/graph/model"
	"gridsense-ai/backend/services/dashboard-bff/internal/cache"
	"gridsense-ai/backend/services/dashboard-bff/internal/grpcclient"
	pb "gridsense-ai/backend/services/dashboard-bff/proto/gen/gateway/v1/proto"
)

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

// newTestResolver builds a graph.Resolver backed by fake, with a real
// miniredis-backed cache. Subscriptions is left nil: no test here calls the
// subscription resolver.
func newTestResolver(t *testing.T, fake *fakeGatewayClient) *graph.Resolver {
	t.Helper()

	mr := miniredis.RunT(t) // in-memory Redis; RunT wires t.Cleanup for teardown

	redisClient, err := cache.NewRedisClient(context.Background(), "redis://"+mr.Addr())
	if err != nil {
		t.Fatalf("failed to build test cache client: %v", err)
	}
	t.Cleanup(func() { redisClient.Close() })

	return &graph.Resolver{
		GatewayClient: &grpcclient.GatewayClient{Client: fake},
		Cache:         redisClient,
	}
}

// ---------------------------------------------------------------------------
// Cache-aside resolvers: DashboardSummary, PriorityAreas, ReliabilityTrend, AreaDetail
// ---------------------------------------------------------------------------

func TestDashboardSummary_MapsFieldsAndCaches(t *testing.T) {
	calls := 0
	fake := &fakeGatewayClient{
		getDashboardSummaryFn: func(ctx context.Context, in *pb.DashboardSummaryRequest) (*pb.DashboardSummaryResponse, error) {
			calls++
			if in.TimeRange != "24h" {
				t.Fatalf("expected TimeRange=24h, got %q", in.TimeRange)
			}
			return &pb.DashboardSummaryResponse{
				OverallReliabilityScore: 97.5,
				ActiveHighRiskAreas:     3,
				TotalActiveAlerts:       12,
			}, nil
		},
	}
	r := newTestResolver(t, fake)

	want := &model.DashboardSummary{OverallReliabilityScore: 97.5, ActiveHighRiskAreas: 3, TotalActiveAlerts: 12}

	got, err := r.Query().DashboardSummary(context.Background(), "24h")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if *got != *want {
		t.Fatalf("field mapping mismatch: got %+v, want %+v", got, want)
	}

	// Second call for the same key must be served from cache, not the Gateway.
	got2, err := r.Query().DashboardSummary(context.Background(), "24h")
	if err != nil {
		t.Fatalf("unexpected error on cached call: %v", err)
	}
	if *got2 != *want {
		t.Fatalf("cached value mismatch: got %+v, want %+v", got2, want)
	}
	if calls != 1 {
		t.Fatalf("expected exactly 1 Gateway call (second should hit cache), got %d", calls)
	}
}

func TestPriorityAreas_MapsFieldsAndCaches(t *testing.T) {
	calls := 0
	fake := &fakeGatewayClient{
		getPriorityAreasFn: func(ctx context.Context, in *pb.PriorityAreasRequest) (*pb.PriorityAreasResponse, error) {
			calls++
			return &pb.PriorityAreasResponse{Areas: []*pb.PriorityArea{
				{Id: "area-1", Name: "Downtown", UrgencyRank: 1, RiskScore: 0.91, Status: "critical"},
			}}, nil
		},
	}
	r := newTestResolver(t, fake)

	got, err := r.Query().PriorityAreas(context.Background())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(got) != 1 {
		t.Fatalf("expected 1 area, got %d", len(got))
	}
	want := &model.PriorityArea{ID: "area-1", Name: "Downtown", UrgencyRank: 1, RiskScore: 0.91, Status: "critical"}
	if *got[0] != *want {
		t.Fatalf("field mapping mismatch: got %+v, want %+v", got[0], want)
	}

	if _, err := r.Query().PriorityAreas(context.Background()); err != nil {
		t.Fatalf("unexpected error on cached call: %v", err)
	}
	if calls != 1 {
		t.Fatalf("expected exactly 1 Gateway call, got %d", calls)
	}
}

func TestReliabilityTrend_DefaultsToGlobalArea(t *testing.T) {
	fake := &fakeGatewayClient{
		getReliabilityMetricsFn: func(ctx context.Context, in *pb.ReliabilityMetricsRequest) (*pb.ReliabilityMetricsResponse, error) {
			if in.AreaId != "global" {
				t.Fatalf("expected AreaId=global, got %q", in.AreaId)
			}
			return &pb.ReliabilityMetricsResponse{Trend: []*pb.TrendDataPoint{
				{Timestamp: "2026-01-01T00:00:00Z", Value: 98.2},
			}}, nil
		},
	}
	r := newTestResolver(t, fake)

	got, err := r.Query().ReliabilityTrend(context.Background(), "7d")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(got) != 1 || got[0].Timestamp != "2026-01-01T00:00:00Z" || got[0].Value != 98.2 {
		t.Fatalf("field mapping mismatch: %+v", got)
	}
}

func TestAreaDetail_MapsFieldsAndCaches(t *testing.T) {
	calls := 0
	fake := &fakeGatewayClient{
		getAreaDetailFn: func(ctx context.Context, in *pb.AreaDetailRequest) (*pb.AreaDetailResponse, error) {
			calls++
			if in.Id != "area-7" {
				t.Fatalf("expected Id=area-7, got %q", in.Id)
			}
			return &pb.AreaDetailResponse{Id: "area-7", Name: "Riverside", CurrentRiskScore: 0.42, Status: "stable"}, nil
		},
	}
	r := newTestResolver(t, fake)

	want := &model.AreaDetail{ID: "area-7", Name: "Riverside", CurrentRiskScore: 0.42, Status: "stable"}

	got, err := r.Query().AreaDetail(context.Background(), "area-7")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if *got != *want {
		t.Fatalf("field mapping mismatch: got %+v, want %+v", got, want)
	}

	if _, err := r.Query().AreaDetail(context.Background(), "area-7"); err != nil {
		t.Fatalf("unexpected error on cached call: %v", err)
	}
	if calls != 1 {
		t.Fatalf("expected exactly 1 Gateway call, got %d", calls)
	}
}

// ---------------------------------------------------------------------------
// Uncached passthrough resolvers
// ---------------------------------------------------------------------------

func TestAnomalyTimeline_MapsFields(t *testing.T) {
	fake := &fakeGatewayClient{
		getAnomalyTimelineFn: func(ctx context.Context, in *pb.AnomalyTimelineRequest) (*pb.AnomalyTimelineResponse, error) {
			return &pb.AnomalyTimelineResponse{Events: []*pb.AnomalyEvent{{
				EventId: "e1", AreaId: "area-1", EventType: "voltage_sag",
				Severity: "high", Timestamp: "2026-01-01T00:00:00Z", Description: "sag detected",
			}}}, nil
		},
	}
	r := newTestResolver(t, fake)

	got, err := r.Query().AnomalyTimeline(context.Background(), "area-1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	want := &model.AnomalyEvent{
		ID: "e1", AreaID: "area-1", EventType: "voltage_sag",
		Severity: "high", Timestamp: "2026-01-01T00:00:00Z", Description: "sag detected",
	}
	if len(got) != 1 || *got[0] != *want {
		t.Fatalf("field mapping mismatch: got %+v, want %+v", got, want)
	}
}

func TestRiskForecast_MapsFields(t *testing.T) {
	fake := &fakeGatewayClient{
		getRiskForecastFn: func(ctx context.Context, in *pb.RiskForecastRequest) (*pb.RiskForecastResponse, error) {
			return &pb.RiskForecastResponse{Points: []*pb.RiskForecastPoint{
				{Timestamp: "2026-01-02T00:00:00Z", PredictedRiskScore: 0.63, IsHistorical: false},
			}}, nil
		},
	}
	r := newTestResolver(t, fake)

	got, err := r.Query().RiskForecast(context.Background(), "area-1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(got) != 1 || got[0].PredictedRiskScore != 0.63 || got[0].IsHistorical {
		t.Fatalf("field mapping mismatch: %+v", got)
	}
}

func TestIntelligenceInsight_MapsFields(t *testing.T) {
	fake := &fakeGatewayClient{
		getIntelligenceInsightFn: func(ctx context.Context, in *pb.IntelligenceInsightRequest) (*pb.IntelligenceInsightResponse, error) {
			return &pb.IntelligenceInsightResponse{
				AnomalyId: "anom-1", ConfidenceScore: 0.88, Reasons: []string{"spike", "trend break"},
				FeatureDeviations: []*pb.FeatureDeviation{
					{FeatureName: "voltage", ShapAttribution: 0.4, DeviationDescription: "2.1 sigma above baseline"},
				},
			}, nil
		},
	}
	r := newTestResolver(t, fake)

	got, err := r.Query().IntelligenceInsight(context.Background(), "anom-1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got.AnomalyID != "anom-1" || got.ConfidenceScore != 0.88 || len(got.Reasons) != 2 {
		t.Fatalf("field mapping mismatch: %+v", got)
	}
	if len(got.FeatureDeviations) != 1 || got.FeatureDeviations[0].FeatureName != "voltage" {
		t.Fatalf("feature deviation mapping mismatch: %+v", got.FeatureDeviations)
	}
}

// ---------------------------------------------------------------------------
// Engine A-D resolvers: full nested-field mapping
// ---------------------------------------------------------------------------

func TestEvaluateReliability_MapsNestedFields(t *testing.T) {
	fake := &fakeGatewayClient{
		evaluateReliabilityFn: func(ctx context.Context, in *pb.EvaluateReliabilityRequest) (*pb.EvaluateReliabilityResponse, error) {
			if in.FeederId != "f1" {
				t.Fatalf("expected FeederId=f1, got %q", in.FeederId)
			}
			return &pb.EvaluateReliabilityResponse{
				FeederId: "f1", ReliabilityScore: 82, RiskBand: "medium", Trajectory: "improving",
				SubScores: &pb.SubScoreMetrics{BaseAvailability: 0.99, DurationPenalty: 0.05, FrequencyPenalty: 0.02},
				VulnerabilityWindows: []*pb.VulnerabilityWindow{
					{StartTime: "2026-01-01T00:00:00Z", EndTime: "2026-01-01T02:00:00Z", SeverityTag: "moderate"},
				},
				Audit: &pb.AuditMetadata{CycleTimestamp: "2026-01-01T00:00:00Z", CalculationLatencyMs: 12.5, EngineVersion: "a-1.4"},
			}, nil
		},
	}
	r := newTestResolver(t, fake)

	got, err := r.Query().EvaluateReliability(context.Background(), "f1", nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got.ReliabilityScore != 82 || got.RiskBand != "medium" {
		t.Fatalf("top-level field mismatch: %+v", got)
	}
	if got.SubScores.BaseAvailability != 0.99 || got.SubScores.DurationPenalty != 0.05 {
		t.Fatalf("SubScores mismatch: %+v", got.SubScores)
	}
	if len(got.VulnerabilityWindows) != 1 || got.VulnerabilityWindows[0].SeverityTag != "moderate" {
		t.Fatalf("VulnerabilityWindows mismatch: %+v", got.VulnerabilityWindows)
	}
	if got.Audit.EngineVersion != "a-1.4" || got.Audit.CalculationLatencyMs != 12.5 {
		t.Fatalf("Audit mismatch: %+v", got.Audit)
	}
}

func TestEvaluateReliability_OptionalTimestampForwarded(t *testing.T) {
	var captured string
	fake := &fakeGatewayClient{
		evaluateReliabilityFn: func(ctx context.Context, in *pb.EvaluateReliabilityRequest) (*pb.EvaluateReliabilityResponse, error) {
			captured = in.Timestamp
			return &pb.EvaluateReliabilityResponse{
				SubScores: &pb.SubScoreMetrics{}, Audit: &pb.AuditMetadata{},
			}, nil
		},
	}
	r := newTestResolver(t, fake)

	ts := "2026-01-01T00:00:00Z"
	if _, err := r.Query().EvaluateReliability(context.Background(), "f1", &ts); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if captured != ts {
		t.Fatalf("expected timestamp %q forwarded to request, got %q", ts, captured)
	}
}

func TestPredictRisk_MapsContributingFactors(t *testing.T) {
	fake := &fakeGatewayClient{
		predictRiskFn: func(ctx context.Context, in *pb.PredictRiskRequest) (*pb.PredictRiskResponse, error) {
			return &pb.PredictRiskResponse{
				FeederId: "f1", GeneratedAt: "2026-01-01T00:00:00Z", HorizonHours: 24,
				RiskScore: 0.71, RiskLevel: "high", ModelVersion: "b-2.0",
				ContributingFactors: []*pb.FeatureAttribution{{FeatureName: "load", Contribution: 0.33}},
			}, nil
		},
	}
	r := newTestResolver(t, fake)

	got, err := r.Query().PredictRisk(context.Background(), "f1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got.HorizonHours != 24 || got.RiskLevel != "high" {
		t.Fatalf("top-level field mismatch: %+v", got)
	}
	if len(got.ContributingFactors) != 1 || got.ContributingFactors[0].FeatureName != "load" || got.ContributingFactors[0].Contribution != 0.33 {
		t.Fatalf("ContributingFactors mismatch: %+v", got.ContributingFactors)
	}
}

func TestDetectAnomaly_MapsLayerFlagsAndAttributions(t *testing.T) {
	fake := &fakeGatewayClient{
		detectAnomalyFn: func(ctx context.Context, in *pb.DetectAnomalyRequest) (*pb.DetectAnomalyResponse, error) {
			return &pb.DetectAnomalyResponse{
				FeederId: "f1", Timestamp: "2026-01-01T00:00:00Z", IsAnomaly: true, Severity: "high",
				ConfidenceScore: 0.95,
				LayerFlags:      &pb.LayerFlags{Layer1Stat: true, Layer2Seas: false, Layer3Multi: true},
				RankedAttributions: []*pb.AttributionFactor{
					{Feature: "voltage", Magnitude: 3.2, Source: "layer1"},
				},
				Reasons: []string{"statistical outlier"}, InferenceLatencyMs: 42.1, ModelVersion: "c-3.1",
			}, nil
		},
	}
	r := newTestResolver(t, fake)

	got, err := r.Query().DetectAnomaly(context.Background(), "f1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !got.IsAnomaly || got.ConfidenceScore != 0.95 {
		t.Fatalf("top-level field mismatch: %+v", got)
	}
	if !got.LayerFlags.Layer1Stat || got.LayerFlags.Layer2Seas || !got.LayerFlags.Layer3Multi {
		t.Fatalf("LayerFlags mismatch: %+v", got.LayerFlags)
	}
	if len(got.RankedAttributions) != 1 || got.RankedAttributions[0].Magnitude != 3.2 {
		t.Fatalf("RankedAttributions mismatch: %+v", got.RankedAttributions)
	}
}

func TestRankInterventions_MapsRankedAssetsAndExplanations(t *testing.T) {
	fake := &fakeGatewayClient{
		rankInterventionsFn: func(ctx context.Context, in *pb.RankInterventionsRequest) (*pb.RankInterventionsResponse, error) {
			return &pb.RankInterventionsResponse{
				QueryId: "q1", GeneratedAt: "2026-01-01T00:00:00Z", ModelVersion: "d-1.0",
				RankedAssets: []*pb.RankedAsset{{
					FeederId: "f1", RankPosition: 1, PriorityScore: 0.87, PriorityTier: "critical",
					Explanations: []*pb.FeatureAttribution{{FeatureName: "risk_score", Contribution: 0.5}},
				}},
			}, nil
		},
	}
	r := newTestResolver(t, fake)

	got, err := r.Query().RankInterventions(context.Background(), "q1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(got.RankedAssets) != 1 {
		t.Fatalf("expected 1 ranked asset, got %d", len(got.RankedAssets))
	}
	asset := got.RankedAssets[0]
	if asset.FeederID != "f1" || asset.RankPosition != 1 || asset.PriorityTier != "critical" {
		t.Fatalf("RankedAsset mismatch: %+v", asset)
	}
	if len(asset.Explanations) != 1 || asset.Explanations[0].FeatureName != "risk_score" {
		t.Fatalf("Explanations mismatch: %+v", asset.Explanations)
	}
}

// ---------------------------------------------------------------------------
// Mutations: confirm request construction, notably that no client-supplied
// identity field is sent (resolvedBy/operatorId were removed from the schema
// as part of the JWT-derived-identity fix on the Gateway).
// ---------------------------------------------------------------------------

func TestAcknowledgeAlert_ForwardsNotesNoIdentityField(t *testing.T) {
	fake := &fakeGatewayClient{
		acknowledgeAlertFn: func(ctx context.Context, in *pb.AcknowledgeAlertRequest) (*pb.AcknowledgeAlertResponse, error) {
			return &pb.AcknowledgeAlertResponse{Success: true}, nil
		},
	}
	r := newTestResolver(t, fake)

	notes := "handled by on-call"
	got, err := r.Mutation().AcknowledgeAlert(context.Background(), "alert-1", &notes)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !got.Success {
		t.Fatalf("expected Success=true, got %+v", got)
	}
	if fake.lastAcknowledgeAlertReq.AlertId != "alert-1" || fake.lastAcknowledgeAlertReq.Notes != notes {
		t.Fatalf("request mismatch: %+v", fake.lastAcknowledgeAlertReq)
	}
}

func TestAcknowledgeAlert_NilNotes_SendsEmptyString(t *testing.T) {
	fake := &fakeGatewayClient{
		acknowledgeAlertFn: func(ctx context.Context, in *pb.AcknowledgeAlertRequest) (*pb.AcknowledgeAlertResponse, error) {
			return &pb.AcknowledgeAlertResponse{Success: true}, nil
		},
	}
	r := newTestResolver(t, fake)

	if _, err := r.Mutation().AcknowledgeAlert(context.Background(), "alert-1", nil); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if fake.lastAcknowledgeAlertReq.Notes != "" {
		t.Fatalf("expected empty Notes for nil input, got %q", fake.lastAcknowledgeAlertReq.Notes)
	}
}

func TestLogIntervention_ForwardsAllFields(t *testing.T) {
	fake := &fakeGatewayClient{
		logInterventionFn: func(ctx context.Context, in *pb.LogInterventionRequest) (*pb.LogInterventionResponse, error) {
			return &pb.LogInterventionResponse{Success: true}, nil
		},
	}
	r := newTestResolver(t, fake)

	notes := "dispatched crew"
	got, err := r.Mutation().LogIntervention(context.Background(), "alert-1", "feeder-1", "dispatched", &notes)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !got.Success {
		t.Fatalf("expected Success=true, got %+v", got)
	}
	req := fake.lastLogInterventionReq
	if req.AlertId != "alert-1" || req.FeederId != "feeder-1" || req.ActionTaken != "dispatched" || req.Notes != notes {
		t.Fatalf("request mismatch: %+v", req)
	}
	// The resolver leaves Timestamp empty; the Gateway defaults it to now(UTC).
	if req.Timestamp != "" {
		t.Fatalf("expected empty Timestamp (Gateway-side default), got %q", req.Timestamp)
	}
}