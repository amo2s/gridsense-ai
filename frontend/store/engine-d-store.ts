import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

/**
 * Normalizes an identifier string (UUID or code) by trimming whitespace
 * and enforcing lowercase transformation.
 */
export const normalizeEngineDId = (id: string | null | undefined): string | null => {
  if (id === null || id === undefined) return null;
  const trimmed = id.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
};

export interface EngineDState {
  /** Currently active grid area/region identifier (UUID) driving the query_id parameter */
  activeAreaId: string | null;

  /** Array of lowercase feeder UUID strings currently staged for batch ranking */
  selectedFeeders: string[];

  /** Currently selected single feeder within the ranked list for drill-down/XAI inspection */
  activeFeederId: string | null;

  /** Set or clear the active grid area identifier */
  setActiveAreaId: (areaId: string | null | undefined) => void;

  /** Bulk set the list of selected feeder identifiers */
  setSelectedFeeders: (feeders: string[]) => void;

  /** Toggle membership of a specific feeder identifier in selectedFeeders */
  toggleSelectedFeeder: (feederId: string) => void;

  /** Set the specific feeder active for inspection */
  setActiveFeederId: (feederId: string | null | undefined) => void;

  /** Reset all Engine D selections to default empty state */
  resetSelection: () => void;
}

export const DEFAULT_ENGINE_D_AREA_ID = "7a8b9c0d-1e2f-4a5b-8c9d-0e1f2a3b4c5d";
export const DEFAULT_ENGINE_D_FEEDERS = [
  "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "a1b2c3d4-e5f6-4a5b-8c9d-112233445566",
  "b2c3d4e5-f6a7-4b5c-9d0e-223344556677",
];

/**
 * Engine D Isolated Zustand Store (Phase 1)
 *
 * Dedicated to multi-asset listwise ranking without interfering with
 * Engine A, B, or C's single-feeder session contexts.
 */
export const useEngineDStore = create<EngineDState>()(
  persist(
    (set) => ({
      activeAreaId: DEFAULT_ENGINE_D_AREA_ID,
      selectedFeeders: DEFAULT_ENGINE_D_FEEDERS,
      activeFeederId: DEFAULT_ENGINE_D_FEEDERS[0] ?? null,

      setActiveAreaId: (areaId: string | null | undefined) => {
        const normalized = normalizeEngineDId(areaId);
        set({ activeAreaId: normalized });
      },

      setSelectedFeeders: (feeders: string[]) => {
        const normalized = feeders
          .map((f) => normalizeEngineDId(f))
          .filter((f): f is string => Boolean(f));
        set({
          selectedFeeders: normalized,
          // If activeFeederId is no longer in the list, fall back to the first available
          activeFeederId: normalized[0] ?? null,
        });
      },

      toggleSelectedFeeder: (feederId: string) => {
        const normalized = normalizeEngineDId(feederId);
        if (!normalized) return;

        set((state) => {
          const exists = state.selectedFeeders.includes(normalized);
          const next = exists
            ? state.selectedFeeders.filter((f) => f !== normalized)
            : [...state.selectedFeeders, normalized];

          return {
            selectedFeeders: next,
            activeFeederId:
              state.activeFeederId === normalized
                ? next[0] ?? null
                : state.activeFeederId ?? next[0] ?? null,
          };
        });
      },

      setActiveFeederId: (feederId: string | null | undefined) => {
        const normalized = normalizeEngineDId(feederId);
        set({ activeFeederId: normalized });
      },

      resetSelection: () => {
        set({
          activeAreaId: null,
          selectedFeeders: [],
          activeFeederId: null,
        });
      },
    }),
    {
      name: "gridsense-engine-d-context",
      storage: createJSONStorage(() => {
        if (typeof window !== "undefined") {
          return window.sessionStorage;
        }
        return {
          getItem: () => null,
          setItem: () => {},
          removeItem: () => {},
        };
      }),
      partialize: (state) => ({
        activeAreaId: state.activeAreaId,
        selectedFeeders: state.selectedFeeders,
        activeFeederId: state.activeFeederId,
      }),
      merge: (persistedState, currentState) => {
        const persisted = (persistedState as Partial<EngineDState>) || {};
        return {
          ...currentState,
          ...persisted,
          activeAreaId: normalizeEngineDId(persisted.activeAreaId) ?? currentState.activeAreaId,
          selectedFeeders: Array.isArray(persisted.selectedFeeders)
            ? persisted.selectedFeeders
                .map((f) => normalizeEngineDId(f))
                .filter((f): f is string => Boolean(f))
            : currentState.selectedFeeders,
          activeFeederId: normalizeEngineDId(persisted.activeFeederId) ?? currentState.activeFeederId,
        };
      },
    }
  )
);
