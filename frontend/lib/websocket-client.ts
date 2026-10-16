import { createClient, Client } from 'graphql-ws';
import { useUIStore } from '@/store/ui-store';
import { QueryClient } from '@tanstack/react-query';
import { AnomalyEvent } from '@/lib/graphql/generated';

let wsClient: Client | null = null;

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
export const getWebSocketUrl = (token?: string): string => {
  if (typeof window === "undefined") {
    return ""; // SSR safety
  }

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
};

export const initializeWebSocket = (token: string | undefined, queryClient: QueryClient) => {
  if (wsClient) return wsClient;

  let currentToken = token;
  if (!currentToken && typeof window !== "undefined") {
    const match1 = document.cookie.match(new RegExp('(^| )gridsense_session=([^;]+)'));
    const match2 = document.cookie.match(new RegExp('(^| )auth_token=([^;]+)'));
    const cookieToken = (match1 ? match1[2] : null) || (match2 ? match2[2] : null);
    if (cookieToken) {
      currentToken = decodeURIComponent(cookieToken);
    }
  }

  const wsUrl = getWebSocketUrl(currentToken);
  
  console.log("[websocket-client] Initiating direct native WebSocket connection to:", wsUrl);

  wsClient = createClient({
    url: wsUrl,
    connectionParams: async () => {
      let activeToken = currentToken;
      if (typeof window !== "undefined") {
        const match1 = document.cookie.match(new RegExp('(^| )gridsense_session=([^;]+)'));
        const match2 = document.cookie.match(new RegExp('(^| )auth_token=([^;]+)'));
        const cookieToken = (match1 ? match1[2] : null) || (match2 ? match2[2] : null);
        if (cookieToken) {
          activeToken = decodeURIComponent(cookieToken);
        }
      }
      return {
        Authorization: activeToken ? `Bearer ${activeToken}` : "",
      };
    },
    on: {
      connected: () => {
        console.log("[websocket-client] WebSocket successfully connected directly to Go backend.");
        useUIStore.getState().setWsStatus('Connected');
      },
      connecting: () => {
        useUIStore.getState().setWsStatus('Reconnecting');
      },
      closed: () => {
        useUIStore.getState().setWsStatus('Offline');
      },
      error: (err) => {
        console.error("[websocket-client] WebSocket connection error on target:", wsUrl, err);
        useUIStore.getState().setWsStatus('Offline');
      },
    }
  });

  // Subscribe explicitly to the operationalEventStream
  wsClient.subscribe(
    {
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
    {
      next: (data) => {
        const event = data.data?.operationalEventStream as AnomalyEvent;
        if (event) {
          // Directly mutate the TanStack Query cache without global refetch
          queryClient.setQueriesData<AnomalyEvent[]>({ queryKey: ['anomalyTimeline'] }, (oldData) => {
            if (!oldData) return [event];
            return [event, ...oldData];
          });
        }
      },
      error: (err) => console.error("WebSocket subscription error", err),
      complete: () => console.log("WebSocket subscription complete"),
    }
  );

  return wsClient;
};

export const getWebSocketClient = () => wsClient;
