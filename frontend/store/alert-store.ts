import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type AlertSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "NORMAL" | "RESTORED";

export interface GridAlert {
  id: string;
  feeder_id: string;
  substation_id?: string | null;
  severity: AlertSeverity | string;
  is_critical: boolean;
  message: string;
  timestamp: string;
  read: boolean;
  acknowledged: boolean;
}

export interface AlertState {
  alerts: GridAlert[];
  unreadCriticalCount: number;
  totalUnreadCount: number;

  /** Prepend an incoming real-time SSE alert */
  addAlert: (alert: {
    id?: string;
    stream_id?: string;
    feeder_id: string;
    substation_id?: string | null;
    severity?: AlertSeverity | string;
    is_critical?: boolean;
    message?: string;
    timestamp?: string;
    read?: boolean;
    acknowledged?: boolean;
  }) => void;

  /** Acknowledge and resolve a single alert by ID */
  acknowledgeAlert: (id: string) => void;

  /** Acknowledge and mark all alerts as resolved */
  acknowledgeAll: () => void;

  /** Mark a specific alert as read without resolving */
  markAsRead: (id: string) => void;

  /** Mark all alerts as read */
  markAllAsRead: () => void;

  /** Clear all historical alerts */
  clearAlerts: () => void;
}

const INITIAL_ALERTS: GridAlert[] = [
  {
    id: "alert-init-01",
    feeder_id: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    substation_id: "Central District",
    severity: "CRITICAL",
    is_critical: true,
    message: "Critical multivariate anomaly threshold breach detected by Engine C.",
    timestamp: new Date(Date.now() - 1000 * 60 * 4).toISOString(), // 4 mins ago
    read: false,
    acknowledged: false,
  },
  {
    id: "alert-init-02",
    feeder_id: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    substation_id: "Central District",
    severity: "MEDIUM",
    is_critical: false,
    message: "High 24-Hour Load Volatility Index excursion (+2.4σ above seasonal expectation).",
    timestamp: new Date(Date.now() - 1000 * 60 * 18).toISOString(), // 18 mins ago
    read: false,
    acknowledged: false,
  },
  {
    id: "alert-init-03",
    feeder_id: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    substation_id: "Central District",
    severity: "RESTORED",
    is_critical: false,
    message: "Nominal operational state restored on Feeder f47ac10b. Voltage stabilization confirmed.",
    timestamp: new Date(Date.now() - 1000 * 60 * 45).toISOString(), // 45 mins ago
    read: true,
    acknowledged: true,
  },
];

function calculateCounts(alerts: GridAlert[]) {
  const unreadCriticalCount = alerts.filter(
    (a) => (a.is_critical || a.severity === "CRITICAL" || a.severity === "HIGH") && !a.acknowledged && !a.read
  ).length;

  const totalUnreadCount = alerts.filter((a) => !a.read && !a.acknowledged).length;

  return { unreadCriticalCount, totalUnreadCount };
}

export const useAlertStore = create<AlertState>()(
  persist(
    (set, get) => ({
      alerts: INITIAL_ALERTS,
      unreadCriticalCount: calculateCounts(INITIAL_ALERTS).unreadCriticalCount,
      totalUnreadCount: calculateCounts(INITIAL_ALERTS).totalUnreadCount,

      addAlert: (incoming) => {
        const id = incoming.id || incoming.stream_id || `alert-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        const existing = get().alerts;

        // Prevent duplicate insertions of the same event id
        if (existing.some((a) => a.id === id)) {
          return;
        }

        const isCritical =
          Boolean(incoming.is_critical) ||
          incoming.severity === "CRITICAL" ||
          incoming.severity === "HIGH";

        const newAlert: GridAlert = {
          id,
          feeder_id: incoming.feeder_id,
          substation_id: incoming.substation_id,
          severity: incoming.severity || (isCritical ? "CRITICAL" : "MEDIUM"),
          is_critical: isCritical,
          message: incoming.message || `Grid threshold anomaly detected on Feeder ${incoming.feeder_id}`,
          timestamp: incoming.timestamp || new Date().toISOString(),
          read: incoming.read ?? false,
          acknowledged: incoming.acknowledged ?? false,
        };

        const updated = [newAlert, ...existing].slice(0, 100); // Retain trailing 100 alerts
        const counts = calculateCounts(updated);

        set({
          alerts: updated,
          unreadCriticalCount: counts.unreadCriticalCount,
          totalUnreadCount: counts.totalUnreadCount,
        });
      },

      acknowledgeAlert: (id: string) => {
        const updated = get().alerts.map((a) =>
          a.id === id ? { ...a, acknowledged: true, read: true } : a
        );
        const counts = calculateCounts(updated);
        set({
          alerts: updated,
          unreadCriticalCount: counts.unreadCriticalCount,
          totalUnreadCount: counts.totalUnreadCount,
        });
      },

      acknowledgeAll: () => {
        const updated = get().alerts.map((a) => ({
          ...a,
          acknowledged: true,
          read: true,
        }));
        set({
          alerts: updated,
          unreadCriticalCount: 0,
          totalUnreadCount: 0,
        });
      },

      markAsRead: (id: string) => {
        const updated = get().alerts.map((a) =>
          a.id === id ? { ...a, read: true } : a
        );
        const counts = calculateCounts(updated);
        set({
          alerts: updated,
          unreadCriticalCount: counts.unreadCriticalCount,
          totalUnreadCount: counts.totalUnreadCount,
        });
      },

      markAllAsRead: () => {
        const updated = get().alerts.map((a) => ({
          ...a,
          read: true,
        }));
        const counts = calculateCounts(updated);
        set({
          alerts: updated,
          unreadCriticalCount: counts.unreadCriticalCount,
          totalUnreadCount: counts.totalUnreadCount,
        });
      },

      clearAlerts: () => {
        set({
          alerts: [],
          unreadCriticalCount: 0,
          totalUnreadCount: 0,
        });
      },
    }),
    {
      name: "gridsense:alerts:v1",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        alerts: state.alerts,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          const counts = calculateCounts(state.alerts || []);
          state.unreadCriticalCount = counts.unreadCriticalCount;
          state.totalUnreadCount = counts.totalUnreadCount;
        }
      },
    }
  )
);
