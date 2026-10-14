import { z } from "zod";
import { parseISO, isValid } from "date-fns";

/**
 * ============================================================================
 * ENGINE C INGESTION CONTRACT & BOUNDARY ENFORCEMENT (PHASE 1, STEP 1.2)
 * ============================================================================
 * Perfectly mirrors the Python Pydantic v2 boundary contracts defined in:
 * `backend/ai-services/engine_c/schemas/anomaly_contracts.py`.
 *
 * Enforces:
 *  1. Sliding Window Constraint (Minimum 24 sequential hourly readings).
 *  2. Physical and Electrical Bounds:
 *     - Voltage: [0.0, 500.0] V
 *     - Load: >= 0.0 kW (Amperes or active power)
 *     - Frequency: >= 0.0 Hz
 *     - Availability: [0.0, 1.0] index
 *  3. Temporal Integrity:
 *     - Zero Future Leakage: timestamp <= current UTC time at validation moment.
 *     - Strictly Ascending Chronological Order: timestamp[i] > timestamp[i-1].
 */

/**
 * Schema for an individual hourly telemetry reading.
 * Traps physical and electrical violations at the client boundary.
 */
export const EngineCTelemetryReadingSchema = z.object({
  timestamp: z
    .string()
    .min(1, "Timestamp is required")
    .refine(
      (val) => {
        const parsed = parseISO(val);
        return isValid(parsed);
      },
      {
        message: "Timestamp must be a valid ISO-8601 UTC string",
      }
    )
    .refine(
      (val) => {
        const parsed = parseISO(val);
        if (!isValid(parsed)) return true;
        // Anti-temporal leakage: cannot exist in the future
        return parsed.getTime() <= Date.now();
      },
      {
        message: "Temporal leakage detected: timestamp cannot originate in the future relative to current UTC time",
      }
    ),
  voltage: z
    .number()
    .min(0.0, "Voltage reading must be greater than or equal to 0.0V")
    .max(500.0, "Voltage reading exceeds maximum allowable 500.0V threshold"),
  load: z
    .number()
    .min(0.0, "Active load draw cannot be negative; must be greater than or equal to 0.0 kW"),
  frequency: z
    .number()
    .min(0.0, "Grid frequency cannot be negative; must be greater than or equal to 0.0 Hz"),
  availability: z
    .number()
    .min(0.0, "Availability index must be greater than or equal to 0.0")
    .max(1.0, "Availability index exceeds maximum allowable threshold of 1.0"),
});

export type EngineCTelemetryReading = z.infer<typeof EngineCTelemetryReadingSchema>;

/**
 * Root Schema: Engine C Telemetry Window Schema.
 * Enforces 24-step sliding window requirement and strict chronological monotonicity.
 */
export const EngineCTelemetryWindowSchema = z
  .object({
    feeder_id: z
      .string()
      .trim()
      .min(1, "Target feeder identifier is required"),
    substation_id: z
      .string()
      .trim()
      .nullable()
      .optional(),
    readings: z
      .array(EngineCTelemetryReadingSchema)
      .min(
        24,
        "Rolling window insufficient: array must contain a minimum of 24 discrete telemetry readings for machine learning ingestion"
      ),
  })
  .superRefine((data, ctx) => {
    const { readings } = data;

    // Rule 1: Window size guardrail
    if (!readings || readings.length < 24) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Rolling window insufficient: payload requires at least 24 readings for Engine C algorithms (current: ${readings ? readings.length : 0}).`,
        path: ["readings"],
      });
      return;
    }

    const now = Date.now();

    // Iterate through readings to enforce temporal ordering and anti-leakage
    for (let i = 0; i < readings.length; i++) {
      const current = readings[i];
      const currentParsed = parseISO(current.timestamp);
      const isCurrentValid = isValid(currentParsed);

      // Rule 2: Zero Future Temporal Leakage
      if (isCurrentValid && currentParsed.getTime() > now) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Reading #${i + 1} timestamp (${current.timestamp}) originates in the future relative to current time. Temporal leakage detected.`,
          path: ["readings", i, "timestamp"],
        });
      }

      // Rule 3: Strict Ascending Chronological Order
      if (i > 0) {
        const prev = readings[i - 1];
        const prevParsed = parseISO(prev.timestamp);
        const isPrevValid = isValid(prevParsed);

        if (isCurrentValid && isPrevValid) {
          if (currentParsed.getTime() <= prevParsed.getTime()) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `Reading #${i + 1} timestamp (${current.timestamp}) must be strictly greater than preceding reading #${i} timestamp (${prev.timestamp}). Chronological monotonicity required.`,
              path: ["readings", i, "timestamp"],
            });
          }
        }
      }
    }
  });

export type EngineCTelemetryWindow = z.infer<typeof EngineCTelemetryWindowSchema>;
