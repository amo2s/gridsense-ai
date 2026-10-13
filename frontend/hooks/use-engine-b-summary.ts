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

      const rawData = await response.json();

      // Defensive Data Transformation Layer (Part III):
      // Intercept and sanitize payload from Go Gateway. Guarantees contributing_factors
      // is always an array so Recharts iteration never throws undefined mapping exceptions.
      const sanitizedData: EngineBPredictionSummary = {
        feeder_id: typeof rawData?.feeder_id === "string" ? rawData.feeder_id : (activeFeederId || ""),
        generated_at: typeof rawData?.generated_at === "string" ? rawData.generated_at : new Date().toISOString(),
        horizon_hours: typeof rawData?.horizon_hours === "number" ? rawData.horizon_hours : 6,
        risk_score: typeof rawData?.risk_score === "number" ? rawData.risk_score : 0,
        risk_level: typeof rawData?.risk_level === "string" ? rawData.risk_level : "LOW",
        model_version: typeof rawData?.model_version === "string" ? rawData.model_version : "champion_v1.0.0",
        contributing_factors: Array.isArray(rawData?.contributing_factors)
          ? rawData.contributing_factors.map((f: any) => ({
              feature_name: typeof f?.feature_name === "string" ? f.feature_name : "Unknown Feature",
              contribution: typeof f?.contribution === "number" ? f.contribution : 0,
            }))
          : [],
      };

      return sanitizedData;
    },
    enabled: Boolean(activeFeederId),
    refetchInterval: 30_000, // Poll the database every 30 seconds for live updates
    staleTime: 15_000, // Consider the cache fresh for 15 seconds
    retry: 1, // Fail fast on actual 404s
    refetchOnWindowFocus: true,
    placeholderData: (prev) => prev, // Phase 4: Cache retention during failure/503 states
  });
}
