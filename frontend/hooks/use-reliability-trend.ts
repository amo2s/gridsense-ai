import { useQuery } from "@tanstack/react-query";
import { graphqlClient } from "@/lib/graphql-client";
import { TrendDataPoint } from "@/lib/graphql/generated";

const RELIABILITY_TREND_QUERY = `
  query ReliabilityTrend($timeRange: String!) {
    reliabilityTrend(timeRange: $timeRange) {
      timestamp
      value
    }
  }
`;

interface ReliabilityTrendResponse {
  reliabilityTrend: TrendDataPoint[];
}

export function useReliabilityTrend(timeRange: string) {
  return useQuery({
    queryKey: ["reliability-trend", timeRange],
    queryFn: async () => {
      const data = await graphqlClient.request<ReliabilityTrendResponse>(
        RELIABILITY_TREND_QUERY,
        { timeRange }
      );
      return data.reliabilityTrend;
    },
  });
}
