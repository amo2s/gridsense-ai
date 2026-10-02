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
  }
`;
