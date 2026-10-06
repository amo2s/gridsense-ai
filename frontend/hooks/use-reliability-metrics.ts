import { useQuery } from "@tanstack/react-query";
import { graphqlClient } from "@/lib/graphql-client";
import { DashboardSummary } from "@/lib/graphql/generated";

const RELIABILITY_METRICS_QUERY = `
  query DashboardSummary($timeRange: String!) {
    dashboardSummary(timeRange: $timeRange) {
      overallReliabilityScore
      activeHighRiskAreas
      totalActiveAlerts
    }
  }
`;

interface DashboardSummaryResponse {
  dashboardSummary: DashboardSummary;
}

export function useReliabilityMetrics(timeRange: string) {
  return useQuery({
    queryKey: ["dashboard-metrics", timeRange],
    queryFn: async () => {
      const data = await graphqlClient.request<DashboardSummaryResponse>(
        RELIABILITY_METRICS_QUERY,
        { timeRange }
      );
      return data.dashboardSummary;
    },
  });
}
