/**
 * ============================================================================
 * XAI HUMANIZATION DICTIONARY & FEATURE FORMATTER
 * ============================================================================
 * Maps raw Python ML feature keys to operational electrical engineering nomenclature.
 * Used for Engine B TreeSHAP mathematical explainability rendering.
 */

export const SHAP_FEATURE_DICTIONARY: Record<string, string> = {
  // Core Operational Voltage Metrics
  voltage: "Bus Voltage",
  voltage_mean_12h: "12h Voltage Baseline Mean",
  voltage_sag_depth: "Voltage Sag Depth",
  voltage_thd: "Total Harmonic Distortion",
  voltage_unbalance: "Phase Voltage Unbalance",

  // Feeder Load & Demand Dynamics
  load: "Active Feeder Load",
  load_volatility: "Load Volatility Index",
  load_volatility_24h: "24h Load Volatility Index",
  peak_load_ratio: "Peak Capacity Utilization",
  apparent_power: "Apparent Power Demand",

  // Transient Disturbance & Fault Frequencies
  fault_count_recent: "Recent Transient Fault Frequency",
  fault_count_24h: "24h Transient Fault Frequency",
  fault_count: "Transient Fault Occurrences",
  momentary_interruption: "Momentary Interruption Count",

  // Diurnal & Temporal Periodicity
  hour_sin: "Diurnal Peak Alignment",
  hour_cos: "Diurnal Peak Alignment (Cos)",
  time_of_day: "Diurnal Operating Cycle",
  day_of_week: "Weekly Load Profile Periodicity",

  // Environmental & Grid Health Factors
  ambient_temperature: "Ambient Transformer Temperature",
  transformer_temp: "Transformer Core Temperature",
  insulation_age: "Asset Thermal Aging Factor",
  feeder_capacity_mw: "Feeder Thermal Limit (MW)",
};

/**
 * Transforms a raw machine-learning feature string into human-readable engineering nomenclature.
 * Falls back to title-cased sentence formatting if the key is not in the explicit dictionary.
 *
 * @param key - Raw feature name string (e.g. "voltage_sag_depth", "load_volatility")
 * @returns Humanized operational label (e.g. "Voltage Sag Depth", "Load Volatility Index")
 */
export function formatShapFeature(key: string): string {
  if (!key) return "";

  const trimmed = key.trim();
  if (SHAP_FEATURE_DICTIONARY[trimmed]) {
    return SHAP_FEATURE_DICTIONARY[trimmed];
  }

  // Fallback: replace underscores with spaces and capitalize each word
  return trimmed
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}
