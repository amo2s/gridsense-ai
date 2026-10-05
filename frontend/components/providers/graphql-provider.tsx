"use client";

import React, { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createClient } from "graphql-ws";
import { useDashboardStore } from "@/store/dashboard-store";

export const GraphQLWsContext = React.createContext<any>(null);

export default function GraphQLProvider({
  token,
  children,
}: {
  token: string | undefined;
  children: React.ReactNode;
}) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30000, // 30 seconds
        retry: 3,
        retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      },
    },
  }));
  const [wsClient] = useState(() => {
    let wsUrl = "ws://127.0.0.1:7860/query";
    if (typeof window !== "undefined") {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const host = window.location.host;
      wsUrl = `${protocol}//${host}/query`;
    }
    
    const client = createClient({
      url: wsUrl,
      connectionParams: {
        Authorization: token ? `Bearer ${token}` : "",
      },
    });

    return client;
  });

  React.useEffect(() => {
    let isMounted = true;
    
    const checkHealth = async () => {
      try {
        const res = await fetch("/api/proxy/healthz");
        if (isMounted) {
          if (res.ok) {
            useDashboardStore.getState().setWsStatus('optimal');
          } else {
            useDashboardStore.getState().setWsStatus('offline');
          }
        }
      } catch (error) {
        if (isMounted) {
          useDashboardStore.getState().setWsStatus('offline');
        }
      }
    };

    checkHealth(); // run immediately on mount
    const interval = setInterval(checkHealth, 60000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  return (
    <GraphQLWsContext.Provider value={wsClient}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </GraphQLWsContext.Provider>
  );
}
