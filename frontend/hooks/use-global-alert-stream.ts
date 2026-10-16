"use client";

import { useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAlertStore, GridAlert } from "@/store/alert-store";
import { useFeederStore, normalizeIdentifier } from "@/store/feeder-store";

const INITIAL_RETRY_DELAY_MS = 1000;
const MAX_RETRY_DELAY_MS = 30000;

/**
 * Resolves the authenticated user's session token from document cookies.
 */
function getSessionToken(): string | undefined {
  if (typeof window === "undefined") return undefined;
  const match1 = document.cookie.match(/(?:^|;\s*)auth_token=([^;]+)/);
  const match2 = document.cookie.match(/(?:^|;\s*)gridsense_session=([^;]+)/);
  const raw = (match1 ? match1[1] : null) || (match2 ? match2[1] : null);
  return raw ? decodeURIComponent(raw) : undefined;
}

/**
 * Asynchronously retrieves the authentication JWT token via the server-side HttpOnly bridge (/api/auth/token).
 * Falls back to document cookies if available.
 */
async function fetchAuthToken(): Promise<string | undefined> {
  if (typeof window === "undefined") return undefined;

  try {
    const res = await fetch("/api/auth/token", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      if (data?.token) {
        return data.token;
      }
    }
  } catch (err) {
    console.warn("[GlobalAlertStream] Failed to fetch token from bridge route:", err);
  }

  return getSessionToken();
}


/**
 * Robust string replacement utility to convert HTTP/HTTPS protocols to native WebSocket protocols.
 *  - http:// -> ws://
 *  - https:// -> wss://
 */
export function convertHttpToWsProtocol(url: string): string {
  if (!url) return "";
  return url
    .trim()
    .replace(/^http:\/\//i, "ws://")
    .replace(/^https:\/\//i, "wss://");
}

/**
 * Dynamically constructs the direct native WebSocket endpoint URL targeting the Go backend / BFF directly.
 * COMPLETELY BYPASSES Next.js port 3000 proxies and rewrites (/api/ws-proxy) which drop or mangle
 * the Upgrade: websocket and Connection: upgrade headers, resolving the 1006 abnormal closure.
 */
export function getWebSocketUrl(token?: string): string {

  // Priority 1: Explicit environment variable configuration
  const explicitWs = process.env.NEXT_PUBLIC_WS_URL;
  if (explicitWs) {
    if (token && !explicitWs.includes("token=")) {
      const delimiter = explicitWs.includes("?") ? "&" : "?";
      return `${explicitWs}${delimiter}token=${encodeURIComponent(token)}`;
    }
    return explicitWs;
  }

  // Priority 2: Direct backend URL extracted from environment variables
  const rawBackendUrl =
    process.env.NEXT_PUBLIC_API_URL ||
    process.env.NEXT_PUBLIC_BACKEND_API_URL ||
    process.env.NEXT_PUBLIC_GATEWAY_URL ||
    process.env.BACKEND_API_URL ||
    "https://sliverboy-heal-her-backend.hf.space";

  // Robust protocol conversion: http:// -> ws://, https:// -> wss://
  const wsBaseUrl = convertHttpToWsProtocol(rawBackendUrl).replace(/\/+$/, "");
  const targetEndpoint = `${wsBaseUrl}/query`;

  if (token) {
    return `${targetEndpoint}?token=${encodeURIComponent(token)}`;
  }
  return targetEndpoint;
}

/**
 * ============================================================================
 * GLOBAL WEBSOCKET ALERT STREAM & CACHE INVALIDATION HOOK (PHASE 3)
 * ============================================================================
 * Replaces the failing Server-Sent Events (SSE) proxy architecture with a direct,
 * production-grade native WebSocket client.
 *
 * Operational Mechanics:
 *  1. Direct WebSocket connection with subprotocol negotiation & auth query parameter injection.
 *  2. Jittered exponential backoff reconnection physics (1s, 2s, 4s... capped at 30s).
 *  3. Bidirectional schema parsing supporting both GraphQL-WS event frames and direct JSON alerts.
 *  4. Instantaneous TanStack Query cache invalidation for active feeder upon critical alert.
 *  5. Strict lifecycle management with explicit ws.close() on unmount to prevent ghost sockets.
 */
export function useGlobalAlertStream() {
  const queryClient = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const retryAttemptRef = useRef<number>(0);
  const isConnectingRef = useRef<boolean>(false);
  const isUnmountedRef = useRef<boolean>(false);

  // Read state accessors
  const activeFeederId = useFeederStore((state) => state.activeFeederId);
  const addAlert = useAlertStore((state) => state.addAlert);

  const processIncomingAlert = useCallback(
    (rawPayload: any) => {
      try {
        const payload = typeof rawPayload === "string" ? JSON.parse(rawPayload) : rawPayload;

        // Skip handshake, connection_ack, and keep-alive ping messages
        if (
          !payload ||
          payload.type === "connection_ack" ||
          payload.type === "ka" ||
          payload.type === "ping" ||
          payload.status === "connected"
        ) {
          return;
        }

        // Handle GraphQL-WS next frame format: { type: "next", payload: { data: { operationalEventStream: ... } } }
        let alertData: any = payload;
        if (payload.type === "next" && payload.payload?.data?.operationalEventStream) {
          alertData = payload.payload.data.operationalEventStream;
        } else if (payload.data?.operationalEventStream) {
          alertData = payload.data.operationalEventStream;
        }

        const feederId = alertData.feeder_id || alertData.areaId || alertData.area_id || alertData.entity_id;
        if (!feederId) {
          return;
        }

        const normalizedAlertFeeder = normalizeIdentifier(feederId);
        const normalizedActiveFeeder = normalizeIdentifier(useFeederStore.getState().activeFeederId);

        const isCritical =
          Boolean(alertData.is_critical) ||
          alertData.severity === "CRITICAL" ||
          alertData.severity === "HIGH";

        const alertItem: GridAlert = {
          id: alertData.id || alertData.stream_id || alertData.event_id || `alert-${Date.now()}`,
          feeder_id: feederId,
          substation_id: alertData.substation_id || null,
          severity: alertData.severity || (isCritical ? "CRITICAL" : "MEDIUM"),
          is_critical: isCritical,
          message:
            alertData.message ||
            alertData.description ||
            `Grid threshold breach detected on Feeder ${feederId}`,
          timestamp: alertData.timestamp || new Date().toISOString(),
          read: false,
          acknowledged: false,
        };

        // Dispatch to global Zustand alert store to trigger Topbar bell notification
        addAlert(alertItem);

        // Visual notification via Sonner toast
        if (isCritical) {
          toast.error(alertItem.message, {
            description: `Originating Feeder: ${feederId} • Severity: ${alertItem.severity}`,
            duration: 8000,
          });
        } else {
          toast.warning(alertItem.message, {
            duration: 5000,
          });
        }

        // Targeted Event-Driven TanStack Query Cache Invalidation (Step 3.3)
        if (
          isCritical &&
          normalizedAlertFeeder &&
          normalizedActiveFeeder &&
          normalizedAlertFeeder === normalizedActiveFeeder
        ) {
          console.warn(
            `[WebSocket Cache Invalidation] Critical alert intercepted for active feeder ${normalizedActiveFeeder}. Invalidating Engine C queries out-of-cycle.`
          );

          // Invalidate base key, context key, and exact key
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
        console.error("[GlobalAlertStream] Failed to parse WebSocket alert message:", err);
      }
    },
    [addAlert, queryClient]
  );

  const connect = useCallback(async () => {
    if (
      typeof window === "undefined" ||
      isUnmountedRef.current ||
      wsRef.current ||
      isConnectingRef.current
    ) {
      return;
    }

    isConnectingRef.current = true;
    const token = await fetchAuthToken();

    // Guard against unmount while awaiting token fetch
    if (isUnmountedRef.current) {
      isConnectingRef.current = false;
      return;
    }

    const wsUrl = getWebSocketUrl(token);

    try {
      console.log("[GlobalAlertStream] Initiating native WebSocket connection to:", wsUrl);
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        isConnectingRef.current = false;
        retryAttemptRef.current = 0; // Reset exponential backoff counter upon connection
        console.log("[GlobalAlertStream] Native WebSocket connection successfully established to:", wsUrl);

        // Send connection_init payload with JWT authorization for GraphQL-WS protocols
        try {
          ws.send(
            JSON.stringify({
              type: "connection_init",
              payload: {
                Authorization: token ? `Bearer ${token}` : "",
              },
            })
          );
        } catch (sendErr) {
          console.warn("[GlobalAlertStream] Failed to send connection_init frame:", sendErr);
        }
      };

      ws.onmessage = (event: MessageEvent) => {
        try {
          const message = typeof event.data === "string" ? JSON.parse(event.data) : event.data;

          // If server acknowledged connection, subscribe to the operationalEventStream
          if (message?.type === "connection_ack") {
            console.log("[GlobalAlertStream] Server connection acknowledged. Subscribing to operationalEventStream...");
            ws.send(
              JSON.stringify({
                id: "gridsense-alert-sub",
                type: "subscribe",
                payload: {
                  query: `
                    subscription {
                      operationalEventStream {
                        id
                        areaId
                        eventType
                        severity
                        timestamp
                        description
                      }
                    }
                  `,
                },
              })
            );
            return;
          }

          // Process the incoming alert payload
          processIncomingAlert(message);
        } catch {
          processIncomingAlert(event.data);
        }
      };

      ws.onerror = (err) => {
        isConnectingRef.current = false;
        console.warn("[GlobalAlertStream] WebSocket encounter error event:", err);
      };

      ws.onclose = (event: CloseEvent) => {
        isConnectingRef.current = false;
        wsRef.current = null;

        if (isUnmountedRef.current || event.code === 1000) {
          console.log("[GlobalAlertStream] Clean closure or component unmount detected. Halting reconnection logic.");
          return;
        }

        // Jittered exponential backoff algorithm:
        // delay = min(INITIAL_RETRY_DELAY_MS * 2^attempt, MAX_RETRY_DELAY_MS) + jitter
        const attempt = retryAttemptRef.current;
        retryAttemptRef.current += 1;

        const baseDelay = Math.min(
          INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt),
          MAX_RETRY_DELAY_MS
        );
        const jitter = Math.floor(Math.random() * (baseDelay * 0.25));
        const delay = baseDelay + jitter;

        console.warn(
          `[GlobalAlertStream] WebSocket connection closed (code: ${event.code}). Scheduling reconnection in ${delay}ms (attempt #${attempt + 1})...`
        );

        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
        }

        reconnectTimeoutRef.current = setTimeout(() => {
          if (!isUnmountedRef.current) {
            connect();
          }
        }, delay);
      };
    } catch (err) {
      isConnectingRef.current = false;
      console.error("[GlobalAlertStream] Failed to construct WebSocket instance:", err);
    }
  }, [processIncomingAlert]);

  useEffect(() => {
    isUnmountedRef.current = false;
    connect();

    // Strict cleanup function to prevent memory leaks and ghost sockets during hot reloading
    return () => {
      isUnmountedRef.current = true;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (wsRef.current) {
        console.log("[GlobalAlertStream] Closing active WebSocket on component teardown.");
        try {
          wsRef.current.close(1000, "Client unmount");
        } catch {}
        wsRef.current = null;
      }
    };
  }, [connect]);

  // Programmatic simulation helper allowing tests and operator drills without external dependencies
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

      // Dispatch directly through the incoming pipeline
      processIncomingAlert(payload);
    },
    [activeFeederId, processIncomingAlert]
  );

  return {
    simulateCriticalAlert,
  };
}
