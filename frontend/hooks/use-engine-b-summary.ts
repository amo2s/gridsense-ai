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
  historical_telemetry?: any[];
}

export const ENGINE_B_SUMMARY_QUERY_KEY = "engine-b-summary";

/**
 * Phase 5: Defensive Data Normalization Layer
 * Intercepts cold start, null, undefined, or malformed data from the Go API Gateway.
 * Guarantees structured empty arrays ([]) for contributing_factors and historical_telemetry
 * to mathematically prevent Recharts iteration crashes.
 */
export function sanitizeEngineBPredictionSummary(
  rawData: any,
  fallbackFeederId = ""
): EngineBPredictionSummary {
  if (!rawData || typeof rawData !== "object") {
    return {
      feeder_id: fallbackFeederId,
      generated_at: new Date().toISOString(),
      horizon_hours: 6,
      risk_score: 0,
      risk_level: "LOW",
      model_version: "champion_v1.0.0",
      contributing_factors: [],
      historical_telemetry: [],
    };
  }

  // Intercept and sanitize contributing_factors (guaranteed structured array [])
  let sanitizedFactors: ShapFactor[] = [];
  if (Array.isArray(rawData?.contributing_factors)) {
    sanitizedFactors = rawData.contributing_factors
      .filter((f: any) => f && typeof f === "object")
      .map((f: any) => ({
        feature_name:
          typeof f.feature_name === "string" && f.feature_name.trim().length > 0
            ? f.feature_name.trim()
            : "Unknown Factor",
        contribution:
          typeof f.contribution === "number" && !Number.isNaN(f.contribution)
            ? f.contribution
            : 0,
      }));
  }

  // Intercept and sanitize historical_telemetry if present (guaranteed structured array [])
  const sanitizedTelemetry = Array.isArray(rawData?.historical_telemetry)
    ? rawData.historical_telemetry.filter((t: any) => t && typeof t === "object")
    : [];

  return {
    feeder_id:
      typeof rawData.feeder_id === "string" && rawData.feeder_id.trim().length > 0
        ? rawData.feeder_id.trim()
        : fallbackFeederId,
    generated_at:
      typeof rawData.generated_at === "string" && !Number.isNaN(Date.parse(rawData.generated_at))
        ? rawData.generated_at
        : new Date().toISOString(),
    horizon_hours:
      typeof rawData.horizon_hours === "number" && !Number.isNaN(rawData.horizon_hours)
        ? rawData.horizon_hours
        : 6,
    risk_score:
      typeof rawData.risk_score === "number" && !Number.isNaN(rawData.risk_score)
        ? rawData.risk_score
        : 0,
    risk_level:
      typeof rawData.risk_level === "string" ? rawData.risk_level.toUpperCase() : "LOW",
    model_version:
      typeof rawData.model_version === "string" ? rawData.model_version : "champion_v1.0.0",
    contributing_factors: sanitizedFactors,
    historical_telemetry: sanitizedTelemetry,
  };
}

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
      return sanitizeEngineBPredictionSummary(rawData, activeFeederId);
    },
    select: (data) => sanitizeEngineBPredictionSummary(data, activeFeederId || ""),
    enabled: Boolean(activeFeederId),
    refetchInterval: 30_000, // Poll the database every 30 seconds for live updates
    staleTime: 15_000, // Consider the cache fresh for 15 seconds
    retry: 1, // Fail fast on actual 404s
    refetchOnWindowFocus: true,
    placeholderData: (prev) => prev, // Phase 4: Cache retention during failure/503 states
  });
}
