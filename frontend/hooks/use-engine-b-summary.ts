import { useQuery } from "@tanstack/react-query";
import { useFeederStore } from "@/store/feeder-store";

export interface ShapFactor {
  feature_name: string;
  contribution: number;
}

export interface EngineBPredictionSummary {
  feeder_id: string;
  generated_at: string;
  horizon_hours: number;
  risk_score: number;
  risk_level: string;
  model_version: string;
  contributing_factors: ShapFactor[];
}

export const ENGINE_B_SUMMARY_QUERY_KEY = "engine-b-summary";

/**
 * Custom TanStack Query polling hook for Engine B Materialized Risk Prediction Summary.
 *
 * Consumes 100% live, materialized data directly from the PostgreSQL `risk_predictions`
 * table via the Go API Gateway and Next.js proxy route.
 *
 * Automatically tracks the global `activeFeederId` from `useFeederStore`.
 * If the operator changes the asset in the global sidebar, this query automatically
 * invalidates and immediately fetches the new asset's live materialized record.
 */
export function useEngineBSummary() {
  const activeFeederId = useFeederStore((state) => state.activeFeederId);

  return useQuery<EngineBPredictionSummary, Error & { status?: number }>({
    queryKey: [ENGINE_B_SUMMARY_QUERY_KEY, activeFeederId],
    queryFn: async ({ signal }) => {
      if (!activeFeederId) {
        throw new Error("No active feeder selected in global state");
      }

      const response = await fetch(
        `/api/proxy/v1/prediction/summary?feeder_id=${encodeURIComponent(activeFeederId)}`,
        {
          method: "GET",
          headers: {
            Accept: "application/json",
          },
          signal,
        }
      );

      if (!response.ok) {
        let errMsg = `HTTP ${response.status}`;
        const errPayload = await response.json().catch(() => null);
        if (errPayload) {
          errMsg = errPayload.message || errPayload.error || errMsg;
        }

        const customErr: Error & { status?: number } = new Error(errMsg);
        customErr.status = response.status;
        throw customErr;
      }

      const data: EngineBPredictionSummary = await response.json();
      return data;
    },
    enabled: Boolean(activeFeederId),
    refetchInterval: 30_000, // Poll the database every 30 seconds for live updates
    staleTime: 15_000, // Consider the cache fresh for 15 seconds
    retry: 1, // Fail fast on actual 404s
    refetchOnWindowFocus: true,
  });
}
