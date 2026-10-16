"use client";

import React, { useState, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { initializeWebSocketClient, closeWebSocket } from "@/lib/websocket-client";

export default function QueryProvider({
  token,
  children,
}: {
  token: string | undefined;
  children: React.ReactNode;
}) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30000, // 30 seconds for dynamic metrics (5 mins static topology handled in specific hooks if needed)
        retry: 3,
        retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000), // exponential backoff
      },
    },
  }));

  useEffect(() => {
    let isMounted = true;

    // Isolate WebSocket connection logic from standard HTTP rendering with strict async token fetching
    const init = async () => {
      try {
        const client = await initializeWebSocketClient(token, queryClient);
        if (!isMounted && client) {
          client.close(1000, "Component unmounted during initialization");
        }
      } catch (err) {
        console.error("[QueryProvider] Failed to initialize WebSocket client:", err);
      }
    };

    init();

    return () => {
      isMounted = false;
      closeWebSocket();
    };
  }, [token, queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
