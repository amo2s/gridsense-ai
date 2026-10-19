"use client";

import React, { useEffect } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { motion, AnimatePresence } from "framer-motion";
import { 
  ShieldAlert, 
  Layers, 
  Send, 
  Plus, 
  Trash2, 
  CheckCircle2, 
  AlertCircle,
  Database,
  Building2,
  Zap,
  Activity,
  Gauge,
  Clock,
  RefreshCw,
  Radio
} from "lucide-react";
import { toast } from "sonner";
import { useFeederStore } from "@/store/feeder-store";
import {
  EngineCTelemetryWindowSchema,
  EngineCTelemetryWindow,
} from "@/types/engine-c-ingestion";
import { 
  useEngineCFSM, 
  parsePydanticRejection 
} from "@/hooks/use-engine-c-fsm";
import RejectionInspectorPanel from "@/components/ingestion/rejection-inspector-panel";
import { Button } from "@/components/ui/button";

const GATEWAY_TIMEOUT_MS = 8000;

/**
 * ============================================================================
 * ENGINE C MANUAL TELEMETRY INGESTION FORM (COMMAND PATHWAY - STEPS 1.3 & 1.4)
 * ============================================================================
 * Governed by a 5-State Finite State Machine (FSM):
 *  - Initializing | Connected | Receiving Data | Schema Error | Timeout
 * Enforces:
 *  - 8-Second (8000ms) AbortController timeout budget
 *  - Interception & translation of HTTP 400/422 Pydantic v2 error responses
 *  - Liquid Glass Rejection Inspector Panel
 *  - Idempotent Retry actions without data array mutation
 */
export default function EngineCForm() {
  const activeFeederId = useFeederStore((state) => state.activeFeederId);
  const activeSubstationId = useFeederStore((state) => state.activeSubstationId);
  const activeFeeder = useFeederStore((state) => state.activeFeeder);

  // Phase 1.3: Deterministic Finite State Machine
  const {
    context: fsm,
    dispatch,
    isSubmitting: isFSMSubmitting,
    abortControllerRef,
  } = useEngineCFSM();

  const {
    register,
    control,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<EngineCTelemetryWindow>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(EngineCTelemetryWindowSchema) as any,
    defaultValues: {
      feeder_id: activeFeederId || "",
      substation_id: activeSubstationId || null,
      readings: [],
    },
  });

  const { fields, replace, append, remove } = useFieldArray({
    control,
    name: "readings",
  });

  // Keep feeder_id and substation_id synchronized with global store without triggering full form re-renders
  useEffect(() => {
    if (activeFeederId) {
      setValue("feeder_id", activeFeederId, { shouldValidate: true });
    }
    setValue("substation_id", activeSubstationId || null);
  }, [activeFeederId, activeSubstationId, setValue]);

  /**
   * Core Network Dispatcher with 8-Second AbortController and HTTP 400/422 Translation
   */
  const executeSubmission = async (data: EngineCTelemetryWindow) => {
    // FSM Guard: Transition allowed ONLY if not already in flight
    if (fsm.state === "Connected" || fsm.state === "Receiving Data") {
      console.warn("[FSM Guard] Network submission already in flight. Duplicate dispatch prevented.");
      return;
    }

    dispatch({ type: "INITIATE_SUBMISSION" });

    // Step 1.3: Instantiate AbortController bound to 8000ms budget
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const timeoutTimer = setTimeout(() => {
      controller.abort();
      console.error("Gateway request timed out after 8000ms budget exceeded.");
      dispatch({
        type: "TIMEOUT_TRIGGERED",
        error: `Go API Gateway execution budget of ${GATEWAY_TIMEOUT_MS}ms exceeded. Connection severed by client AbortController.`,
      });
      toast.error("Go Gateway timeout: 8-second budget exceeded. Connection severed.");
    }, GATEWAY_TIMEOUT_MS);

    try {
      // Transition to Receiving Data
      dispatch({ type: "CONNECTION_ESTABLISHED" });

      const requestHeaders: Record<string, string> = {
        "Content-Type": "application/json",
      };

      const res = await fetch("/api/proxy/v1/anomaly/ingest", {
        method: "POST",
        headers: requestHeaders,
        body: JSON.stringify(data),
        signal: controller.signal,
      });

      clearTimeout(timeoutTimer);

      // Step 1.4: Intercept HTTP 400 and HTTP 422 Pydantic v2 rejections
      if (res.status === 400 || res.status === 422) {
        let errJson: unknown = null;
        try {
          errJson = await res.json();
        } catch {
          errJson = { detail: "Failed to parse structured JSON rejection payload from Gateway." };
        }

        const parsedRejection = parsePydanticRejection(res.status, errJson);
        dispatch({ type: "REJECTION_INTERCEPTED", rejection: parsedRejection });
        toast.error(`Upstream HTTP ${res.status}: ${parsedRejection.errorCount} boundary violations intercepted.`);
        return;
      }

      if (!res.ok) {
        const errText = await res.text();
        const fallbackRejection = parsePydanticRejection(res.status, { error: errText });
        dispatch({ type: "REJECTION_INTERCEPTED", rejection: fallbackRejection });
        toast.error(`Gateway returned HTTP ${res.status}.`);
        return;
      }

      const responseData = await res.json();
      dispatch({ type: "SUCCESS_RECEIVED", response: responseData });
      toast.success("Command payload successfully ingested and validated by Go Gateway!");
    } catch (err: any) {
      clearTimeout(timeoutTimer);

      if (err.name === "AbortError") {
        // If aborted by the 8-second timer
        return;
      }

      const networkRejection = parsePydanticRejection(500, {
        error: err.message || "Network transmission to Go Gateway failed.",
      });
      dispatch({ type: "REJECTION_INTERCEPTED", rejection: networkRejection });
      toast.error(err.message || "Network transmission failed.");
    }
  };

  /**
   * Idempotent Retry Action: Re-initiates submission without mutating readings or timestamps
   */
  const handleIdempotentRetry = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const currentValues = (control as any)._formValues as EngineCTelemetryWindow;
    if (currentValues && currentValues.readings && currentValues.readings.length >= 24) {
      dispatch({ type: "IDEMPOTENT_RETRY" });
      executeSubmission(currentValues);
    } else {
      handleSubmit((data) => executeSubmission(data))();
    }
  };

  // State 0: Unified Empty State when Feeder Context is unselected
  if (!activeFeederId) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        className="flex flex-col items-center justify-center p-12 text-center rounded-3xl bg-amber-500/10 border border-amber-500/25 backdrop-blur-2xl shadow-[inset_1px_1px_2px_rgba(255,255,255,0.8),inset_-1px_-1px_3px_rgba(255,255,255,0.1)] shadow-[0_16px_40px_-8px_rgba(15,23,42,0.1)]"
      >
        <div className="p-4 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-600 mb-4 shadow-sm">
          <ShieldAlert className="w-10 h-10 animate-pulse" />
        </div>
        <h3 className="text-xl font-semibold text-slate-800 mb-2">
          Grid Asset Context Unassigned
        </h3>
        <p className="text-sm text-slate-600 max-w-md leading-relaxed">
          Engine C multivariate anomaly ingestion requires an active hierarchical asset binding. 
          Please select a feeder from the global asset selector in the navigation sidebar before staging manual telemetry.
        </p>
      </motion.div>
    );
  }

  const readingsCount = fields.length;
  const isWindowComplete = readingsCount >= 24;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rootReadingsError = errors.readings?.root?.message || (!Array.isArray(errors.readings) && (errors.readings as any)?.message);

  return (
    <form onSubmit={handleSubmit((data) => executeSubmission(data))} className="space-y-6">
      {/* Matrix Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-200/60">
        <div>
          <h3 className="text-base font-semibold text-slate-900">
            24-Hour Telemetry Matrix
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Stage hourly operational vectors for multivariate anomaly analysis
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isFSMSubmitting}
            onClick={() => {
              append({
                timestamp: new Date().toISOString(),
                voltage: 230.0,
                load: 500.0,
                frequency: 50.0,
                availability: 1.0,
              });
            }}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Row</span>
          </Button>
        </div>
      </div>

      {/* Rejection Inspector Panel (Rendered when in Schema Error) */}
      {fsm.state === "Schema Error" && fsm.rejection && (
        <RejectionInspectorPanel
          rejection={fsm.rejection}
          onRetry={handleIdempotentRetry}
          onDismiss={() => dispatch({ type: "RESET" })}
          isRetrying={isFSMSubmitting}
        />
      )}

      {/* Timeout Callout Panel */}
      {fsm.state === "Timeout" && (
        <motion.div
          initial={{ opacity: 0, y: -8, scale: 0.99 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          className="rounded-3xl border border-amber-500/35 bg-white/30 backdrop-blur-2xl bg-gradient-to-br from-white/75 via-amber-50/25 to-white/10 p-6 shadow-[inset_1px_1px_2px_rgba(255,255,255,0.9),inset_-1px_-1px_3px_rgba(255,255,255,0.1)] shadow-[0_20px_50px_-12px_rgba(245,158,11,0.18)] flex flex-col gap-4"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-amber-200/50">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-600 shadow-xs">
                <Clock className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <h3 className="text-sm font-bold tracking-tight text-amber-950">
                  Gateway Execution Timeout
                </h3>
                <p className="text-xs text-amber-800/80 mt-0.5">
                  The API Gateway did not respond within the allocated time window.
                </p>
              </div>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white/60 border border-white/80 text-xs text-slate-700 leading-relaxed flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
            <p className="text-xs text-slate-600">
              The request was safely severed to preserve data integrity. You may re-attempt transmission without modifying your staged telemetry.
            </p>

            <Button
              type="button"
              size="sm"
              variant="danger"
              onClick={handleIdempotentRetry}
              disabled={isFSMSubmitting}
              isLoading={isFSMSubmitting}
              className="shrink-0"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry Transmission</span>
            </Button>
          </div>
        </motion.div>
      )}

      {/* Sliding Window Metric Overview */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-2xl bg-white/40 border border-white/60 shadow-xs backdrop-blur-md">
          <div className="flex items-center gap-2 text-slate-500 text-xs mb-1">
            <Layers className="w-3.5 h-3.5 text-slate-400" />
            <span>Sliding Window</span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className={`text-xl font-bold font-mono ${
              isWindowComplete ? "text-emerald-700" : "text-amber-600"
            }`}>
              {readingsCount}
            </span>
            <span className="text-xs text-slate-400">/ 24 steps</span>
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-white/40 border border-white/60 shadow-xs backdrop-blur-md">
          <div className="flex items-center gap-2 text-slate-500 text-xs mb-1">
            <Zap className="w-3.5 h-3.5 text-slate-400" />
            <span>Voltage Boundary</span>
          </div>
          <span className="text-sm font-bold font-mono text-slate-800">
            [0.0V - 500.0V]
          </span>
        </div>

        <div className="p-3.5 rounded-2xl bg-white/40 border border-white/60 shadow-xs backdrop-blur-md">
          <div className="flex items-center gap-2 text-slate-500 text-xs mb-1">
            <Gauge className="w-3.5 h-3.5 text-slate-400" />
            <span>Nominal Freq</span>
          </div>
          <span className="text-sm font-bold font-mono text-slate-800">
            &gt;= 0.0 Hz (50Hz Typ)
          </span>
        </div>

        <div className="p-3.5 rounded-2xl bg-white/40 border border-white/60 shadow-xs backdrop-blur-md">
          <div className="flex items-center gap-2 text-slate-500 text-xs mb-1">
            <Activity className="w-3.5 h-3.5 text-slate-400" />
            <span>Availability Limit</span>
          </div>
          <span className="text-sm font-bold font-mono text-slate-800">
            [0.00 - 1.00]
          </span>
        </div>
      </div>

      {/* Global Window Validation Error Banner */}
      {rootReadingsError && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/25 text-rose-800 text-xs flex items-center gap-2.5 backdrop-blur-md shadow-xs"
        >
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span className="font-medium">{rootReadingsError}</span>
        </motion.div>
      )}

      {/* Telemetry Matrix Container */}
      <div className="rounded-2xl border border-white/60 bg-white/30 backdrop-blur-xl shadow-inner overflow-hidden">
        <div className="p-3.5 bg-white/50 border-b border-white/60 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-slate-500" />
            <h4 className="text-xs font-semibold text-slate-800 uppercase tracking-wider">
              24-Hour Telemetry Matrix (Pydantic v2 Enforced)
            </h4>
          </div>
          <span className="text-[11px] font-mono text-slate-500">
            Step Count: {fields.length}
          </span>
        </div>

        {fields.length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-xs">
            No telemetry readings staged. Click{" "}
            <span className="font-semibold text-slate-700">"Add Row"</span>{" "}
            above to enter hourly operational telemetry.
          </div>
        ) : (
          <div className="max-h-[420px] overflow-y-auto divide-y divide-white/40">
            <div className="grid grid-cols-12 gap-2 px-4 py-2.5 bg-slate-50/70 text-[11px] font-semibold text-slate-500 uppercase tracking-wider sticky top-0 backdrop-blur-md z-10 border-b border-white/60">
              <span className="col-span-1">#</span>
              <span className="col-span-3">Timestamp (UTC ISO-8601)</span>
              <span className="col-span-2 text-right">Voltage (V)</span>
              <span className="col-span-2 text-right">Load (kW)</span>
              <span className="col-span-2 text-right">Freq (Hz)</span>
              <span className="col-span-1 text-right">Avail</span>
              <span className="col-span-1 text-center">Action</span>
            </div>

            {fields.map((field, index) => {
              const rowErrors = errors.readings?.[index];
              const hasTimestampError = !!rowErrors?.timestamp;
              const hasVoltageError = !!rowErrors?.voltage;
              const hasLoadError = !!rowErrors?.load;
              const hasFrequencyError = !!rowErrors?.frequency;
              const hasAvailabilityError = !!rowErrors?.availability;
              const hasRowError = hasTimestampError || hasVoltageError || hasLoadError || hasFrequencyError || hasAvailabilityError;

              return (
                <div key={field.id} className="p-2 space-y-1.5 hover:bg-white/40 transition-colors">
                  <div className="grid grid-cols-12 gap-2 items-center text-xs">
                    <span className="col-span-1 text-slate-400 font-mono text-[11px] pl-2">
                      {index + 1}
                    </span>

                    {/* Timestamp Input */}
                    <input
                      type="text"
                      disabled={isFSMSubmitting}
                      {...register(`readings.${index}.timestamp` as const)}
                      placeholder="YYYY-MM-DDTHH:mm:ssZ"
                      className={`col-span-3 px-2 py-1 bg-white/70 border rounded-md font-mono text-[11px] text-slate-700 shadow-2xs focus:outline-none transition-colors ${
                        hasTimestampError 
                          ? "border-rose-400 focus:ring-1 focus:ring-rose-500 bg-rose-50/70" 
                          : "border-white/80 focus:ring-1 focus:ring-emerald-500"
                      }`}
                    />

                    {/* Voltage Input: [0.0, 500.0] */}
                    <input
                      type="number"
                      step="0.1"
                      disabled={isFSMSubmitting}
                      {...register(`readings.${index}.voltage` as const, { valueAsNumber: true })}
                      placeholder="0 - 500"
                      className={`col-span-2 px-2 py-1 bg-white/70 border rounded-md font-mono text-[11px] text-right text-slate-700 shadow-2xs focus:outline-none transition-colors ${
                        hasVoltageError 
                          ? "border-rose-400 focus:ring-1 focus:ring-rose-500 bg-rose-50/70" 
                          : "border-white/80 focus:ring-1 focus:ring-emerald-500"
                      }`}
                    />

                    {/* Load Input: >= 0.0 */}
                    <input
                      type="number"
                      step="0.1"
                      disabled={isFSMSubmitting}
                      {...register(`readings.${index}.load` as const, { valueAsNumber: true })}
                      placeholder=">= 0"
                      className={`col-span-2 px-2 py-1 bg-white/70 border rounded-md font-mono text-[11px] text-right text-slate-700 shadow-2xs focus:outline-none transition-colors ${
                        hasLoadError 
                          ? "border-rose-400 focus:ring-1 focus:ring-rose-500 bg-rose-50/70" 
                          : "border-white/80 focus:ring-1 focus:ring-emerald-500"
                      }`}
                    />

                    {/* Frequency Input: >= 0.0 */}
                    <input
                      type="number"
                      step="0.01"
                      disabled={isFSMSubmitting}
                      {...register(`readings.${index}.frequency` as const, { valueAsNumber: true })}
                      placeholder=">= 0"
                      className={`col-span-2 px-2 py-1 bg-white/70 border rounded-md font-mono text-[11px] text-right text-slate-700 shadow-2xs focus:outline-none transition-colors ${
                        hasFrequencyError 
                          ? "border-rose-400 focus:ring-1 focus:ring-rose-500 bg-rose-50/70" 
                          : "border-white/80 focus:ring-1 focus:ring-emerald-500"
                      }`}
                    />

                    {/* Availability Input: [0.0, 1.0] */}
                    <input
                      type="number"
                      step="0.01"
                      disabled={isFSMSubmitting}
                      {...register(`readings.${index}.availability` as const, { valueAsNumber: true })}
                      placeholder="0 - 1"
                      className={`col-span-1 px-1.5 py-1 bg-white/70 border rounded-md font-mono text-[11px] text-right text-slate-700 shadow-2xs focus:outline-none transition-colors ${
                        hasAvailabilityError 
                          ? "border-rose-400 focus:ring-1 focus:ring-rose-500 bg-rose-50/70" 
                          : "border-white/80 focus:ring-1 focus:ring-emerald-500"
                      }`}
                    />

                    {/* Action */}
                    <div className="col-span-1 flex justify-center">
                      <button
                        type="button"
                        disabled={isFSMSubmitting}
                        onClick={() => remove(index)}
                        className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors disabled:opacity-40"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Localized Inline Error Feedback */}
                  {hasRowError && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      className="ml-6 flex flex-wrap items-center gap-2 p-1.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-[10px] text-rose-700 font-medium"
                    >
                      <AlertCircle className="w-3 h-3 text-rose-600 shrink-0" />
                      {rowErrors?.timestamp?.message && (
                        <span>{rowErrors.timestamp.message}</span>
                      )}
                      {rowErrors?.voltage?.message && (
                        <span>{rowErrors.voltage.message}</span>
                      )}
                      {rowErrors?.load?.message && (
                        <span>{rowErrors.load.message}</span>
                      )}
                      {rowErrors?.frequency?.message && (
                        <span>{rowErrors.frequency.message}</span>
                      )}
                      {rowErrors?.availability?.message && (
                        <span>{rowErrors.availability.message}</span>
                      )}
                    </motion.div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Success Notification Banner */}
      <AnimatePresence>
        {Boolean(fsm.successResponse) && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-800 text-xs flex items-center gap-2.5 backdrop-blur-md shadow-xs"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <div className="flex-1">
              <span className="font-semibold">Telemetry Ingestion Accepted: </span>
              <span>Sliding window validated and persisted by Go Gateway. Model inference dispatched.</span>
            </div>
            <button
              type="button"
              onClick={() => dispatch({ type: "RESET" })}
              className="text-[11px] font-semibold text-emerald-700 hover:underline cursor-pointer"
            >
              Clear
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Submission Footer */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-3 border-t border-slate-200/60">
        <div className="text-xs text-slate-500">
          {isWindowComplete ? (
            <span className="text-emerald-700 font-medium">Sliding window complete (24 readings staged)</span>
          ) : (
            <span className="text-amber-600 font-medium">Minimum 24 sequential hourly readings required ({readingsCount}/24)</span>
          )}
        </div>

        <Button
          size="default"
          type="submit"
          variant="default"
          disabled={!isWindowComplete || isFSMSubmitting}
          isLoading={isFSMSubmitting}
        >
          <Send className="w-4 h-4 mr-1.5" />
          <span>Stage Telemetry Payload</span>
        </Button>
      </div>
    </form>
  );
}
