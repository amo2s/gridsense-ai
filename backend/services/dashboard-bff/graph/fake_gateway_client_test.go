package graph_test

// fakeGatewayClient implements pb.GatewayServiceClient with settable function
// fields per RPC, so each test configures only the calls it exercises. No
// network, no bufconn, no real Gateway process — this is a pure Go fake
// satisfying the generated client interface.

import (
	"context"

	"google.golang.org/grpc"

	pb "gridsense-ai/backend/services/dashboard-bff/proto/gen/gateway/v1/proto"
)

type fakeGatewayClient struct {
	getDashboardSummaryFn    func(ctx context.Context, in *pb.DashboardSummaryRequest) (*pb.DashboardSummaryResponse, error)
	getPriorityAreasFn       func(ctx context.Context, in *pb.PriorityAreasRequest) (*pb.PriorityAreasResponse, error)
	getReliabilityMetricsFn  func(ctx context.Context, in *pb.ReliabilityMetricsRequest) (*pb.ReliabilityMetricsResponse, error)
	getAreaDetailFn          func(ctx context.Context, in *pb.AreaDetailRequest) (*pb.AreaDetailResponse, error)
	getAnomalyTimelineFn     func(ctx context.Context, in *pb.AnomalyTimelineRequest) (*pb.AnomalyTimelineResponse, error)
	getRiskForecastFn        func(ctx context.Context, in *pb.RiskForecastRequest) (*pb.RiskForecastResponse, error)
	getIntelligenceInsightFn func(ctx context.Context, in *pb.IntelligenceInsightRequest) (*pb.IntelligenceInsightResponse, error)
	acknowledgeAlertFn       func(ctx context.Context, in *pb.AcknowledgeAlertRequest) (*pb.AcknowledgeAlertResponse, error)
	logInterventionFn        func(ctx context.Context, in *pb.LogInterventionRequest) (*pb.LogInterventionResponse, error)
	evaluateReliabilityFn    func(ctx context.Context, in *pb.EvaluateReliabilityRequest) (*pb.EvaluateReliabilityResponse, error)
	predictRiskFn            func(ctx context.Context, in *pb.PredictRiskRequest) (*pb.PredictRiskResponse, error)
	detectAnomalyFn          func(ctx context.Context, in *pb.DetectAnomalyRequest) (*pb.DetectAnomalyResponse, error)
	rankInterventionsFn      func(ctx context.Context, in *pb.RankInterventionsRequest) (*pb.RankInterventionsResponse, error)

	// lastX capture the request each resolver actually sent, for tests that
	// assert on outgoing arguments (e.g. that timestamp/notes were forwarded).
	lastAcknowledgeAlertReq *pb.AcknowledgeAlertRequest
	lastLogInterventionReq  *pb.LogInterventionRequest
}

func (f *fakeGatewayClient) GetDashboardSummary(ctx context.Context, in *pb.DashboardSummaryRequest, _ ...grpc.CallOption) (*pb.DashboardSummaryResponse, error) {
	return f.getDashboardSummaryFn(ctx, in)
}

func (f *fakeGatewayClient) GetPriorityAreas(ctx context.Context, in *pb.PriorityAreasRequest, _ ...grpc.CallOption) (*pb.PriorityAreasResponse, error) {
	return f.getPriorityAreasFn(ctx, in)
}

func (f *fakeGatewayClient) GetReliabilityMetrics(ctx context.Context, in *pb.ReliabilityMetricsRequest, _ ...grpc.CallOption) (*pb.ReliabilityMetricsResponse, error) {
	return f.getReliabilityMetricsFn(ctx, in)
}

func (f *fakeGatewayClient) GetAreaDetail(ctx context.Context, in *pb.AreaDetailRequest, _ ...grpc.CallOption) (*pb.AreaDetailResponse, error) {
	return f.getAreaDetailFn(ctx, in)
}

func (f *fakeGatewayClient) GetAnomalyTimeline(ctx context.Context, in *pb.AnomalyTimelineRequest, _ ...grpc.CallOption) (*pb.AnomalyTimelineResponse, error) {
	return f.getAnomalyTimelineFn(ctx, in)
}

func (f *fakeGatewayClient) GetRiskForecast(ctx context.Context, in *pb.RiskForecastRequest, _ ...grpc.CallOption) (*pb.RiskForecastResponse, error) {
	return f.getRiskForecastFn(ctx, in)
}

func (f *fakeGatewayClient) GetIntelligenceInsight(ctx context.Context, in *pb.IntelligenceInsightRequest, _ ...grpc.CallOption) (*pb.IntelligenceInsightResponse, error) {
	return f.getIntelligenceInsightFn(ctx, in)
}

func (f *fakeGatewayClient) AcknowledgeAlert(ctx context.Context, in *pb.AcknowledgeAlertRequest, _ ...grpc.CallOption) (*pb.AcknowledgeAlertResponse, error) {
	f.lastAcknowledgeAlertReq = in
	return f.acknowledgeAlertFn(ctx, in)
}

func (f *fakeGatewayClient) LogIntervention(ctx context.Context, in *pb.LogInterventionRequest, _ ...grpc.CallOption) (*pb.LogInterventionResponse, error) {
	f.lastLogInterventionReq = in
	return f.logInterventionFn(ctx, in)
}

func (f *fakeGatewayClient) EvaluateReliability(ctx context.Context, in *pb.EvaluateReliabilityRequest, _ ...grpc.CallOption) (*pb.EvaluateReliabilityResponse, error) {
	return f.evaluateReliabilityFn(ctx, in)
}

func (f *fakeGatewayClient) PredictRisk(ctx context.Context, in *pb.PredictRiskRequest, _ ...grpc.CallOption) (*pb.PredictRiskResponse, error) {
	return f.predictRiskFn(ctx, in)
}

func (f *fakeGatewayClient) DetectAnomaly(ctx context.Context, in *pb.DetectAnomalyRequest, _ ...grpc.CallOption) (*pb.DetectAnomalyResponse, error) {
	return f.detectAnomalyFn(ctx, in)
}

func (f *fakeGatewayClient) RankInterventions(ctx context.Context, in *pb.RankInterventionsRequest, _ ...grpc.CallOption) (*pb.RankInterventionsResponse, error) {
	return f.rankInterventionsFn(ctx, in)
}

// StreamOperationalEvents is unused by the BFF today: the subscription
// resolver reads from Redis (internal/realtime), not this RPC. Implemented
// only to satisfy pb.GatewayServiceClient.
func (f *fakeGatewayClient) StreamOperationalEvents(ctx context.Context, in *pb.StreamEventsRequest, _ ...grpc.CallOption) (pb.GatewayService_StreamOperationalEventsClient, error) {
	panic("StreamOperationalEvents: not exercised by BFF resolver tests")
}