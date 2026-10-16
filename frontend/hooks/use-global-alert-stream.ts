"use client";

import { useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAlertStore, GridAlert } from "@/store/alert-store";
import { useFeederStore, normalizeIdentifier } from "@/store/feeder-store";

const SSE_URL = "/api/proxy/v1/alerts/stream";
const INITIAL_RETRY_DELAY_MS = 1000;
const MAX_RETRY_DELAY_MS = 30000;

/**
 * ============================================================================
 * GLOBAL ALERT STREAM & EVENT-DRIVEN CACHE INVALIDATION HOOK (STEP 2.3 & 4.2)
 * ============================================================================
 * Establishes a persistent, resilient Server-Sent Events (SSE) connection to the
 * Redis alerts stream via the Next.js API proxy route.
 *
 * Responsibilities:
 *  1. Sustains a single long-lived EventSource connection with jittered exponential backoff.
 *  2. Listens to both native `onmessage` and custom `event: alert` streams.
 *  3. Dispatches incoming alerts to the global Zustand `alert-store`.
 *  4. Intercepts critical alerts matching the currently active feeder and triggers an
 *     immediate out-of-cycle TanStack Query cache invalidation, bypassing the 30s timer.
 */
export function useGlobalAlertStream() {
  const queryClient = useQueryClient();
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const retryAttemptRef = useRef<number>(0);
  const isConnectingRef = useRef<boolean>(false);

  // Read state accessors
  const activeFeederId = useFeederStore((state) => state.activeFeederId);
  const addAlert = useAlertStore((state) => state.addAlert);

  const processIncomingAlert = useCallback(
    (rawPayload: any) => {
      try {
        const payload = typeof rawPayload === "string" ? JSON.parse(rawPayload) : rawPayload;

        // Ignore handshake pings or heartbeats
        if (payload?.status === "connected" || !payload?.feeder_id) {
          return;
        }

        const normalizedAlertFeeder = normalizeIdentifier(payload.feeder_id);
        const normalizedActiveFeeder = normalizeIdentifier(useFeederStore.getState().activeFeederId);

        const isCritical =
          Boolean(payload.is_critical) ||
          payload.severity === "CRITICAL" ||
          payload.severity === "HIGH";

        // Dispatch to global Zustand alert store
        addAlert({
          id: payload.id || payload.stream_id || `alert-${Date.now()}`,
          feeder_id: payload.feeder_id,
          substation_id: payload.substation_id,
          severity: payload.severity || (isCritical ? "CRITICAL" : "MEDIUM"),
          is_critical: isCritical,
          message: payload.message || `Grid threshold breach detected on Feeder ${payload.feeder_id}`,
          timestamp: payload.timestamp || new Date().toISOString(),
        });

        // Trigger Sonner toast notification
        if (isCritical) {
          toast.error(payload.message || `Critical anomaly detected on Feeder ${payload.feeder_id}`, {
            description: `Originating Feeder: ${payload.feeder_id} • Severity: ${payload.severity || "CRITICAL"}`,
            duration: 8000,
          });
        } else {
          toast.warning(payload.message || `Grid alert on Feeder ${payload.feeder_id}`, {
            duration: 5000,
          });
        }

        // Blueprint Step 2.3: Targeted Event-Driven TanStack Query Cache Invalidation
        if (isCritical && normalizedAlertFeeder && normalizedActiveFeeder && normalizedAlertFeeder === normalizedActiveFeeder) {
          console.warn(
            `[SSE Cache Invalidation] Critical alert intercepted for active feeder ${normalizedActiveFeeder}. Bypassing 30s timer with immediate refetch.`
          );

          // Invalidate base query key, hierarchical context key, and exact feeder key
          queryClient.invalidateQueries({
            queryKey: ["engine-c-anomalies"],
          });
          queryClient.invalidateQueries({
            queryKey: ["engine-c-anomalies", normalizedActiveFeeder],
          });
          queryClient.invalidateQueries({
            queryKey: ["engine-c-anomalies", useFeederStore.getState().activeFeederId],
          });
        }
      } catch (err) {
        console.error("[useGlobalAlertStream] Failed to parse SSE alert event payload:", err);
      }
    },
    [addAlert, queryClient]
  );

  const connect = useCallback(() => {
    if (typeof window === "undefined" || eventSourceRef.current || isConnectingRef.current) {
      return;
    }

    isConnectingRef.current = true;

    try {
      const es = new EventSource(SSE_URL);
      eventSourceRef.current = es;

      es.onopen = () => {
        isConnectingRef.current = false;
        retryAttemptRef.current = 0;
        console.log("[GlobalAlertStream] Sustained SSE connection established to /api/proxy/v1/alerts/stream");
      };

      // Handler for default message events (data: {...})
      es.onmessage = (event) => {
        processIncomingAlert(event.data);
      };

      // Handler for named 'alert' events (event: alert\ndata: {...})
      es.addEventListener("alert", (event: MessageEvent) => {
        processIncomingAlert(event.data);
      });

      // Handler for ping handshakes
      es.addEventListener("ping", () => {
        // Connection health validated
      });

      es.onerror = (err) => {
        isConnectingRef.current = false;
        console.warn("[GlobalAlertStream] SSE connection interrupted. Initiating exponential backoff reconnect...", err);

        if (es.readyState === EventSource.CLOSED) {
          es.close();
          eventSourceRef.current = null;
        }

        // Exponential backoff with jitter
        const attempt = retryAttemptRef.current;
        retryAttemptRef.current += 1;

        const baseDelay = Math.min(
          INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt),
          MAX_RETRY_DELAY_MS
        );
        const jitter = Math.floor(Math.random() * (baseDelay * 0.25));
        const delay = baseDelay + jitter;

        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
        }

        reconnectTimeoutRef.current = setTimeout(() => {
          if (!eventSourceRef.current) {
            connect();
          }
        }, delay);
      };
    } catch (e) {
      isConnectingRef.current = false;
      console.error("[GlobalAlertStream] Failed to initialize EventSource:", e);
    }
  }, [processIncomingAlert]);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [connect]);

  // Helper to programmatically broadcast or simulate an alert
  const simulateCriticalAlert = useCallback(
    async (feederId?: string, customMessage?: string) => {
      const target = feederId || activeFeederId || "f47ac10b-58cc-4372-a567-0e02b2c3d479";
      const payload = {
        id: `sim-${Date.now()}`,
        feeder_id: target,
        severity: "CRITICAL",
        is_critical: true,
        message: customMessage || `Simulated Critical Anomaly on Feeder ${target}: Out-of-cycle refetch triggered!`,
        timestamp: new Date().toISOString(),
      };

      // Dispatch locally
      processIncomingAlert(payload);

      // Attempt broadcast to proxy
      try {
        await fetch(SSE_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } catch (err) {
        // Local dispatch already processed
      }
    },
    [activeFeederId, processIncomingAlert]
  );

  return {
    simulateCriticalAlert,
  };
}
