import { useEffect, useContext } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { GraphQLWsContext } from "@/components/providers/graphql-provider";

export function useOperationalStream() {
  const queryClient = useQueryClient();
  const wsClient = useContext(GraphQLWsContext);

  useEffect(() => {
    if (!wsClient) return;

    const unsubscribe = wsClient.subscribe(
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
        next: (data: any) => {
          if (data?.data?.operationalEventStream) {
            const newEvent = data.data.operationalEventStream;
            
            // Manually unshift the new anomaly into the top of the existing cache
            queryClient.setQueryData(["dashboard-metrics"], (oldData: any) => {
              if (!oldData) return { anomalyTimeline: [newEvent] };
              
              const currentAnomalies = oldData.anomalyTimeline || [];
              return {
                ...oldData,
                anomalyTimeline: [newEvent, ...currentAnomalies],
              };
            });
          }
        },
        error: (err: any) => {
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
