import { z } from "zod";

/**
 * ============================================================================
 * ENGINE D DATA CONTRACTS & VALIDATION SCHEMAS (PRIORITIZATION & RANKING)
 * ============================================================================
 * Strictly mirrors:
 * - Python FastAPI Pydantic v2 schemas:
 *   backend/ai-services/engine_d/schemas/ranking_contracts.py
 * - Go Gateway DTO structs:
 *   backend/services/gateway/handlers/prioritization_handler.go
 */

export type PriorityTier = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

/**
 * Zod schema for a single feeder's fused cross-engine intelligence state.
 * Combines signals from Engine A (Reliability), Engine B (Risk), and Engine C (Anomaly).
 */
export const MultiEngineSignalsSchema = z.object({
  feeder_id: z
    .string()
    .trim()
    .min(1, "Target feeder identifier is required"),
  
  // Engine A (Reliability) Signals
  reliability_score: z
    .number()
    .min(0.0, "Reliability score must be >= 0.0")
    .max(100.0, "Reliability score must be <= 100.0"),
  duration_penalty: z
    .number()
    .min(0.0, "Duration penalty must be >= 0.0")
    .max(1.0, "Duration penalty must be <= 1.0"),
  frequency_penalty: z
    .number()
    .min(0.0, "Frequency penalty must be >= 0.0")
    .max(1.0, "Frequency penalty must be <= 1.0"),

  // Engine B (Risk) Signals
  risk_score: z
    .number()
    .min(0.0, "Risk score must be >= 0.0")
    .max(100.0, "Risk score must be <= 100.0"),

  // Engine C (Anomaly) Signals
  is_anomaly: z.boolean(),
  anomaly_confidence: z
    .number()
    .min(0.0, "Anomaly confidence must be >= 0.0")
    .max(1.0, "Anomaly confidence must be <= 1.0"),
});

export type MultiEngineSignals = z.infer<typeof MultiEngineSignalsSchema>;

/**
 * Zod schema for Engine D batch prioritization request.
 * Enforces minimum 2 assets for LightGBM LambdaMART listwise ranking.
 */
export const PrioritizationRequestSchema = z.object({
  query_id: z
    .string()
    .trim()
    .uuid("query_id must be a valid UUID representing an operational area"),
  assets: z
    .array(MultiEngineSignalsSchema)
    .min(2, "Listwise ranking requires a minimum of 2 feeder assets"),
});

export type PrioritizationRequest = z.infer<typeof PrioritizationRequestSchema>;

/**
 * Feature contribution attribution (SHAP)
 */
export interface ShapAttribution {
  feature_name: string;
  contribution: number;
}

/**
 * Single ranked grid asset output
 */
export interface RankedAsset {
  feeder_id: string;
  rank_position: number;
  priority_score: number;
  priority_tier: PriorityTier;
  explanations: ShapAttribution[];
  base_value?: number;
  intervention_id?: string;
}

/**
 * Root Engine D Prioritization Response
 */
export interface PrioritizationResponse {
  event_id?: string;
  source_engine?: string;
  event_type?: string;
  query_id: string;
  generated_at: string;
  model_version: string;
  ranked_assets: RankedAsset[];
}

/**
 * Action taken on an intervention recommendation
 */
export type InterventionAction = "dispatched" | "deferred" | "ignored";

export interface LogInterventionPayload {
  alert_id?: string;
  feeder_id: string;
  operator_id?: string;
  action_taken: InterventionAction;
  notes?: string;
  timestamp: string;
}
