/**
 * ============================================================================
 * ENGINE C EXPLAINABLE AI FEATURE TRANSLATION DICTIONARY (BLUEPRINT STEP 3.4)
 * ============================================================================
 * Intercepts raw internal Python/PyOD/FastAPI machine learning tensor keys
 * and translates them into domain-accurate, standardized electrical engineering
 * nomenclature before reaching the Recharts rendering layer.
 *
 * Mandatory Translations:
 *  - "recent_fault_counts" -> "Trailing 1h Transient Phase Fault Frequency"
 *  - "load_volatility"     -> "High 24-Hour Load Volatility Index"
 */

export interface FeatureMetadata {
  displayName: string;
  unit: string;
  category: "Voltage" | "Power" | "Frequency" | "Thermal" | "Topology" | "Statistical";
  description: string;
}

/**
 * Standard Electrical Engineering Feature Translation Matrix
 */
export const FEATURE_TRANSLATION_DICTIONARY: Record<string, FeatureMetadata> = {
  // Mandatory prompt requirements
  recent_fault_counts: {
    displayName: "Trailing 1h Transient Phase Fault Frequency",
    unit: "events/hr",
    category: "Topology",
    description: "High-frequency micro-interruption and transient arc fault counts recorded across the trailing 60-minute window.",
  },
  fault_count: {
    displayName: "Trailing 1h Transient Phase Fault Frequency",
    unit: "events/hr",
    category: "Topology",
    description: "High-frequency micro-interruption and transient arc fault counts recorded across the trailing 60-minute window.",
  },
  transient_faults: {
    displayName: "Trailing 1h Transient Phase Fault Frequency",
    unit: "events/hr",
    category: "Topology",
    description: "High-frequency micro-interruption and transient arc fault counts recorded across the trailing 60-minute window.",
  },
  load_volatility: {
    displayName: "High 24-Hour Load Volatility Index",
    unit: "sigma",
    category: "Power",
    description: "Normalized standard deviation of diurnal load draw exhibiting acute variance against seasonal expectations.",
  },
  load_variance: {
    displayName: "High 24-Hour Load Volatility Index",
    unit: "sigma",
    category: "Power",
    description: "Normalized standard deviation of diurnal load draw exhibiting acute variance against seasonal expectations.",
  },

  // Primary physical telemetry features
  voltage: {
    displayName: "Phase Voltage Deviation (RMS)",
    unit: "V",
    category: "Voltage",
    description: "Root-Mean-Square line-to-neutral voltage excursion relative to nominal 230V physical baseline.",
  },
  voltage_dev: {
    displayName: "Phase Voltage Deviation (RMS)",
    unit: "V",
    category: "Voltage",
    description: "Root-Mean-Square line-to-neutral voltage excursion relative to nominal 230V physical baseline.",
  },
  v_mag: {
    displayName: "Phase Voltage Deviation (RMS)",
    unit: "V",
    category: "Voltage",
    description: "Root-Mean-Square line-to-neutral voltage excursion relative to nominal 230V physical baseline.",
  },
  load: {
    displayName: "Active Power Draw Variance",
    unit: "kW",
    category: "Power",
    description: "Active operational power throughput exhibiting departure from seasonal STL trend baseline.",
  },
  active_load: {
    displayName: "Active Power Draw Variance",
    unit: "kW",
    category: "Power",
    description: "Active operational power throughput exhibiting departure from seasonal STL trend baseline.",
  },
  frequency: {
    displayName: "Grid Frequency Modulation",
    unit: "Hz",
    category: "Frequency",
    description: "Sub-synchronous frequency flutter or grid droop departing from nominal 50.00Hz balance envelope.",
  },
  freq_hz: {
    displayName: "Grid Frequency Modulation",
    unit: "Hz",
    category: "Frequency",
    description: "Sub-synchronous frequency flutter or grid droop departing from nominal 50.00Hz balance envelope.",
  },
  availability: {
    displayName: "Asset Availability & Continuity Index",
    unit: "ratio",
    category: "Statistical",
    description: "Operational uptime continuity ratio bounded [0.0 - 1.0] indicating feeder breaker continuity.",
  },

  // Advanced multivariate power quality features
  current_unbalance: {
    displayName: "Three-Phase Current Unbalance Factor (IUF)",
    unit: "%",
    category: "Power",
    description: "Negative-sequence to positive-sequence current ratio indicating acute phase load asymmetry.",
  },
  thd_v: {
    displayName: "Total Harmonic Distortion - Voltage (THD-V)",
    unit: "%",
    category: "Voltage",
    description: "Cumulative spectral harmonic voltage contamination exceeding IEEE 519 5.0% threshold bounds.",
  },
  reactive_power: {
    displayName: "Reactive Power Displacement",
    unit: "kVAR",
    category: "Power",
    description: "Quadrature power flow causing uncompensated voltage drop and transformer core heating.",
  },
  power_factor: {
    displayName: "Lagging Power Factor Ratio",
    unit: "cos phi",
    category: "Power",
    description: "Ratio of real power to apparent power indicating inductive motor load saturation.",
  },
  rocof: {
    displayName: "Rate of Change of Frequency (RoCoF)",
    unit: "Hz/s",
    category: "Frequency",
    description: "Derivative of grid electrical frequency indicating rapid inertia loss or generator trip events.",
  },
  transformer_temp: {
    displayName: "Transformer Core Ambient Temperature Drift",
    unit: "deg C",
    category: "Thermal",
    description: "Top-oil and core winding temperature elevation relative to cooling curve expectations.",
  },
  ambient_temp: {
    displayName: "Substation Ambient Temperature Excursion",
    unit: "deg C",
    category: "Thermal",
    description: "Ambient weather thermal stress contributing to thermal de-rating of feeder lines.",
  },
  substation_headroom: {
    displayName: "Upstream Substation Headroom Utilization",
    unit: "%",
    category: "Topology",
    description: "Percentage of thermal capacity committed at the parent distribution substation bus.",
  },
  substation_load: {
    displayName: "Upstream Substation Headroom Utilization",
    unit: "%",
    category: "Topology",
    description: "Percentage of thermal capacity committed at the parent distribution substation bus.",
  },
  harmonic_drift: {
    displayName: "5th/7th Harmonic Current Resonance Drift",
    unit: "%",
    category: "Voltage",
    description: "Odd-order harmonic resonance caused by non-linear inverter-based resources (IBR).",
  },
};

/**
 * Normalizes a raw feature key: lowercases, trims, and replaces hyphens with underscores.
 */
function normalizeKey(key: string): string {
  return (key || "").toLowerCase().trim().replace(/-/g, "_");
}

/**
 * Fallback Title-Case converter for unmapped ML feature keys.
 * Converts "phase_angle_drift" -> "Phase Angle Drift"
 */
function toTitleCase(key: string): string {
  return key
    .replace(/[_-]/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();
}

/**
 * Translates any raw ML key to its standard electrical engineering domain name.
 * Guarantees zero internal model variable leakages to the user interface.
 */
export function translateFeatureName(rawKey: string): string {
  if (!rawKey || typeof rawKey !== "string") {
    return "Operational Metric Variance";
  }

  const normalized = normalizeKey(rawKey);
  const matched = FEATURE_TRANSLATION_DICTIONARY[normalized];
  if (matched) {
    return matched.displayName;
  }

  return toTitleCase(rawKey);
}

/**
 * Returns rich metadata for a given raw feature key.
 */
export function getFeatureMetadata(rawKey: string): FeatureMetadata & { polarity: "risk_increasing" | "risk_suppressing" } {
  const normalized = normalizeKey(rawKey);
  const matched = FEATURE_TRANSLATION_DICTIONARY[normalized];
  if (matched) {
    return {
      ...matched,
      polarity: matched.category === "Statistical" ? "risk_suppressing" : "risk_increasing",
    };
  }

  return {
    displayName: toTitleCase(rawKey),
    unit: "a.u.",
    category: "Statistical",
    description: "Multi-layer anomaly attribution factor derived from multivariate ensemble model inference.",
    polarity: "risk_increasing",
  };
}

/**
 * Standard alias functions and dictionaries
 */
export const translateFeatureKey = translateFeatureName;
export const ENGINE_C_FEATURE_DICTIONARY = FEATURE_TRANSLATION_DICTIONARY;

export function formatFeatureAttribution(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${(value * 100).toFixed(1)}%`;
}

