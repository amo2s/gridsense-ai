/**
 * ============================================================================
 * ENGINE C ANOMALY INTELLIGENCE DATA CONTRACTS & NORMALIZATION (PHASE 2)
 * ============================================================================
 * Defines data structures and the defensive normalization layer for the
 * Query Pathway at `/dashboard/engine-c`.
 *
 * Aligns strictly with:
 *  - Go Gateway: AnomalyResponse (`backend/services/gateway/handlers/anomaly_handler.go`)
 *  - Python FastAPI: Engine C Contracts (`backend/ai-services/engine_c/schemas/anomaly_contracts.py`)
 */

export type AnomalySeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface EngineCTelemetryReadingPayload {
  feeder_id: string;
  timestamp: string;
  voltage: number;
  load: number;
  frequency: number;
  availability: number;
}

export interface EngineCAnomalyRequestPayload {
  feeder_id: string;
  time_horizon: number;
  resolution?: string;
  confidence_threshold?: number;
  readings?: EngineCTelemetryReadingPayload[];
}

export interface AttributionFactor {
  feature: string;
  magnitude: number;
  source: string;
}

export interface LayerFlags {
  layer1_stat: boolean;
  layer2_seas: boolean;
  layer3_multi: boolean;
}

export interface STLTunnelPoint {
  timestamp: string;
  timeLabel: string;
  observed: number; // Real-time observed telemetry throughput (kW)
  baseline: number; // Seasonal-Trend decomposition baseline expectation
  upper_bound: number; // Dynamic upper bound (+3 standard deviations: +3 sigma)
  lower_bound: number; // Dynamic lower bound (-3 standard deviations: -3 sigma)
  residual: number; // Observed excursion delta from baseline
  is_excursion: boolean; // Flagged true when observed telemetry breaks outside [lower, upper]
}

export interface EngineCAnomalyResponse {
  feeder_id: string;
  substation_id?: string | null;
  timestamp: string;
  is_anomaly: boolean;
  severity: AnomalySeverity;
  confidence_score: number; // 0.0 to 1.0
  risk_score: number; // 0 to 100 aggregate operational risk
  layer_flags: LayerFlags;
  ranked_attributions: AttributionFactor[];
  reasons: string[];
  inference_latency_ms: number;
  model_version: string;
  stl_telemetry: STLTunnelPoint[];
}

export interface RedisAlertEvent {
  stream_id?: string;
  feeder_id: string;
  substation_id?: string | null;
  severity: AnomalySeverity | string;
  message?: string;
  timestamp: string;
  is_critical?: boolean;
}

/**
 * Deterministically generates a 24-step diurnal STL confidence tunnel
 * aligned with the 24-hour telemetry horizon of the electrical feeder.
 */
export function generateDefaultSTLTunnel(
  isAnomaly = false,
  confidenceScore = 0,
  steps = 24
): STLTunnelPoint[] {
  const now = new Date();
  return Array.from({ length: steps }).map((_, i) => {
    const stepDate = new Date(now.getTime() - (steps - 1 - i) * (86400000 / steps));
    const hour = stepDate.getUTCHours();
    const minute = stepDate.getUTCMinutes();
    const timeLabel =
      steps > 24
        ? `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
        : `${String(hour).padStart(2, "0")}:00`;

    // 24-Hour Diurnal Physical Curve (520kW seasonal baseline with daylight peak)
    const diurnalSine = Math.sin(((hour - 6) * Math.PI) / 12);
    const baseline = Number((520 + 85 * diurnalSine).toFixed(1));
    const sigma = 24.5;
    const upperBound = Number((baseline + 3 * sigma).toFixed(1)); // +3 sigma upper bound
    const lowerBound = Number((baseline - 3 * sigma).toFixed(1)); // -3 sigma lower bound

    // Natural minor fluctuation within normal envelope
    const noise = ((i % 5) - 2) * 3.8;
    let observed = Number((baseline + noise).toFixed(1));
    let isExcursion = false;

    // In anomalous states, induce excursions on trailing steps
    if (isAnomaly && (i >= steps - 5 && i % 2 === 0)) {
      const excursionSeverity = confidenceScore > 0.8 ? 1.75 : 1.35;
      observed = Number((upperBound + (36 * excursionSeverity)).toFixed(1));
      isExcursion = true;
    }

    const residual = Number((observed - baseline).toFixed(1));

    return {
      timestamp: stepDate.toISOString(),
      timeLabel,
      observed,
      baseline,
      upper_bound: upperBound,
      lower_bound: lowerBound,
      residual,
      is_excursion: isExcursion,
    };
  });
}

/**
 * ============================================================================
 * DEFENSIVE DATA NORMALIZATION LAYER (PHASE 2 & PHASE 3)
 * ============================================================================
 * Transformer function systematically injected into the TanStack Query select
 * pipeline (`select: (data) => sanitizeEngineCAnomalyResponse(data, feederId)`).
 *
 * Primary mandate:
 * Intercept null, undefined, or missing arrays during database cold starts.
 * Specifically replaces null `ranked_attributions` and `reasons` with empty
 * arrays (`[]`) to mathematically eliminate iteration exceptions in Recharts
 * and Canvas rendering pipelines in Phase 3.
 */
export function sanitizeEngineCAnomalyResponse(
  raw: any,
  fallbackFeederId = "",
  fallbackSubstationId: string | null = null
): EngineCAnomalyResponse {
  if (!raw || typeof raw !== "object") {
    return {
      feeder_id: fallbackFeederId,
      substation_id: fallbackSubstationId,
      timestamp: new Date().toISOString(),
      is_anomaly: false,
      severity: "LOW",
      confidence_score: 0.0,
      risk_score: 0,
      layer_flags: {
        layer1_stat: false,
        layer2_seas: false,
        layer3_multi: false,
      },
      ranked_attributions: [],
      reasons: [],
      inference_latency_ms: 0,
      model_version: "engine_c_v2_isolation_forest",
      stl_telemetry: generateDefaultSTLTunnel(false, 0),
    };
  }

  // Step 2.2: Intercept and sanitize ranked_attributions: guaranteed [] on cold start / null
  let sanitizedAttributions: AttributionFactor[] = [];
  if (Array.isArray(raw.ranked_attributions)) {
    sanitizedAttributions = raw.ranked_attributions
      .filter((item: any) => item && typeof item === "object")
      .map((item: any) => ({
        feature:
          typeof item.feature === "string" && item.feature.trim().length > 0
            ? item.feature.trim()
            : "Unknown Feature",
        magnitude:
          typeof item.magnitude === "number" && !Number.isNaN(item.magnitude)
            ? item.magnitude
            : 0,
        source:
          typeof item.source === "string" && item.source.trim().length > 0
            ? item.source.trim()
            : "Layer 3 Multivariate",
      }));
  }

  // Step 2.2: Intercept and sanitize reasons: guaranteed [] on cold start / null
  let sanitizedReasons: string[] = [];
  if (Array.isArray(raw.reasons)) {
    sanitizedReasons = raw.reasons
      .filter((r: any) => typeof r === "string" && r.trim().length > 0)
      .map((r: string) => r.trim());
  }

  // Sanitize layer flags audit trail
  const rawFlags = raw.layer_flags || {};
  const layer_flags: LayerFlags = {
    layer1_stat: Boolean(rawFlags.layer1_stat),
    layer2_seas: Boolean(rawFlags.layer2_seas),
    layer3_multi: Boolean(rawFlags.layer3_multi),
  };

  // Severity normalization
  let severity: AnomalySeverity = "LOW";
  const rawSeverity = String(raw.severity || "").toUpperCase().trim();
  if (rawSeverity === "CRITICAL") severity = "CRITICAL";
  else if (rawSeverity === "HIGH") severity = "HIGH";
  else if (rawSeverity === "MEDIUM" || rawSeverity === "MODERATE") severity = "MEDIUM";

  // Confidence score bounded strictly [0.0, 1.0]
  const confidence_score =
    typeof raw.confidence_score === "number" && !Number.isNaN(raw.confidence_score)
      ? Math.max(0, Math.min(1.0, raw.confidence_score))
      : 0;

  // Derive risk_score in [0, 100] for visual stratification (Step 2.4)
  let risk_score = 0;
  if (typeof raw.risk_score === "number" && !Number.isNaN(raw.risk_score)) {
    risk_score = Math.round(Math.max(0, Math.min(100, raw.risk_score)));
  } else {
    risk_score = Math.round(confidence_score * 100);
  }

  // Latency & model lineage
  const inference_latency_ms =
    typeof raw.inference_latency_ms === "number" && !Number.isNaN(raw.inference_latency_ms)
      ? raw.inference_latency_ms
      : 0;

  const model_version =
    typeof raw.model_version === "string" && raw.model_version.trim().length > 0
      ? raw.model_version.trim()
      : "engine_c_v2_isolation_forest";

  // Timestamp validation
  const timestamp =
    typeof raw.timestamp === "string" && !Number.isNaN(Date.parse(raw.timestamp))
      ? raw.timestamp
      : new Date().toISOString();

  const feeder_id =
    typeof raw.feeder_id === "string" && raw.feeder_id.trim().length > 0
      ? raw.feeder_id.trim()
      : fallbackFeederId;

  const substation_id =
    typeof raw.substation_id === "string" && raw.substation_id.trim().length > 0
      ? raw.substation_id.trim()
      : fallbackSubstationId;

  // Step 3.2: Sanitize or generate STL confidence tunnel telemetry
  let sanitizedSTLTelemetry: STLTunnelPoint[] = [];
  if (Array.isArray(raw.stl_telemetry) && raw.stl_telemetry.length > 0) {
    sanitizedSTLTelemetry = raw.stl_telemetry
      .filter((p: any) => p && typeof p === "object")
      .map((p: any, idx: number) => {
        const baseline = typeof p.baseline === "number" && !Number.isNaN(p.baseline) ? p.baseline : 500;
        const upperBound = typeof p.upper_bound === "number" && !Number.isNaN(p.upper_bound) ? p.upper_bound : baseline + 75;
        const lowerBound = typeof p.lower_bound === "number" && !Number.isNaN(p.lower_bound) ? p.lower_bound : baseline - 75;
        const observed = typeof p.observed === "number" && !Number.isNaN(p.observed) ? p.observed : baseline;
        const isExcursion = typeof p.is_excursion === "boolean" ? p.is_excursion : (observed > upperBound || observed < lowerBound);
        const residual = typeof p.residual === "number" && !Number.isNaN(p.residual) ? p.residual : (observed - baseline);
        return {
          timestamp: typeof p.timestamp === "string" ? p.timestamp : new Date(Date.now() - (24 - idx) * 3600000).toISOString(),
          timeLabel: typeof p.timeLabel === "string" ? p.timeLabel : `${String(idx).padStart(2, "0")}:00`,
          observed,
          baseline,
          upper_bound: upperBound,
          lower_bound: lowerBound,
          residual,
          is_excursion: isExcursion,
        };
      });
  } else {
    sanitizedSTLTelemetry = generateDefaultSTLTunnel(Boolean(raw.is_anomaly), confidence_score);
  }

  return {
    feeder_id,
    substation_id,
    timestamp,
    is_anomaly: Boolean(raw.is_anomaly),
    severity,
    confidence_score,
    risk_score,
    layer_flags,
    ranked_attributions: sanitizedAttributions,
    reasons: sanitizedReasons,
    inference_latency_ms,
    model_version,
    stl_telemetry: sanitizedSTLTelemetry,
  };
}
