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

export type TrendDataPoint = {
  timestamp: string;
  value: number;
};

export type FeatureDeviation = {
  featureName: string;
  shapAttribution: number;
  deviationDescription: string;
};

export type IntelligenceInsight = {
  anomalyId: string;
  confidenceScore: number;
  reasons: string[];
  featureDeviations: FeatureDeviation[];
};

export type AcknowledgeAlertResult = {
  success: boolean;
};

export type LogInterventionResult = {
  success: boolean;
};
