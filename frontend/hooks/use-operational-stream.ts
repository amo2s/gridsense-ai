import { useEffect, useContext } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { GraphQLWsContext } from "@/components/providers/graphql-provider";
import { AnomalyEvent } from "@/lib/graphql/generated";

interface OperationalEventStreamResponse {
  data: {
    operationalEventStream: AnomalyEvent;
  };
}

export function useOperationalStream() {
  const queryClient = useQueryClient();
  const wsClient = useContext(GraphQLWsContext);

  useEffect(() => {
    if (!wsClient) return;

    const unsubscribe = wsClient.subscribe(
      {
        query: `
          subscription OperationalEventStream {
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
        next: (response: unknown) => {
          const data = response as OperationalEventStreamResponse;
          if (data?.data?.operationalEventStream) {
            const newEvent = data.data.operationalEventStream;
            
            // Manually unshift the new anomaly into the top of the existing cache
            queryClient.setQueryData<{ anomalyTimeline: AnomalyEvent[] }>(["dashboard-metrics"], (oldData) => {
              if (!oldData) return { anomalyTimeline: [newEvent] };
              
              const currentAnomalies = oldData.anomalyTimeline || [];
              return {
                ...oldData,
                anomalyTimeline: [newEvent, ...currentAnomalies],
              };
            });

            if (typeof window !== 'undefined') {
              window.dispatchEvent(new Event('websocket-message'));
            }
          }
        },
        error: (err: unknown) => {
          console.error("GraphQL Subscription Error:", err);
        },
        complete: () => {
          console.log("GraphQL Subscription Complete");
        },
      }
    );

    return () => {
      unsubscribe();
    };
  }, [wsClient, queryClient]);
}
