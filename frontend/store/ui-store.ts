import { create } from 'zustand';

export type TimeRange = '24h' | '7d' | '30d';
export type WsStatus = 'Connected' | 'Reconnecting' | 'Offline';
export type DataStreamStatus = 'REAL' | 'SYNTHETIC' | 'DEGRADED';

interface UIState {
  activeFeederContext: string | null;
  timeRange: TimeRange;
  wsStatus: WsStatus;
  dataStreamStatus: DataStreamStatus;
  setActiveFeederContext: (feeder: string | null) => void;
  setTimeRange: (range: TimeRange) => void;
  setWsStatus: (status: WsStatus) => void;
  setDataStreamStatus: (status: DataStreamStatus) => void;
}

export const useUIStore = create<UIState>((set) => ({
  activeFeederContext: null,
  timeRange: '24h',
  wsStatus: 'Offline',
  dataStreamStatus: 'REAL',
  setActiveFeederContext: (feeder) => set({ activeFeederContext: feeder }),
  setTimeRange: (range) => set({ timeRange: range }),
  setWsStatus: (status) => set({ wsStatus: status }),
  setDataStreamStatus: (status) => set({ dataStreamStatus: status }),
}));
