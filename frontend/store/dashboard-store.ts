import { create } from 'zustand';

export type TimeRange = '24h' | '7d' | '30d';
export type WsStatus = 'optimal' | 'connecting' | 'offline';

interface DashboardState {
  activeFeeder: string;
  timeRange: TimeRange;
  wsStatus: WsStatus;
  setActiveFeeder: (feeder: string) => void;
  setTimeRange: (range: TimeRange) => void;
  setWsStatus: (status: WsStatus) => void;
}

export const useDashboardStore = create<DashboardState>((set) => ({
  activeFeeder: 'global',
  timeRange: '24h',
  wsStatus: 'connecting',
  setActiveFeeder: (feeder) => set({ activeFeeder: feeder }),
  setTimeRange: (range) => set({ timeRange: range }),
  setWsStatus: (status) => set({ wsStatus: status }),
}));
