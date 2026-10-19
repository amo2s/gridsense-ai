/**
 * ============================================================================
 * ENGINE C: ANOMALY INTELLIGENCE WEBSOCKET CLIENT
 * ============================================================================
 * Date: 2026-10-19
 * Architecture Overhaul:
 *  1. Protocol Rectification: Strict `graphql-transport-ws` subprotocol state machine:
 *     - Handshake starts with connection_init on TCP socket open.
 *     - Operational subscription (`engine-c-anomalies`) dispatched ONLY upon receiving `connection_ack`.
 *  2. Hugging Face Proxy Heartbeat Injection:
 *     - 15-second client-to-server ping loop prevents aggressive Nginx idle-connection drops (Code 1006).
 *     - Handles server-initiated ping frames with immediate pong responses.
 *  3. Purge of Simulation Fallback:
 *     - Excised all synthetic anomaly generation (fake intervals, mocked payloads).
 *     - Unauthenticated requests cleanly halt with explicit warnings.
 *     - UI store strictly reflects true network reality (Connected / Reconnecting / Offline).
 *  4. Lifecycle Cleanup:
 *     - Heartbeat intervals and reconnection timers strictly purged on socket close, error, and explicit teardown.
 * ============================================================================
 */

import { useUIStore } from '@/store/ui-store';
import { QueryClient } from '@tanstack/react-query';
import { AnomalyEvent } from '@/lib/graphql/generated';
import { useAlertStore, GridAlert } from '@/store/alert-store';
import { useFeederStore, normalizeIdentifier } from '@/store/feeder-store';
import { toast } from 'sonner';

let wsClient: WebSocket | null = null;
let reconnectTimer: NodeJS.Timeout | null = null;
let reconnectAttempts = 0;
let isExplicitlyClosed = false;
let isConnecting = false;
let activeQueryClient: QueryClient | null = null;
let heartbeatInterval: NodeJS.Timeout | null = null;

/**
 * [2026-10-19 Engine C] Hugging Face Proxy Heartbeat Initialization
 * Dispatches a graphql-transport-ws ping frame every 15 seconds to prevent Nginx idle culling.
 */
const initializeHeartbeat = (activeWs: WebSocket) => {
  if (heartbeatInterval) clearInterval(heartbeatInterval);
  heartbeatInterval = setInterval(() => {
    if (activeWs.readyState === WebSocket.OPEN) {
      activeWs.send(JSON.stringify({ type: "ping" }));
    }
  }, 15000);
};

/**
 * Resolves the authenticated user's session token from document cookies.
 */
function getCookieToken(): string | undefined {
  if (typeof window === "undefined") return undefined;
  const match1 = document.cookie.match(/(?:^|;\s*)gridsense_session=([^;]+)/);
  const match2 = document.cookie.match(/(?:^|;\s*)auth_token=([^;]+)/);
  const raw = (match1 ? match1[1] : null) || (match2 ? match2[1] : null);
  return raw ? decodeURIComponent(raw) : undefined;
}

/**
 * Asynchronously retrieves the authentication JWT token via the server-side HttpOnly bridge (/api/auth/token).
 * Falls back to document cookies if available.
 */
async function fetchAuthToken(initialToken?: string): Promise<string | undefined> {
  if (initialToken) return initialToken;
  if (typeof window === "undefined") return undefined;

  try {
    const res = await fetch("/api/auth/token", { cache: "no-store" });
    if (res.ok) {
      const { token } = await res.json();
      if (token) {
        return token;
      }
    }
  } catch (err) {
    console.warn("[websocket-client] Failed to fetch token from bridge route:", err);
  }

  return getCookieToken();
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
 * the Upgrade: websocket and Connection: upgrade headers, resolving the 1006 abnormal closure and 404 errors.
 */
export function getWebSocketUrl(token?: string): string {
  if (typeof window === "undefined") {
    return ""; // SSR safety
  }

  // Priority 1: Explicit environment variable configuration
  const explicitWs = process.env.NEXT_PUBLIC_WS_URL;
  if (explicitWs) {
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
  return `${wsBaseUrl}/query`;
}

/**
 * Strictly awaited async initialization of the native GraphQL WebSocket client.
 * Enforces token presence via /api/auth/token before instantiating new WebSocket to prevent 1006 drops.
 */
export async function initializeWebSocketClient(
  initialToken?: string,
  queryClient?: QueryClient
): Promise<WebSocket | null> {
  if (typeof window === "undefined") {
    console.log("[websocket-client] SSR execution detected. Halting initialization.");
    return null;
  }

  if (queryClient) {
    activeQueryClient = queryClient;
  }
  const qc = queryClient || activeQueryClient;

  if (wsClient && (wsClient.readyState === WebSocket.OPEN || wsClient.readyState === WebSocket.CONNECTING)) {
    return wsClient;
  }

  if (isConnecting) {
    console.log("[websocket-client] Connection initialization already in flight. Skipping duplicate invocation.");
    return wsClient;
  }

  isConnecting = true;
  isExplicitlyClosed = false;

  try {
    // Enforce Token Presence via strict async fetch
    let resolvedToken = initialToken;
    try {
      const res = await fetch("/api/auth/token", { cache: "no-store" });
      const { token } = await res.json();
      if (token) {
        resolvedToken = token;
      }
    } catch (err) {
      console.warn("[websocket-client] Error fetching auth token from /api/auth/token:", err);
    }

    if (!resolvedToken) {
      resolvedToken = getCookieToken();
    }

    if (isExplicitlyClosed) {
      console.log("[websocket-client] Component unmounted during token fetch. Halting initialization.");
      return null;
    }

    // [2026-10-19 Engine C] Phase 1: Pure data integrity - halt if token is unavailable without engaging simulation
    if (!resolvedToken) {
      console.warn(
        "[websocket-client] Authentication token unavailable. Halting WebSocket initialization until user authenticates."
      );
      return null;
    }

    const directUrl = getWebSocketUrl(resolvedToken);
    console.log("[websocket-client] Initiating direct native WebSocket connection with subprotocol graphql-transport-ws to:", directUrl);

    useUIStore.getState().setWsStatus("Reconnecting");

    // Instantiated with the exact GraphQL subprotocol: new WebSocket(directUrl, "graphql-transport-ws")
    const ws = new WebSocket(directUrl, "graphql-transport-ws");
    wsClient = ws;

    // [2026-10-19 Engine C] Phase 2: Initialization Phase - ONLY transmit connection_init upon TCP open
    ws.onopen = () => {
      if (isExplicitlyClosed) {
        try {
          ws.close(1000, "Unmounted before open");
        } catch {}
        return;
      }
      reconnectAttempts = 0;
      console.log("[websocket-client] TCP Socket opened. Transmitting connection_init...");
      ws.send(
        JSON.stringify({
          type: "connection_init",
          payload: {
            Authorization: `Bearer ${resolvedToken}`,
          },
        })
      );
    };

    // [2026-10-19 Engine C] Phase 2 & 3: Acknowledgment, Subscription, Heartbeat & Payload Handling
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);

        if (msg.type === "connection_ack") {
          console.log("[websocket-client] Server acknowledged handshake. Initiating operationalEventStream subscription...");
          useUIStore.getState().setWsStatus("Connected");
          useUIStore.getState().setDataStreamStatus("REAL");

          ws.send(
            JSON.stringify({
              id: "engine-c-anomalies", // Unique identifier for this specific subscription
              type: "subscribe",
              payload: {
                query: `subscription { operationalEventStream { id areaId eventType severity timestamp description } }`,
              },
            })
          );

          // [2026-10-19 Engine C] Call heartbeat initialization function here
          initializeHeartbeat(ws);
          return;
        }

        // [2026-10-19 Engine C] Phase 3: Server Ping Handling - respond immediately with pong
        if (msg.type === "ping") {
          ws.send(JSON.stringify({ type: "pong" }));
          return;
        }

        if (msg.type === "error") {
          console.error("[websocket-client] GraphQL subscription error received:", msg.payload);
          return;
        }

        if (msg.type === "complete") {
          console.log("[websocket-client] GraphQL subscription completed:", msg.id);
          return;
        }

        // Handle incoming GraphQL event payload
        if (msg.type === "next" && msg.payload?.data?.operationalEventStream) {
          const rawEvent = msg.payload.data.operationalEventStream;
          const anomalyEvent = rawEvent as AnomalyEvent;

          // 1. TanStack Query cache update for anomalyTimeline
          if (anomalyEvent && qc) {
            qc.setQueriesData<AnomalyEvent[]>({ queryKey: ["anomalyTimeline"] }, (oldData) => {
              if (!oldData) return [anomalyEvent];
              return [anomalyEvent, ...oldData];
            });
          }

          // 2. Alert Dispatch Logic & Sonner Toast Notifications
          const feederId = rawEvent.feeder_id || rawEvent.areaId || rawEvent.area_id || rawEvent.entity_id || "grid";
          const isCritical =
            Boolean(rawEvent.is_critical) ||
            rawEvent.severity === "CRITICAL" ||
            rawEvent.severity === "HIGH";

          const alertItem: GridAlert = {
            id: rawEvent.id || rawEvent.stream_id || rawEvent.event_id || `alert-${Date.now()}`,
            feeder_id: feederId,
            substation_id: rawEvent.substation_id || null,
            severity: rawEvent.severity || (isCritical ? "CRITICAL" : "MEDIUM"),
            is_critical: isCritical,
            message:
              rawEvent.message ||
              rawEvent.description ||
              `Grid threshold breach detected on Feeder ${feederId}`,
            timestamp: rawEvent.timestamp || new Date().toISOString(),
            read: false,
            acknowledged: false,
          };

          // Dispatch event to Zustand alert store
          useAlertStore.getState().addAlert(alertItem);

          // Trigger Sonner toast based on severity
          if (isCritical) {
            toast.error(alertItem.message, {
              description: `Originating Feeder: ${feederId} • Severity: ${alertItem.severity}`,
              duration: 8000,
            });
          } else {
            toast.warning(alertItem.message, {
              description: `Originating Feeder: ${feederId}`,
              duration: 5000,
            });
          }

          // 3. Execute targeted TanStack Query cache invalidation for engine-c-anomalies
          if (qc) {
            qc.invalidateQueries({ queryKey: ["engine-c-anomalies"] });
            const normalizedAlertFeeder = normalizeIdentifier(feederId);
            const normalizedActiveFeeder = normalizeIdentifier(useFeederStore.getState().activeFeederId);
            if (normalizedAlertFeeder && normalizedActiveFeeder && normalizedAlertFeeder === normalizedActiveFeeder) {
              qc.invalidateQueries({
                queryKey: ["engine-c-anomalies", normalizedActiveFeeder],
              });
              qc.invalidateQueries({
                queryKey: ["engine-c-anomalies", useFeederStore.getState().activeFeederId],
              });
            }
          }
        }
      } catch (parseErr) {
        console.warn("[websocket-client] Failed to parse message frame:", parseErr);
      }
    };

    // [2026-10-19 Engine C] Phase 4: Lifecycle Cleanup and Reconnection Safety
    ws.onerror = (err) => {
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
      }
      if (isExplicitlyClosed) {
        return;
      }
      console.warn("[websocket-client] Live WebSocket connection error on target:", directUrl, err);
      useUIStore.getState().setWsStatus("Offline");
    };

    ws.onclose = (event) => {
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
      }
      wsClient = null;

      if (isExplicitlyClosed || event.code === 1000) {
        console.log("[websocket-client] Clean closure or component unmount detected. Halting reconnection logic.");
        useUIStore.getState().setWsStatus("Offline");
        return;
      }

      console.warn(
        `[websocket-client] WebSocket connection closed (code: ${event.code}, reason: "${event.reason || "None"}").`
      );
      useUIStore.getState().setWsStatus("Offline");

      const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000) + Math.random() * 300;
      reconnectAttempts++;
      console.log(`[websocket-client] Reconnecting in ${Math.round(delay)}ms (attempt #${reconnectAttempts})...`);

      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(() => {
        initializeWebSocketClient(resolvedToken, qc || activeQueryClient || undefined);
      }, delay);
    };

    return ws;
  } catch (err) {
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
    if (!isExplicitlyClosed) {
      console.error("[websocket-client] Failed to create WebSocket connection:", err);
      useUIStore.getState().setWsStatus("Offline");
    }
    return null;
  } finally {
    isConnecting = false;
  }
}

/**
 * Backwards compatibility alias for initializeWebSocket.
 */
export const initializeWebSocket = (initialToken?: string, queryClient?: QueryClient) => {
  return initializeWebSocketClient(initialToken, queryClient);
};

export const closeWebSocket = () => {
  isExplicitlyClosed = true;
  isConnecting = false;
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (wsClient) {
    wsClient.close(1000, "Explicit client close");
    wsClient = null;
  }
  useUIStore.getState().setWsStatus("Offline");
};

export const getWebSocketClient = () => wsClient;
