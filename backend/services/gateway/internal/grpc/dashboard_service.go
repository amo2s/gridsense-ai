package server

import (
	"context"
	"time"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	pb "gridsense-ai/backend/services/dashboard-bff/proto/gen/gateway/v1/proto"
)

// GetDashboardSummary aggregates high-level system metrics.
// It fuses database state (reliability, high-risk areas) with live alert counts from the Alert microservice.
func (s *GatewayGRPCServer) GetDashboardSummary(ctx context.Context, req *pb.DashboardSummaryRequest) (*pb.DashboardSummaryResponse, error) {
	// 1. Fetch grid asset aggregates from our new Dashboard Repository
	summary, err := s.dashboardRepo.GetDashboardSummary(ctx, req.GetTimeRange())
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to fetch dashboard summary: %v", err)
	}

	// 2. Fetch live active alerts from the internal Alert microservice via the existing client
	activeAlerts, err := s.client.FetchActiveAlerts(ctx)
	if err != nil {
		// Log the error but don't fail the entire dashboard load if just the alert service hiccups
		// In a production environment, you might log.Printf or use your slog instance here
		activeAlerts = nil
	}

	return &pb.DashboardSummaryResponse{
		OverallReliabilityScore: summary.OverallReliabilityScore,
		ActiveHighRiskAreas:     summary.ActiveHighRiskAreas,
		TotalActiveAlerts:       int32(len(activeAlerts)),
	}, nil
}

// GetReliabilityMetrics fetches the current risk score and historical trend for a specific area.
func (s *GatewayGRPCServer) GetReliabilityMetrics(ctx context.Context, req *pb.ReliabilityMetricsRequest) (*pb.ReliabilityMetricsResponse, error) {
	if req.GetAreaId() == "" {
		return nil, status.Error(codes.InvalidArgument, "area_id is required")
	}

	metrics, err := s.dashboardRepo.GetReliabilityMetrics(ctx, req.GetAreaId(), req.GetTimeRange())
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to fetch reliability metrics: %v", err)
	}

	// Map domain trend points to protobuf message
	var pbTrend []*pb.TrendDataPoint
	for _, pt := range metrics.Trend {
		pbTrend = append(pbTrend, &pb.TrendDataPoint{
			Timestamp: pt.Timestamp.Format(time.RFC3339),
			Value:     pt.Value,
		})
	}

	return &pb.ReliabilityMetricsResponse{
		AreaId:           metrics.AreaID,
		CurrentRiskScore: metrics.CurrentRiskScore,
		Trend:            pbTrend,
	}, nil
}

// StreamOperationalEvents is explicitly stubbed to return Unimplemented.
// As discussed, real-time events are now piped via Redis pub/sub from the SSE consumer
// directly to the BFF's SubscriptionManager. This gRPC stream is structurally obsolete.
func (s *GatewayGRPCServer) StreamOperationalEvents(req *pb.StreamEventsRequest, stream pb.GatewayService_StreamOperationalEventsServer) error {
	return status.Error(codes.Unimplemented, "StreamOperationalEvents is deprecated: use Redis operational_events pub/sub mechanism instead")
}

// GetPriorityAreas fetches the highest-risk grid assets prioritized by Engine D.
func (s *GatewayGRPCServer) GetPriorityAreas(ctx context.Context, req *pb.PriorityAreasRequest) (*pb.PriorityAreasResponse, error) {
	areas, err := s.dashboardRepo.GetPriorityAreas(ctx)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to fetch priority areas: %v", err)
	}

	var pbAreas []*pb.PriorityArea
	for _, a := range areas {
		pbAreas = append(pbAreas, &pb.PriorityArea{
			Id:          a.ID,
			Name:        a.Name,
			UrgencyRank: a.UrgencyRank,
			RiskScore:   a.RiskScore,
			Status:      a.Status,
		})
	}

	return &pb.PriorityAreasResponse{
		Areas: pbAreas,
	}, nil
}

// GetAreaDetail retrieves detailed metadata for a specific grid asset.
func (s *GatewayGRPCServer) GetAreaDetail(ctx context.Context, req *pb.AreaDetailRequest) (*pb.AreaDetailResponse, error) {
	if req.GetId() == "" {
		return nil, status.Error(codes.InvalidArgument, "id is required")
	}

	detail, err := s.dashboardRepo.GetAreaDetail(ctx, req.GetId())
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to fetch area detail: %v", err)
	}

	return &pb.AreaDetailResponse{
		Id:               detail.ID,
		Name:             detail.Name,
		CurrentRiskScore: detail.CurrentRiskScore,
		Status:           detail.Status,
	}, nil
}

// GetRiskForecast fetches AI Engine B's predicted risk trajectory for a specific area.
func (s *GatewayGRPCServer) GetRiskForecast(ctx context.Context, req *pb.RiskForecastRequest) (*pb.RiskForecastResponse, error) {
	if req.GetAreaId() == "" {
		return nil, status.Error(codes.InvalidArgument, "area_id is required")
	}

	points, err := s.dashboardRepo.GetRiskForecast(ctx, req.GetAreaId())
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to fetch risk forecast: %v", err)
	}

	var pbPoints []*pb.RiskForecastPoint
	for _, pt := range points {
		pbPoints = append(pbPoints, &pb.RiskForecastPoint{
			Timestamp:          pt.Timestamp.Format(time.RFC3339),
			PredictedRiskScore: pt.PredictedRiskScore,
			IsHistorical:       pt.IsHistorical,
		})
	}

	return &pb.RiskForecastResponse{
		Points: pbPoints,
	}, nil
}

// GetIntelligenceInsight fetches SHAP attribution values and anomaly metadata from Engine C.
func (s *GatewayGRPCServer) GetIntelligenceInsight(ctx context.Context, req *pb.IntelligenceInsightRequest) (*pb.IntelligenceInsightResponse, error) {
	if req.GetAnomalyId() == "" {
		return nil, status.Error(codes.InvalidArgument, "anomaly_id is required")
	}

	insight, err := s.dashboardRepo.GetIntelligenceInsight(ctx, req.GetAnomalyId())
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to fetch intelligence insight: %v", err)
	}

	var pbDeviations []*pb.FeatureDeviation
	for _, f := range insight.FeatureDeviations {
		pbDeviations = append(pbDeviations, &pb.FeatureDeviation{
			FeatureName:          f.FeatureName,
			ShapAttribution:      f.ShapAttribution,
			DeviationDescription: f.DeviationDescription,
		})
	}

	return &pb.IntelligenceInsightResponse{
		AnomalyId:         insight.AnomalyID,
		ConfidenceScore:   insight.ConfidenceScore,
		Reasons:           insight.Reasons,
		FeatureDeviations: pbDeviations,
	}, nil
}
