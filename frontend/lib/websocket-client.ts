import { createClient, Client } from 'graphql-ws';
import { useUIStore } from '@/store/ui-store';
import { QueryClient } from '@tanstack/react-query';
import { AnomalyEvent } from '@/lib/graphql/generated';

let wsClient: Client | null = null;

export const initializeWebSocket = (token: string | undefined, queryClient: QueryClient) => {
  if (wsClient) return wsClient;

  const wsUrl = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8080/query";
  
  wsClient = createClient({
    url: wsUrl,
    connectionParams: {
      Authorization: token ? `Bearer ${token}` : "",
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
      error: () => {
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
