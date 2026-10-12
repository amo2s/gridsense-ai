import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export interface ActiveFeederInfo {
  id: string;
  name: string;
  substation: string;
  voltageClass?: string;
  status?: string;
}

export interface FeederState {
  /** Currently active single feeder context across all engines (e.g., 'f47ac10b-58cc-4372-a567-0e02b2c3d479') */
  activeFeederId: string;
  /** Active feeder rich metadata object (name, substation, voltageClass, status) */
  activeFeeder: ActiveFeederInfo | null;
  /** Array of selected feeders for multi-asset comparison views */
  selectedFeeders: string[];
  /** Sets the primary active feeder and guarantees it exists in selectedFeeders */
  setActiveFeeder: (id: string, metadata?: Partial<ActiveFeederInfo>) => void;
  /** Clears active feeder context */
  clearActiveFeeder: () => void;
  /** Bulk set selected feeders array */
  setSelectedFeeders: (feeders: string[]) => void;
  /** Toggles feeder membership in selectedFeeders array */
  toggleSelectedFeeder: (id: string) => void;
}

export const DEFAULT_FEEDER_ID = "f47ac10b-58cc-4372-a567-0e02b2c3d479";

export const DEFAULT_FEEDER_INFO: ActiveFeederInfo = {
  id: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  name: "North Corridor Feeder",
  substation: "Central District",
  voltageClass: "33kV",
  status: "STABLE",
};

/**
 * Global Feeder Store (Phase 0: Global State Synchronization)
 *
 * Serves as the single source of truth for grid asset selection across
 * Engine A, Engine B, and all future analytical engines (Engines C & D).
 *
 * Persisted strictly to browser `sessionStorage` via Zustand persist middleware.
 * Ensures state persists across route navigation and page reloads during an active
 * operator session, while cleanly resetting upon session termination.
 */
export const useFeederStore = create<FeederState>()(
  persist(
    (set) => ({
      activeFeederId: DEFAULT_FEEDER_ID,
      activeFeeder: DEFAULT_FEEDER_INFO,
      selectedFeeders: [DEFAULT_FEEDER_ID],

      setActiveFeeder: (id: string, metadata?: Partial<ActiveFeederInfo>) => {
        const normalizedId = id.trim().toLowerCase();
        set((state) => {
          let nextFeeder: ActiveFeederInfo;
          if (metadata && metadata.name && metadata.substation) {
            nextFeeder = {
              id: normalizedId,
              name: metadata.name,
              substation: metadata.substation,
              voltageClass: metadata.voltageClass || "33kV",
              status: metadata.status || "STABLE",
            };
          } else if (normalizedId === DEFAULT_FEEDER_ID.toLowerCase()) {
            nextFeeder = DEFAULT_FEEDER_INFO;
          } else {
            nextFeeder = {
              id: normalizedId,
              name: metadata?.name || `Feeder ${normalizedId.substring(0, 8)}`,
              substation: metadata?.substation || "Grid Operations",
              voltageClass: metadata?.voltageClass || "33kV",
              status: metadata?.status || "STABLE",
            };
          }

          return {
            activeFeederId: normalizedId,
            activeFeeder: nextFeeder,
            selectedFeeders: state.selectedFeeders.includes(normalizedId)
              ? state.selectedFeeders
              : [...state.selectedFeeders, normalizedId],
          };
        });
      },

      clearActiveFeeder: () =>
        set({
          activeFeederId: "",
          activeFeeder: null,
          selectedFeeders: [],
        }),

      setSelectedFeeders: (feeders: string[]) =>
        set({
          selectedFeeders: feeders.map((f) => f.trim().toLowerCase()),
        }),

      toggleSelectedFeeder: (id: string) => {
        const normalizedId = id.trim().toLowerCase();
        set((state) => {
          const exists = state.selectedFeeders.includes(normalizedId);
          const next = exists
            ? state.selectedFeeders.filter((f) => f !== normalizedId)
            : [...state.selectedFeeders, normalizedId];

          return {
            selectedFeeders: next,
            // If the active feeder was removed, fallback to the next available or empty
            activeFeederId:
              state.activeFeederId === normalizedId
                ? next[0] || ""
                : state.activeFeederId || next[0] || "",
          };
        });
      },
    }),
    {
      name: "gridsense-active-feeder-context",
      storage: createJSONStorage(() => {
        // SSR Safe Storage Provider for Next.js App Router
        if (typeof window !== "undefined") {
          return window.sessionStorage;
        }
        return {
          getItem: () => null,
          setItem: () => {},
          removeItem: () => {},
        };
      }),
    }
  )
);
