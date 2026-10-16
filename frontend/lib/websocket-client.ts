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
let simulationInterval: NodeJS.Timeout | null = null;

const SAMPLE_SIMULATION_DESCRIPTIONS = [
  "Transient voltage spike detected on phase B",
  "Diurnal STL residual excursion breach (>3.2σ)",
  "Sub-synchronous frequency flutter detected (49.82Hz)",
  "Active power throughput imbalance across feeder head",
  "Harmonic distortion threshold exceeded on busbar",
  "Reverse power flow anomaly detected during peak generation",
];

export function stopSimulationFallback() {
  if (simulationInterval) {
    clearInterval(simulationInterval);
    simulationInterval = null;
  }
}

export function startSimulationFallback(queryClient?: QueryClient | null) {
  if (simulationInterval || isExplicitlyClosed) {
    return;
  }

  console.log("[websocket-client] Remote WebSocket unavailable. Engaging local event stream simulation fallback.");
  useUIStore.getState().setWsStatus("Simulated");
  useUIStore.getState().setDataStreamStatus("SYNTHETIC");

  const qc = queryClient || activeQueryClient;

  const emitSimulatedTelemetry = () => {
    if (isExplicitlyClosed) {
      stopSimulationFallback();
      return;
    }

    const activeFeederId = useFeederStore.getState().activeFeederId || "f47ac10b-58cc-4372-a567-0e02b2c3d479";
    const isCritical = Math.random() > 0.65;
    const severity = isCritical ? "CRITICAL" : "MEDIUM";
    const desc = SAMPLE_SIMULATION_DESCRIPTIONS[Math.floor(Math.random() * SAMPLE_SIMULATION_DESCRIPTIONS.length)];
    const timestamp = new Date().toISOString();
    const eventId = `sim-${Date.now()}`;

    const simAnomalyEvent: AnomalyEvent = {
      id: eventId,
      areaId: activeFeederId,
      eventType: "VOLTAGE_SPIKE",
      severity: severity,
      timestamp: timestamp,
      description: desc,
    };

    // 1. Dispatch to queryClient ["anomalyTimeline"]
    if (qc) {
      qc.setQueriesData<AnomalyEvent[]>({ queryKey: ["anomalyTimeline"] }, (oldData) => {
        if (!oldData) return [simAnomalyEvent];
        return [simAnomalyEvent, ...oldData.slice(0, 49)];
      });
    }

    // 2. Dispatch to global Zustand alert store
    const alertItem: GridAlert = {
      id: eventId,
      feeder_id: activeFeederId,
      substation_id: null,
      severity: severity,
      is_critical: isCritical,
      message: `${desc} on Feeder ${activeFeederId.slice(0, 8)}...`,
      timestamp: timestamp,
      read: false,
      acknowledged: false,
    };
    useAlertStore.getState().addAlert(alertItem);

    // 3. Dispatch Sonner toast alerts matching live behavior
    if (isCritical) {
      toast.error(alertItem.message, {
        description: `Originating Feeder: ${activeFeederId} • Severity: CRITICAL`,
        duration: 8000,
      });
    } else {
      toast.warning(alertItem.message, {
        description: `Originating Feeder: ${activeFeederId}`,
        duration: 5000,
      });
    }

    // 4. Targeted Query Cache Invalidation for engine-c-anomalies
    if (isCritical && qc) {
      qc.invalidateQueries({ queryKey: ["engine-c-anomalies"] });
      const normalizedActive = normalizeIdentifier(activeFeederId);
      if (normalizedActive) {
        qc.invalidateQueries({ queryKey: ["engine-c-anomalies", normalizedActive] });
      }
    }
  };

  // Emit immediately, then schedule every 8–12 seconds (average 10s)
  emitSimulatedTelemetry();
  simulationInterval = setInterval(emitSimulatedTelemetry, 10000);
}

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

    if (!resolvedToken) {
      console.warn("[websocket-client] No token resolved from /api/auth/token or cookies. Engaging local event stream simulation fallback.");
      startSimulationFallback(qc);
      return null;
    }

    const directUrl = getWebSocketUrl(resolvedToken);
    console.log("[websocket-client] Initiating direct native WebSocket connection with subprotocol graphql-transport-ws to:", directUrl);

    useUIStore.getState().setWsStatus("Reconnecting");

    // Instantiated with the exact GraphQL subprotocol: new WebSocket(directUrl, 'graphql-transport-ws')
    const ws = new WebSocket(directUrl, "graphql-transport-ws");
    wsClient = ws;

    ws.onopen = () => {
      reconnectAttempts = 0;
      console.log("[websocket-client] WebSocket opened successfully on target. Sending connection_init frame...");

      // Sends the exact connection_init payload required by the Go backend's InitFunc:
      // {"type": "connection_init", "payload": {"Authorization": "Bearer <TOKEN>"}}
      const initPayload = {
        type: "connection_init",
        payload: {
          Authorization: `Bearer ${resolvedToken}`,
        },
      };
      ws.send(JSON.stringify(initPayload));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);

        if (msg.type === "connection_ack") {
          console.log("[websocket-client] Received connection_ack from Go backend. Subscribing to operationalEventStream...");
          stopSimulationFallback();
          useUIStore.getState().setWsStatus("Connected");
          useUIStore.getState().setDataStreamStatus("REAL");

          // Dispatch GraphQL subscription for operational events
          const subscribeFrame = {
            id: "1",
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
          };
          ws.send(JSON.stringify(subscribeFrame));
          return;
        }

        if (msg.type === "ping") {
          ws.send(JSON.stringify({ type: "pong" }));
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
        console.error("[websocket-client] Failed to parse message frame:", parseErr);
      }
    };

    ws.onerror = (err) => {
      console.error("[websocket-client] WebSocket connection error on target:", directUrl, err);
      startSimulationFallback(qc);
    };

    ws.onclose = (event) => {
      wsClient = null;

      if (isExplicitlyClosed || event.code === 1000) {
        console.log("[websocket-client] Clean closure or component unmount detected. Halting reconnection logic.");
        stopSimulationFallback();
        useUIStore.getState().setWsStatus("Offline");
        return;
      }

      console.warn(`[websocket-client] WebSocket connection closed (code: ${event.code}, reason: "${event.reason || "None"}"). Engaging local simulation fallback.`);

      // Halt the infinite aggressive reconnection storm and engage local event stream simulation fallback
      startSimulationFallback(qc);
    };

    return ws;
  } catch (err) {
    console.error("[websocket-client] Failed to create WebSocket connection:", err);
    startSimulationFallback(qc);
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
  stopSimulationFallback();
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
