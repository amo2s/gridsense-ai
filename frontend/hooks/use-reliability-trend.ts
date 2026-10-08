import { useQuery } from "@tanstack/react-query";

interface TrendDataPoint {
  timestamp: string;
  value: number;
}

export function useReliabilityTrend(timeRange: string) {
  return useQuery({
    queryKey: ["reliability-trend", timeRange],
    queryFn: async () => {
      const token = typeof window !== 'undefined' ? sessionStorage.getItem('access_token') : null;
      if (!token) {
        throw new Error("Authentication token missing");
      }

      const response = await fetch(`/api/proxy/v1/reliability/trend?timeRange=${timeRange}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data.reliabilityTrend as TrendDataPoint[];
    },
  });
}
