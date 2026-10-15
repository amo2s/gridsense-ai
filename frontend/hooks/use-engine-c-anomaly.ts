import { useEffect, useRef, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useFeederStore } from "@/store/feeder-store";
import { useAlertStore } from "@/store/alert-store";
import {
  EngineCAnomalyResponse,
  RedisAlertEvent,
  sanitizeEngineCAnomalyResponse,
} from "@/types/engine-c-anomaly";

export const ENGINE_C_QUERY_BASE_KEY = "engine-c-anomalies";

/**
 * ============================================================================
 * ENGINE C ANOMALY INTELLIGENCE QUERY HOOK (PHASE 2, STEPS 2.1 - 2.3)
 * ============================================================================
 * Features:
 *  - Step 2.1: Asynchronous state managed via TanStack Query.
 *    - Targets Go API Gateway POST `/api/v1/anomaly/detect?feeder_id={UUID}`.
 *    - Strict 30,000ms (30-second) polling cadence aligned with PostgreSQL materialization.
 *    - Hierarchical cache key: `["engine-c-anomalies", activeSubstationId, activeFeederId]`.
 *  - Step 2.2: Defensive Data Normalization Layer (`sanitizeEngineCAnomalyResponse`)
 *    injected in `select` pipeline to eliminate null iteration crashes.
 *  - Step 2.3: Event-Driven Cache Invalidation listening to Redis stream `gridsense:alerts:stream`.
 *    Critical breaches immediately trigger `queryClient.invalidateQueries`.
 */
export function useEngineCAnomaly() {
  const queryClient = useQueryClient();
  const activeFeederId = useFeederStore((state) => state.activeFeederId);
  const activeSubstationId = useFeederStore((state) => state.activeSubstationId);
  const activeFeeder = useFeederStore((state) => state.activeFeeder);

  const queryKey = [ENGINE_C_QUERY_BASE_KEY, activeSubstationId, activeFeederId] as const;

  // Step 4.4: Track last successful synchronization timestamp across polling cycles
  const lastSyncRef = useRef<string | null>(null);

  // Step 2.1 & 2.2: TanStack Query with 30s polling and defensive select pipeline
  const query = useQuery<EngineCAnomalyResponse, Error & { status?: number }>({
    queryKey,
    queryFn: async ({ signal }) => {
      if (!activeFeederId) {
        throw new Error("No active feeder selected in global asset state.");
      }

      const response = await fetch(
        `/api/proxy/v1/anomaly/detect?feeder_id=${encodeURIComponent(activeFeederId)}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
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
      // Pre-sanitize raw payload
      return sanitizeEngineCAnomalyResponse(rawData, activeFeederId, activeSubstationId);
    },
    // Step 2.2: Defensive normalization injected into select pipeline
    select: (data) => sanitizeEngineCAnomalyResponse(data, activeFeederId || "", activeSubstationId),
    enabled: Boolean(activeFeederId),
    refetchInterval: 30_000, // Step 2.1: Exactly 30,000ms (30 seconds) polling cadence
    staleTime: 15_000, // Fresh for 15s
    // Step 4.4: Immediately halt aggressive retries upon HTTP 503 to prevent gateway saturation
    retry: (failureCount, error: any) => {
      if (error?.status === 503) {
        console.warn("[Engine C Gateway] Received HTTP 503 (Python Engine C Offline). Halting retries.");
        return false;
      }
      return failureCount < 1;
    },
    refetchOnWindowFocus: true,
    // Step 4.4: Cache retention during failure/503 states - maintain situational awareness
    placeholderData: (prev) => prev,
  });

  // Update last successful sync whenever live data is received
  if (query.data?.timestamp) {
    lastSyncRef.current = query.data.timestamp;
  }

  // Format timestamp e.g. "2026-10-15 14:00:00 UTC"
  const formatSyncTime = (isoString?: string | null) => {
    const raw = isoString || (query.dataUpdatedAt ? new Date(query.dataUpdatedAt).toISOString() : null);
    if (!raw) return null;
    try {
      const d = new Date(raw);
      return d.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, " UTC");
    } catch {
      return raw;
    }
  };

  const is503Degraded = Boolean(
    query.isError && (query.error as any)?.status === 503
  );

  const degradedMessage = is503Degraded
    ? (query.error as any)?.message || "SYSTEMIC DEGRADATION: PYTHON ENGINE C OFFLINE - GATEWAY HTTP 503"
    : null;

  // Step 2.3: Event-Driven Cache Invalidation via Redis Stream SSE Listener
  const eventSourceRef = useRef<EventSource | null>(null);

  const invalidateAnomalyCache = useCallback(
    (reason = "Event-driven update") => {
      console.log(`[Engine C Invalidation] Triggering out-of-cycle refetch: ${reason}`);
      queryClient.invalidateQueries({ queryKey });
    },
    [queryClient, queryKey]
  );

  // Diagnostic helper to simulate a critical Redis stream alert
  const dispatchMockAlert = useCallback(
    (severity: "CRITICAL" | "HIGH" | "MEDIUM" = "CRITICAL") => {
      if (!activeFeederId) return;
      const alert: RedisAlertEvent = {
        stream_id: `alert-${Date.now()}`,
        feeder_id: activeFeederId,
        substation_id: activeSubstationId,
        severity,
        is_critical: severity === "CRITICAL",
        message: `Simulated Redis Alert: Threshold breach on feeder ${activeFeederId}`,
        timestamp: new Date().toISOString(),
      };

      console.warn(`[Redis Stream Invalidation] Received simulated alert for active feeder:`, alert);
      useAlertStore.getState().addAlert(alert);
      toast.error(`Critical Grid Alert on Feeder ${activeFeederId}: Out-of-cycle refetch triggered!`);
      invalidateAnomalyCache("Simulated Redis alert trigger");
    },
    [activeFeederId, activeSubstationId, invalidateAnomalyCache]
  );

  useEffect(() => {
    if (!activeFeederId || typeof window === "undefined") return;

    const sseUrl = `/api/proxy/v1/alerts/stream`;
    const es = new EventSource(sseUrl);
    eventSourceRef.current = es;

    es.addEventListener("alert", (event) => {
      try {
        const payload: RedisAlertEvent = JSON.parse(event.data);
        // Intercept critical threshold breaches matching the currently active feeder
        const isTargetFeeder =
          payload.feeder_id &&
          payload.feeder_id.toLowerCase().trim() === activeFeederId.toLowerCase().trim();

        const isCritical =
          payload.severity === "CRITICAL" ||
          payload.severity === "HIGH" ||
          Boolean(payload.is_critical);

        if (isTargetFeeder && isCritical) {
          console.warn(
            `[Redis SSE Alert] Critical anomaly received on active feeder ${activeFeederId}. Invalidating cache out-of-cycle.`
          );
          toast.error(
            `Grid Emergency Alert: Critical anomaly detected on ${activeFeederId}. Refreshing materialized state...`
          );
          invalidateAnomalyCache("Redis stream critical threshold breach");
        }
      } catch (err) {
        console.error("Failed to parse Redis alert SSE event payload:", err);
      }
    });

    es.onerror = (err) => {
      // EventSource reconnects automatically
      console.debug("[Redis SSE Listener] Stream disconnected, awaiting reconnection...");
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [activeFeederId, invalidateAnomalyCache]);

  return {
    ...query,
    activeFeederId,
    activeSubstationId,
    activeFeeder,
    queryKey,
    invalidateAnomalyCache,
    dispatchMockAlert,
    isDegraded: is503Degraded,
    degradedMessage,
    lastSuccessfulSync: formatSyncTime(lastSyncRef.current),
  };
}
