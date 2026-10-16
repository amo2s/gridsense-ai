"use client";

import { useCallback } from "react";
import { toast } from "sonner";
import { useAlertStore, GridAlert } from "@/store/alert-store";
import { useFeederStore } from "@/store/feeder-store";

// Re-export WebSocket URL resolution utilities for backwards compatibility
export { convertHttpToWsProtocol, getWebSocketUrl } from "@/lib/websocket-client";

/**
 * ============================================================================
 * GLOBAL ALERT STREAM HOOK (CONSOLIDATED - NETWORK-FREE)
 * ============================================================================
 * Provides component-level access to the unified alert state without establishing
 * duplicate WebSocket connections. The native WebSocket lifecycle is now centrally
 * managed by the singleton client in `@/lib/websocket-client.ts` initialized in QueryProvider.
 */
export function useGlobalAlertStream() {
  const alerts = useAlertStore((state) => state.alerts);
  const unreadCriticalCount = useAlertStore((state) => state.unreadCriticalCount);
  const totalUnreadCount = useAlertStore((state) => state.totalUnreadCount);
  const addAlert = useAlertStore((state) => state.addAlert);
  const activeFeederId = useFeederStore((state) => state.activeFeederId);

  // Programmatic simulation helper allowing tests and operator drills without external network dependencies
  const simulateCriticalAlert = useCallback(
    async (feederId?: string, customMessage?: string) => {
      const target = feederId || activeFeederId || "f47ac10b-58cc-4372-a567-0e02b2c3d479";
      const alertItem: GridAlert = {
        id: `sim-${Date.now()}`,
        feeder_id: target,
        substation_id: null,
        severity: "CRITICAL",
        is_critical: true,
        message:
          customMessage ||
          `Simulated Critical Anomaly on Feeder ${target}: Out-of-cycle refetch triggered!`,
        timestamp: new Date().toISOString(),
        read: false,
        acknowledged: false,
      };

      addAlert(alertItem);
      toast.error(alertItem.message, {
        description: `Originating Feeder: ${target} • Severity: CRITICAL`,
        duration: 8000,
      });
    },
    [activeFeederId, addAlert]
  );

  return {
    alerts,
    unreadCriticalCount,
    totalUnreadCount,
    simulateCriticalAlert,
  };
}
