import { useQuery } from "@tanstack/react-query";
import { useFeederStore } from "@/store/feeder-store";

export interface ShapFactor {
  feature_name: string;
  contribution: number;
}

export interface EngineBPredictionResponse {
  feeder_id: string;
  generated_at: string;
  horizon_hours: number;
  risk_score: number;
  risk_level: "LOW" | "MEDIUM" | "HIGH";
  model_version: string;
  contributing_factors: ShapFactor[];
}

export const ENGINE_B_RISK_QUERY_KEY = "engine-b-risk";

/**
 * Custom TanStack Query hook for Engine B Outage-Risk Summary Page.
 *
 * Automatically subscribes to the global `activeFeederId` from `useFeederStore`.
 * When the operator selects a different feeder in the Sidebar or top-level UI,
 * TanStack Query treats the query key change as a cache transition, immediately
 * displaying cached data if available or triggering an instant refetch.
 */
export function useEngineBRisk() {
  const activeFeederId = useFeederStore((state) => state.activeFeederId);

  return useQuery({
    queryKey: [ENGINE_B_RISK_QUERY_KEY, activeFeederId],
    queryFn: async ({ signal }) => {
      if (!activeFeederId) {
        throw new Error("No active feeder selected in global state");
      }

      const response = await fetch(
        `/api/proxy/v1/prediction/evaluate?feeder_id=${encodeURIComponent(activeFeederId)}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
          signal,
        }
      );

      if (!response.ok) {
        let errMsg = `HTTP ${response.status}`;
        const errPayload = await response.json().catch(() => null);
        if (errPayload) {
          errMsg = errPayload.error || errPayload.detail || errPayload.message || errMsg;
        }
        throw new Error(errMsg);
      }

      const data: EngineBPredictionResponse = await response.json();
      return data;
    },
    enabled: Boolean(activeFeederId),
    staleTime: 15_000, // 15 seconds fresh before marked stale
    refetchInterval: 30_000, // 30-second background polling cycle
    refetchOnWindowFocus: true,
  });
}
