import { create } from 'zustand';

export type TimeRange = '24h' | '7d' | '30d';
export type WsStatus = 'Connected' | 'Reconnecting' | 'Offline';

interface UIState {
  activeFeederContext: string | null;
  timeRange: TimeRange;
  wsStatus: WsStatus;
  setActiveFeederContext: (feeder: string | null) => void;
  setTimeRange: (range: TimeRange) => void;
  setWsStatus: (status: WsStatus) => void;
}

export const useUIStore = create<UIState>((set) => ({
  activeFeederContext: null,
  timeRange: '24h',
  wsStatus: 'Offline',
  setActiveFeederContext: (feeder) => set({ activeFeederContext: feeder }),
  setTimeRange: (range) => set({ timeRange: range }),
  setWsStatus: (status) => set({ wsStatus: status }),
}));
