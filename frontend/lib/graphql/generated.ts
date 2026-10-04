export type AnomalyEvent = {
  id: string;
  areaId: string;
  eventType: string;
  severity: string;
  timestamp: string;
  description: string;
};

export type DashboardSummary = {
  overallReliabilityScore: number;
  activeHighRiskAreas: number;
  totalActiveAlerts: number;
};

export type PriorityArea = {
  id: string;
  name: string;
  urgencyRank: number;
  riskScore: number;
  status: string;
};
