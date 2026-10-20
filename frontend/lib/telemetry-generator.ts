/**
 * @module telemetry-generator
 * @description Pure utility for synthesizing presentation-grade diurnal grid telemetry.
 */

import type { TelemetryReading } from "@/types/engine-b-ingestion";

export interface SynthesizedTelemetryRow {
  timestamp: string;
  voltage: number;
  load: number;
  frequency: number;
  availability: number;
}

export type EngineBSynthesizedTelemetryRow = TelemetryReading;

export const generateDiurnalBaseline = (startDate: Date = new Date()): SynthesizedTelemetryRow[] => {
  const baseline: SynthesizedTelemetryRow[] = [];
  
  // Anchor to the start of the current day (00:00:00)
  const anchorDate = new Date(startDate);
  anchorDate.setHours(0, 0, 0, 0);

  for (let hour = 0; hour < 24; hour++) {
    const currentStep = new Date(anchorDate.getTime() + hour * 60 * 60 * 1000);
    
    // Calculate mathematical diurnal load (Peak at 18:00)
    const baseLoad = 350.0;
    const amplitude = 250.0;
    const loadPhase = (hour - 18) * (Math.PI / 12);
    const mathematicalLoad = baseLoad + amplitude * Math.cos(loadPhase);

    // Inject environmental noise bounds
    const voltageNoise = (Math.random() * 3) - 1.5;     // ±1.5V
    const frequencyNoise = (Math.random() * 0.08) - 0.04; // ±0.04Hz
    const loadNoise = (Math.random() * 30) - 15;        // ±15kW

    baseline.push({
      timestamp: currentStep.toISOString(),
      voltage: parseFloat((230.0 + voltageNoise).toFixed(2)),
      load: parseFloat((mathematicalLoad + loadNoise).toFixed(2)),
      frequency: parseFloat((50.0 + frequencyNoise).toFixed(3)),
      availability: 1.0, // 100% availability for nominal baseline
    });
  }

  return baseline;
};

/**
 * Generates a presentation-grade 24-hour diurnal operational baseline tailored
 * to Engine B's outage risk evaluation schema (timestamp, voltage, load, fault_count_recent).
 * Maintains exact mathematical parity with Engine C's diurnal load curve (350.0 kW base,
 * 250.0 kW amplitude, peak at 18:00 UTC) and bounded stochastic voltage noise (±1.5 V).
 */
export const generateEngineBDiurnalBaseline = (startDate: Date = new Date()): TelemetryReading[] => {
  const baseline: TelemetryReading[] = [];

  // Anchor to the start of the current day (00:00:00)
  const anchorDate = new Date(startDate);
  anchorDate.setHours(0, 0, 0, 0);

  for (let hour = 0; hour < 24; hour++) {
    const currentStep = new Date(anchorDate.getTime() + hour * 60 * 60 * 1000);

    // Calculate mathematical diurnal load (Peak at 18:00 UTC)
    const baseLoad = 350.0;
    const amplitude = 250.0;
    const loadPhase = (hour - 18) * (Math.PI / 12);
    const mathematicalLoad = baseLoad + amplitude * Math.cos(loadPhase);

    // Inject environmental noise bounds
    const voltageNoise = (Math.random() * 3) - 1.5;     // ±1.5V
    const loadNoise = (Math.random() * 30) - 15;        // ±15kW

    // Stochastic fault count: nominal baseline defaults to 0 with 5% probability of minor anomaly
    const fault_count_recent = Math.random() < 0.05 ? 1 : 0;

    baseline.push({
      timestamp: currentStep.toISOString(),
      voltage: parseFloat((230.0 + voltageNoise).toFixed(2)),
      load: parseFloat((mathematicalLoad + loadNoise).toFixed(2)),
      fault_count_recent,
    });
  }

  return baseline;
};
