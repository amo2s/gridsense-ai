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

    client.on('connected', () => useDashboardStore.getState().setWsStatus('optimal'));
    client.on('closed', () => useDashboardStore.getState().setWsStatus('offline'));
    client.on('error', () => useDashboardStore.getState().setWsStatus('offline'));
    client.on('connecting', () => useDashboardStore.getState().setWsStatus('connecting'));
    client.on('pong', () => useDashboardStore.getState().setWsStatus('optimal'));
    
    // Setup ping interval if needed or rely on server pings.
    // graphql-ws natively sends pings if keepAlive is enabled server-side.
    // We update status on pong.

    return client;
  });

  return (
    <GraphQLWsContext.Provider value={wsClient}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </GraphQLWsContext.Provider>
  );
}
