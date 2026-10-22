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

  /** Query ID returned from Engine D batch ingestion endpoint */
  queryId: string | null;

  /** Array of lowercase feeder UUID strings currently staged for batch ranking */
  selectedFeeders: string[];

  /** Currently selected single feeder within the ranked list for drill-down/XAI inspection */
  activeFeederId: string | null;

  /** Set or clear the active grid area identifier */
  setActiveAreaId: (areaId: string | null | undefined) => void;

  /** Set or clear the query ID returned by ingestion */
  setQueryId: (queryId: string | null | undefined) => void;

  /** Bulk set the list of selected feeder identifiers */
  setSelectedFeeders: (feeders: string[]) => void;

  /** Toggle membership of a specific feeder identifier in selectedFeeders */
  toggleSelectedFeeder: (feederId: string) => void;

  /** Set the specific feeder active for inspection */
  setActiveFeederId: (feederId: string | null | undefined) => void;

  /** Reset all Engine D selections to default empty state */
  resetSelection: () => void;
}

/**
 * Engine D Isolated Zustand Store (Phase 1)
 *
 * Dedicated to multi-asset listwise ranking without interfering with
 * Engine A, B, or C's single-feeder session contexts.
 */
export const useEngineDStore = create<EngineDState>()(
  persist(
    (set) => ({
      activeAreaId: null,
      queryId: null,
      selectedFeeders: [],
      activeFeederId: null,

      setActiveAreaId: (areaId: string | null | undefined) => {
        const normalized = normalizeEngineDId(areaId);
        set({ activeAreaId: normalized });
      },

      setQueryId: (queryId: string | null | undefined) => {
        const normalized = normalizeEngineDId(queryId);
        set({ queryId: normalized });
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
          queryId: null,
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
        queryId: state.queryId,
        selectedFeeders: state.selectedFeeders,
        activeFeederId: state.activeFeederId,
      }),
      merge: (persistedState, currentState) => {
        const persisted = (persistedState as Partial<EngineDState>) || {};
        return {
          ...currentState,
          ...persisted,
          activeAreaId: normalizeEngineDId(persisted.activeAreaId) ?? currentState.activeAreaId,
          queryId: normalizeEngineDId(persisted.queryId) ?? currentState.queryId,
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
