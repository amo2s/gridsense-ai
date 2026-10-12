import { z } from "zod";
import { parseISO, isValid } from "date-fns";

/**
 * ============================================================================
 * ENGINE B INGESTION CONTRACT & BOUNDARY ENFORCEMENT
 * ============================================================================
 * Mirrors the Python Pydantic v2 contract defined in
 * `backend/ai-services/engine_b/schemas/inference_contracts.py`.
 * 
 * Guarantees schema consistency and temporal integrity on the client side
 * before transmitting manual 24h operational telemetry to the Go API Gateway.
 */

/**
 * Schema for an individual hourly telemetry reading.
 * Enforces physical electrical and physical bounds:
 * - Voltage: [0.0, 500.0]
 * - Load: [0.0, 1000.0]
 * - Fault Count Recent: integer >= 0
 */
export const TelemetryReadingSchema = z.object({
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
    ),
  voltage: z
    .number()
    .min(0.0, "Voltage must be strictly between 0.0 and 500.0 (inclusive)")
    .max(500.0, "Voltage must be strictly between 0.0 and 500.0 (inclusive)"),
  load: z
    .number()
    .min(0.0, "Load must be strictly between 0.0 and 1000.0 (inclusive)")
    .max(1000.0, "Load must be strictly between 0.0 and 1000.0 (inclusive)"),
  fault_count_recent: z
    .number()
    .int("Fault count must be an integer")
    .min(0, "Fault count must be greater than or equal to 0"),
});

export type TelemetryReading = z.infer<typeof TelemetryReadingSchema>;

/**
 * Schema for Engine B Ingestion & Inference Request.
 * Enforces feeder identification and rolling window temporal requirements.
 */
export const EngineBIngestRequestSchema = z
  .object({
    feeder_id: z
      .string()
      .trim()
      .uuid("Invalid Feeder UUID")
      .min(1),
    readings: z.array(TelemetryReadingSchema),
  })
  .superRefine((data, ctx) => {
    const { readings } = data;

    // Rule 1: Length Requirement (Minimum 24 sequential hourly readings)
    if (!readings || readings.length < 24) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Readings array must contain exactly 24 or more items representing an hourly rolling window.",
        path: ["readings"],
      });
      return;
    }

    const now = new Date();

    // Iterate through readings to enforce temporal ordering and zero future leakage
    for (let i = 0; i < readings.length; i++) {
      const currentParsed = parseISO(readings[i].timestamp);
      const isCurrentValid = isValid(currentParsed);

      // Rule 3: No Temporal Leakage (No timestamp can exist in the future relative to new Date())
      if (isCurrentValid && currentParsed.getTime() > now.getTime()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Telemetry reading cannot exist in the future relative to current time. Temporal leakage detected.",
          path: ["readings", i, "timestamp"],
        });
      }

      // Rule 2: Temporal Integrity (Strictly ascending chronological order)
      if (i > 0) {
        const prevParsed = parseISO(readings[i - 1].timestamp);
        const isPrevValid = isValid(prevParsed);

        if (isCurrentValid && isPrevValid) {
          if (currentParsed.getTime() <= prevParsed.getTime()) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: "Telemetry readings must be in strictly ascending chronological order.",
              path: ["readings", i, "timestamp"],
            });
          }
        }
      }
    }
  });

export type EngineBIngestRequest = z.infer<typeof EngineBIngestRequestSchema>;

/**
 * ============================================================================
 * EGRESS RESPONSE CONTRACTS (ENGINE B PREDICTION)
 * ============================================================================
 * Standardized egress payload returned from Engine B via the Go Gateway.
 */
export interface ShapFactor {
  feature_name: string;
  contribution: number;
}

export interface EgressPredictionResponse {
  feeder_id: string;
  generated_at: string;
  horizon_hours: number;
  risk_score: number;
  risk_level: "LOW" | "MEDIUM" | "HIGH";
  model_version: string;
  contributing_factors: ShapFactor[];
}
