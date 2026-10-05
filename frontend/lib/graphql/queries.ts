export const GET_DASHBOARD_METRICS = `
  query GetDashboardMetrics($timeRange: String!, $areaId: ID!) {
    dashboardSummary(timeRange: $timeRange) {
      overallReliabilityScore
      activeHighRiskAreas
      totalActiveAlerts
    }
    priorityAreas {
      id
      name
      urgencyRank
      riskScore
      status
    }
    anomalyTimeline(areaId: $areaId) {
      id
      areaId
      eventType
      severity
      timestamp
      description
    }
    reliabilityTrend(timeRange: $timeRange) {
      timestamp
      value
    }
  }
`;

export const GET_AREA_DRILL_DOWN_METRICS = `
  query GetAreaDrillDownMetrics($areaId: ID!, $timeRange: String!) {
    anomalyTimeline(areaId: $areaId) {
      id
      areaId
      eventType
      severity
      timestamp
      description
    }
    predictiveRiskForecast(areaId: $areaId, timeRange: $timeRange) {
      timestamp
      historicalValue
      predictedValue
      confidenceInterval
    }
  }
`;
