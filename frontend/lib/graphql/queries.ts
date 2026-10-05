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

export const GET_INTELLIGENCE_INSIGHT = `
  query GetIntelligenceInsight($anomalyId: ID!) {
    intelligenceInsight(anomalyId: $anomalyId) {
      anomalyId
      confidenceScore
      reasons
      featureDeviations {
        featureName
        shapAttribution
        deviationDescription
      }
    }
  }
`;
