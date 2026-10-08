import { createClient, Client } from 'graphql-ws';
import { useUIStore } from '@/store/ui-store';
import { QueryClient } from '@tanstack/react-query';
import { AnomalyEvent } from '@/lib/graphql/generated';

let wsClient: Client | null = null;

const getWebSocketUrl = (): string => {
  if (typeof window === 'undefined') {
    return ''; // SSR safety
  }
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${wsProtocol}//${window.location.host}/api/ws-proxy`;
};

export const initializeWebSocket = (token: string | undefined, queryClient: QueryClient) => {
  if (wsClient) return wsClient;

  const wsUrl = getWebSocketUrl();
  
  console.log("Attempting WS connection to:", wsUrl);

  wsClient = createClient({
    url: wsUrl,
    connectionParams: async () => {
      let currentToken = token;
      if (typeof window !== "undefined") {
        const match1 = document.cookie.match(new RegExp('(^| )gridsense_session=([^;]+)'));
        const match2 = document.cookie.match(new RegExp('(^| )auth_token=([^;]+)'));
        const cookieToken = (match1 ? match1[2] : null) || (match2 ? match2[2] : null);
        if (cookieToken) {
          currentToken = cookieToken;
        }
      }
      return {
        Authorization: currentToken ? `Bearer ${currentToken}` : "",
      };
    },
    on: {
      connected: () => {
        useUIStore.getState().setWsStatus('Connected');
      },
      connecting: () => {
        useUIStore.getState().setWsStatus('Reconnecting');
      },
      closed: () => {
        useUIStore.getState().setWsStatus('Offline');
      },
      error: (err) => {
        console.error("WebSocket connection error on target:", wsUrl, err);
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
