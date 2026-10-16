import { useUIStore } from '@/store/ui-store';
import { QueryClient } from '@tanstack/react-query';
import { AnomalyEvent } from '@/lib/graphql/generated';

let wsClient: WebSocket | null = null;
let reconnectTimer: NodeJS.Timeout | null = null;
let reconnectAttempts = 0;
let isExplicitlyClosed = false;
let isConnecting = false;

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
      console.warn("[websocket-client] No token resolved from /api/auth/token or cookies. Halting WebSocket connection to prevent 1006 unauthorized drops.");
      useUIStore.getState().setWsStatus("Offline");
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
          useUIStore.getState().setWsStatus("Connected");

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
          const anomalyEvent = msg.payload.data.operationalEventStream as AnomalyEvent;
          if (anomalyEvent && queryClient) {
            queryClient.setQueriesData<AnomalyEvent[]>({ queryKey: ["anomalyTimeline"] }, (oldData) => {
              if (!oldData) return [anomalyEvent];
              return [anomalyEvent, ...oldData];
            });
          }
        }
      } catch (parseErr) {
        console.error("[websocket-client] Failed to parse message frame:", parseErr);
      }
    };

    ws.onerror = (err) => {
      console.error("[websocket-client] WebSocket connection error on target:", directUrl, err);
      useUIStore.getState().setWsStatus("Offline");
    };

    ws.onclose = (event) => {
      useUIStore.getState().setWsStatus("Offline");
      wsClient = null;

      if (isExplicitlyClosed || event.code === 1000) {
        console.log("[websocket-client] Clean closure or component unmount detected. Halting reconnection logic.");
        return;
      }

      console.warn(`[websocket-client] WebSocket connection closed (code: ${event.code}, reason: "${event.reason || "None"}").`);

      const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000) + Math.random() * 300;
      reconnectAttempts++;
      console.log(`[websocket-client] Reconnecting in ${Math.round(delay)}ms (attempt #${reconnectAttempts})...`);

      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(() => {
        initializeWebSocketClient(resolvedToken, queryClient);
      }, delay);
    };

    return ws;
  } catch (err) {
    console.error("[websocket-client] Failed to create WebSocket connection:", err);
    useUIStore.getState().setWsStatus("Offline");
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
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (wsClient) {
    wsClient.close(1000, "Explicit client close");
    wsClient = null;
  }
};

export const getWebSocketClient = () => wsClient;
