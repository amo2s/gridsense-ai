"use client";

import React, { useState, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { initializeWebSocket } from "@/lib/websocket-client";

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
    // Isolate WebSocket connection logic from standard HTTP rendering
    const wsClient = initializeWebSocket(token, queryClient);
    
    return () => {
      // We don't necessarily dispose it strictly here if it's singleton, but we could
    };
  }, [token, queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
