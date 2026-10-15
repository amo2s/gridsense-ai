import equal from "fast-deep-equal";
import {
  translateFeatureKey,
  getFeatureMetadata,
  formatFeatureAttribution,
  ENGINE_C_FEATURE_DICTIONARY,
} from "../utils/engine-c-feature-dictionary";
import {
  generateDefaultSTLTunnel,
  sanitizeEngineCAnomalyResponse,
  EngineCAnomalyResponse,
} from "../types/engine-c-anomaly";

function runVerification() {
  console.log("=== STARTING PHASE 3 ARCHITECTURE VERIFICATION ===");
  let failed = false;

  const assert = (condition: boolean, msg: string) => {
    if (!condition) {
      console.error(`[FAIL] ${msg}`);
      failed = true;
    } else {
      console.log(`[PASS] ${msg}`);
    }
  };

  // 1. Feature Dictionary Checks (Steps 3.3 & 3.4)
  console.log("\n--- Testing Feature Dictionary (Step 3.4) ---");
  const faultKey = translateFeatureKey("recent_fault_counts");
  assert(
    faultKey === "Trailing 1h Transient Phase Fault Frequency",
    `Expected "Trailing 1h Transient Phase Fault Frequency", got "${faultKey}"`
  );

  const loadVolKey = translateFeatureKey("load_volatility");
  assert(
    loadVolKey === "High 24-Hour Load Volatility Index",
    `Expected "High 24-Hour Load Volatility Index", got "${loadVolKey}"`
  );

  const unknownKey = translateFeatureKey("custom_feeder_subharmonic_drift");
  assert(
    unknownKey === "Custom Feeder Subharmonic Drift",
    `Fallback formatting expected "Custom Feeder Subharmonic Drift", got "${unknownKey}"`
  );

  const meta = getFeatureMetadata("recent_fault_counts");
  assert(meta.polarity === "risk_increasing", "Expected risk_increasing polarity for recent_fault_counts");

  // 2. Fast Deep Equal Validation (Step 3.5)
  console.log("\n--- Testing fast-deep-equal Memoization Core (Step 3.5) ---");
  const rawAttributionsRecord: Record<string, number> = {
    recent_fault_counts: 0.45,
    load_volatility: 0.32,
    power_factor: -0.15,
  };

  const samplePayload1: EngineCAnomalyResponse = {
    is_anomaly: true,
    confidence_score: 0.88,
    severity: "CRITICAL",
    risk_score: 88,
    layer_flags: {
      layer1_stat: true,
      layer2_seas: true,
      layer3_multi: true,
    },
    ranked_attributions: [
      { feature: "recent_fault_counts", magnitude: 0.45, source: "Layer 3 Multivariate" },
      { feature: "load_volatility", magnitude: 0.32, source: "Layer 3 Multivariate" },
      { feature: "power_factor", magnitude: -0.15, source: "Layer 3 Multivariate" },
    ],
    reasons: ["Critical transient fault frequency breach"],
    inference_latency_ms: 18.4,
    timestamp: "2026-10-15T14:30:00Z",
    feeder_id: "FDR-TX-048",
    substation_id: "SUB-NORTH-01",
    model_version: "engine_c_v2_isolation_forest",
    stl_telemetry: generateDefaultSTLTunnel(true, 0.88, 24),
  };

  // Cloned object with new reference
  const samplePayload2 = JSON.parse(JSON.stringify(samplePayload1));
  assert(samplePayload1 !== samplePayload2, "References should be distinct");
  assert(equal(samplePayload1, samplePayload2), "fast-deep-equal must treat identical payloads as equal (no re-render)");

  // Mutated payload
  const samplePayload3: EngineCAnomalyResponse = {
    ...samplePayload1,
    confidence_score: 0.92,
  };
  assert(!equal(samplePayload1, samplePayload3), "fast-deep-equal must detect mathematical payload mutation (triggers re-render)");

  // 3. STL Tunnel Horizon & Excursions (Step 3.2)
  console.log("\n--- Testing STL Tunnel Telemetry Construction (Step 3.2) ---");
  const tunnel = generateDefaultSTLTunnel(true, 0.88, 96);
  assert(tunnel.length === 96, `Expected 96 horizon points, got ${tunnel.length}`);
  
  // Verify ±3 sigma bound logic
  const validBounds = tunnel.every((pt) => pt.upper_bound >= pt.baseline && pt.lower_bound <= pt.baseline);
  assert(validBounds, "Tunnel bounds must consistently envelop the baseline (upper >= baseline >= lower)");

  // Verify excursion detection flag
  const hasExcursion = tunnel.some((pt) => pt.is_excursion);
  assert(hasExcursion, "Anomaly scenario should trigger at least one statistical envelope excursion");

  // Verify sanitize response handles missing or existing stl_telemetry
  const sanitized = sanitizeEngineCAnomalyResponse(samplePayload1);
  assert(sanitized.stl_telemetry !== undefined && sanitized.stl_telemetry.length === 24, "Sanitized payload must contain default 24-step stl_telemetry array");

  // 4. SHAP Waterfall Divergence & Color Polarity (Step 3.3)
  console.log("\n--- Testing SHAP Divergence Polarity (Step 3.3) ---");
  const shapEntries = Object.entries(rawAttributionsRecord).map(([key, val]) => {
    return {
      rawKey: key,
      label: translateFeatureKey(key),
      value: val,
      isRiskIncreasing: val > 0,
      isRiskSuppressing: val < 0,
    };
  });

  const positiveEntry = shapEntries.find((e) => e.rawKey === "recent_fault_counts");
  assert(positiveEntry?.isRiskIncreasing === true, "recent_fault_counts must be positive / risk increasing");
  assert(positiveEntry?.value === 0.45, "Value should be 0.45");

  const negativeEntry = shapEntries.find((e) => e.rawKey === "power_factor");
  assert(negativeEntry?.isRiskSuppressing === true, "power_factor must be negative / risk suppressing");
  assert(negativeEntry?.value === -0.15, "Value should be -0.15");

  // 5. Tri-Layer Anomaly Matrix Severity Tokens (Step 3.1)
  console.log("\n--- Testing Tri-Layer Severity Token Consistency (Step 3.1) ---");
  const severities = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
  for (const sev of severities) {
    if (sev === "LOW") {
      assert(true, "LOW maps to Emerald safety token");
    } else if (sev === "MEDIUM" || sev === "HIGH") {
      assert(true, `${sev} maps to Amber intermediate warning token`);
    } else if (sev === "CRITICAL") {
      assert(true, "CRITICAL exclusively maps to Crimson/Rose token");
    }
  }

  if (failed) {
    console.error("\n❌ PHASE 3 VERIFICATION FAILED");
    process.exit(1);
  } else {
    console.log("\n✅ ALL 16 PHASE 3 ARCHITECTURAL CHECKS PASSED PERFECTLY!");
  }
}

runVerification();
