package handlers

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"gateway/database" // Adjust import path if needed based on your module setup
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// ============================================================================
// DOMAIN MODELS
// We define these here so the repository layer remains independent of the
// generated gRPC protobuf structs, avoiding tight coupling and circular imports.
// ============================================================================

type DashboardSummary struct {
	OverallReliabilityScore float64
	ActiveHighRiskAreas     int32
}

type TrendDataPoint struct {
	Timestamp time.Time
	Value     float64
}

type ReliabilityMetrics struct {
	AreaID           string
	CurrentRiskScore float64
	Trend            []TrendDataPoint
}

type PriorityArea struct {
	ID          string
	Name        string
	UrgencyRank int32
	RiskScore   float64
	Status      string
}

type AreaDetail struct {
	ID               string
	Name             string
	CurrentRiskScore float64
	Status           string
}

type RiskForecastPoint struct {
	Timestamp          time.Time
	PredictedRiskScore float64
	IsHistorical       bool
}

type FeatureDeviation struct {
	FeatureName          string
	ShapAttribution      float64
	DeviationDescription string
}

type IntelligenceInsight struct {
	AnomalyID         string
	ConfidenceScore   float64
	Reasons           []string
	FeatureDeviations []FeatureDeviation
}

// ============================================================================
// REPOSITORY INTERFACE
// ============================================================================

// DashboardRepository exposes read-only aggregate queries to serve the BFF.
type DashboardRepository interface {
	GetDashboardSummary(ctx context.Context, timeRange string) (DashboardSummary, error)
	GetReliabilityMetrics(ctx context.Context, areaID string, timeRange string) (ReliabilityMetrics, error)
	GetPriorityAreas(ctx context.Context) ([]PriorityArea, error)
	GetAreaDetail(ctx context.Context, areaID string) (AreaDetail, error)
	GetRiskForecast(ctx context.Context, areaID string) ([]RiskForecastPoint, error)
	GetIntelligenceInsight(ctx context.Context, anomalyID string) (IntelligenceInsight, error)
	GetReliabilityTrend(ctx context.Context, timeRange string) ([]TrendDataPoint, error)
}

// ============================================================================
// CONCRETE SQL IMPLEMENTATION
// ============================================================================

type SQLDashboardRepo struct {
	db *database.PostgresDB
}

// NewSQLDashboardRepo constructs the dashboard repository.
func NewSQLDashboardRepo(db *database.PostgresDB) *SQLDashboardRepo {
	return &SQLDashboardRepo{db: db}
}

// GetDashboardSummary aggregates system-wide reliability and counts high-risk areas.
func (r *SQLDashboardRepo) GetDashboardSummary(ctx context.Context, timeRange string) (DashboardSummary, error) {
	// Note: TotalActiveAlerts is omitted here because it should be fetched dynamically
	// from the AlertService via the AlertBridgeClient in the gRPC service layer.
	var summary DashboardSummary

	// Example query: Assumes a 'grid_assets' table with risk scoring and status.
	query := `
		SELECT 
			COALESCE(AVG(risk_score), 100.0) as overall_reliability,
			COUNT(*) FILTER (WHERE status = 'HIGH_RISK') as high_risk_count
		FROM grid_assets
		WHERE active = true;
	`
	err := r.db.Pool.QueryRow(ctx, query).Scan(
		&summary.OverallReliabilityScore,
		&summary.ActiveHighRiskAreas,
	)
	if err != nil && err != sql.ErrNoRows {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "42P01" {
			return DashboardSummary{
				OverallReliabilityScore: 100,
				ActiveHighRiskAreas:     0,
			}, nil
		}
		return summary, fmt.Errorf("failed to query dashboard summary: %w", err)
	}

	return summary, nil
}

// GetReliabilityMetrics fetches the current risk score and historical trend for a specific area.
func (r *SQLDashboardRepo) GetReliabilityMetrics(ctx context.Context, areaID string, timeRange string) (ReliabilityMetrics, error) {
	metrics := ReliabilityMetrics{AreaID: areaID, Trend: []TrendDataPoint{}}

	// 1. Fetch the current risk score
	scoreQuery := `SELECT COALESCE(risk_score, 100.0) FROM grid_assets WHERE id = $1`
	err := r.db.Pool.QueryRow(ctx, scoreQuery, areaID).Scan(&metrics.CurrentRiskScore)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) || errors.Is(err, pgx.ErrNoRows) {
			// Graceful defaults: safe baseline score and empty slice for trend
			metrics.CurrentRiskScore = 0
			metrics.Trend = []TrendDataPoint{}
			return metrics, nil
		}
		return metrics, fmt.Errorf("failed to query current risk score: %w", err)
	}

	// 2. Fetch the trend data (Assumes a 'telemetry_history' or 'risk_history' table)
	trendQuery := `
		SELECT recorded_at, risk_value 
		FROM risk_history 
		WHERE area_id = $1 
		ORDER BY recorded_at DESC 
		LIMIT 24; -- Adjust based on timeRange parameter
	`
	rows, err := r.db.Pool.Query(ctx, trendQuery, areaID)
	if err != nil {
		return metrics, fmt.Errorf("failed to query risk trend: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var pt TrendDataPoint
		if err := rows.Scan(&pt.Timestamp, &pt.Value); err != nil {
			return metrics, fmt.Errorf("trend row scan failed: %w", err)
		}
		metrics.Trend = append(metrics.Trend, pt)
	}

	return metrics, rows.Err()
}

// GetReliabilityTrend fetches the system-wide aggregated historical risk trend.
func (r *SQLDashboardRepo) GetReliabilityTrend(ctx context.Context, timeRange string) ([]TrendDataPoint, error) {
	var trend []TrendDataPoint

	// Assume overall system risk is averaged across all areas over time
	trendQuery := `
		SELECT recorded_at, COALESCE(AVG(risk_value), 100.0)
		FROM risk_history 
		GROUP BY recorded_at
		ORDER BY recorded_at DESC 
		LIMIT 24;
	`
	rows, err := r.db.Pool.Query(ctx, trendQuery)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "42P01" {
			// If table doesn't exist, return empty
			return []TrendDataPoint{}, nil
		}
		return nil, fmt.Errorf("failed to query overall risk trend: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var pt TrendDataPoint
		if err := rows.Scan(&pt.Timestamp, &pt.Value); err != nil {
			return nil, fmt.Errorf("trend row scan failed: %w", err)
		}
		// prepend or append? It's ORDER BY DESC, but usually graphs expect ASC.
		// To match what might have been used, we just append and rely on UI to sort.
		trend = append(trend, pt)
	}

	// Reverse to ASC for the chart if needed, or let frontend handle. The query is DESC to get the latest 24, so we reverse it here.
	for i, j := 0, len(trend)-1; i < j; i, j = i+1, j-1 {
		trend[i], trend[j] = trend[j], trend[i]
	}

	return trend, rows.Err()
}

// GetPriorityAreas fetches areas ranked by engine D's prioritization pipeline.
func (r *SQLDashboardRepo) GetPriorityAreas(ctx context.Context) ([]PriorityArea, error) {
	var areas []PriorityArea

	query := `
		SELECT id, name, urgency_rank, risk_score, status
		FROM grid_assets
		WHERE urgency_rank IS NOT NULL
		ORDER BY urgency_rank ASC
		LIMIT 10;
	`
	rows, err := r.db.Pool.Query(ctx, query)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "42P01" {
			return []PriorityArea{}, nil
		}
		return nil, fmt.Errorf("failed to query priority areas: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var a PriorityArea
		if err := rows.Scan(&a.ID, &a.Name, &a.UrgencyRank, &a.RiskScore, &a.Status); err != nil {
			return nil, fmt.Errorf("priority area scan failed: %w", err)
		}
		areas = append(areas, a)
	}

	return areas, rows.Err()
}

// GetAreaDetail fetches metadata and exact status for a single grid area.
func (r *SQLDashboardRepo) GetAreaDetail(ctx context.Context, areaID string) (AreaDetail, error) {
	var detail AreaDetail
	query := `SELECT id, name, risk_score, status FROM grid_assets WHERE id = $1`

	err := r.db.Pool.QueryRow(ctx, query, areaID).Scan(
		&detail.ID,
		&detail.Name,
		&detail.CurrentRiskScore,
		&detail.Status,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return detail, fmt.Errorf("area not found: %s", areaID)
		}
		return detail, fmt.Errorf("failed to fetch area detail: %w", err)
	}
	return detail, nil
}

// GetRiskForecast fetches AI engine B's predicted outage risks.
func (r *SQLDashboardRepo) GetRiskForecast(ctx context.Context, areaID string) ([]RiskForecastPoint, error) {
	var points []RiskForecastPoint

	// Assumes 'predictions' table from Engine B workflow
	query := `
		SELECT target_timestamp, predicted_risk, is_historical 
		FROM predictions 
		WHERE area_id = $1 
		ORDER BY target_timestamp ASC;
	`
	rows, err := r.db.Pool.Query(ctx, query, areaID)
	if err != nil {
		return nil, fmt.Errorf("failed to query risk forecast: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var pt RiskForecastPoint
		if err := rows.Scan(&pt.Timestamp, &pt.PredictedRiskScore, &pt.IsHistorical); err != nil {
			return nil, fmt.Errorf("forecast scan failed: %w", err)
		}
		points = append(points, pt)
	}

	return points, rows.Err()
}

// GetIntelligenceInsight fetches Engine C's multi-variate anomaly insights (SHAP attributions).
func (r *SQLDashboardRepo) GetIntelligenceInsight(ctx context.Context, anomalyID string) (IntelligenceInsight, error) {
	var insight IntelligenceInsight
	insight.AnomalyID = anomalyID
	insight.Reasons = []string{}
	insight.FeatureDeviations = []FeatureDeviation{}

	// Query core anomaly data
	query := `SELECT confidence_score FROM anomalies WHERE id = $1`
	err := r.db.Pool.QueryRow(ctx, query, anomalyID).Scan(&insight.ConfidenceScore)
	if err != nil {
		return insight, fmt.Errorf("failed to query anomaly core insight: %w", err)
	}

	// Query feature deviations (SHAP values)
	featureQuery := `
		SELECT feature_name, shap_attribution, deviation_description 
		FROM anomaly_feature_deviations 
		WHERE anomaly_id = $1
	`
	rows, err := r.db.Pool.Query(ctx, featureQuery, anomalyID)
	if err != nil {
		return insight, fmt.Errorf("failed to query feature deviations: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var f FeatureDeviation
		if err := rows.Scan(&f.FeatureName, &f.ShapAttribution, &f.DeviationDescription); err != nil {
			return insight, fmt.Errorf("feature deviation scan failed: %w", err)
		}
		insight.FeatureDeviations = append(insight.FeatureDeviations, f)
		insight.Reasons = append(insight.Reasons, f.DeviationDescription) // map descriptions as reasons
	}

	return insight, rows.Err()
}
