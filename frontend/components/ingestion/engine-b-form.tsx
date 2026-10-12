"use client";

import { useState, useEffect } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { subHours } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Loader2, 
  CheckCircle2, 
  AlertCircle, 
  Sparkles, 
  Plus, 
  Trash2, 
  ShieldAlert, 
  Zap, 
  Send,
  Database
} from "lucide-react";
import { toast } from "sonner";
import { useFeederStore } from "@/store/feeder-store";
import {
  EngineBIngestRequestSchema,
  EngineBIngestRequest,
  TelemetryReading,
  EgressPredictionResponse,
} from "@/types/engine-b-ingestion";

type FormStateFSM = "IDLE" | "SUBMITTING" | "ERROR" | "SUCCESS";

export default function EngineBForm() {
  const activeFeederId = useFeederStore((state) => state.activeFeederId);
  const [status, setStatus] = useState<FormStateFSM>("IDLE");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [egressResult, setEgressResult] = useState<EgressPredictionResponse | null>(null);

  const {
    register,
    control,
    handleSubmit,
    setValue,
    setError,
    reset,
    formState: { errors },
  } = useForm<EngineBIngestRequest>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(EngineBIngestRequestSchema) as any,
    defaultValues: {
      feeder_id: activeFeederId || "",
      readings: [],
    },
  });

  const { fields, replace, append, remove } = useFieldArray({
    control,
    name: "readings",
  });

  // Keep feeder_id synchronized with global feeder store without requiring manual typing
  useEffect(() => {
    if (activeFeederId) {
      setValue("feeder_id", activeFeederId, { shouldValidate: true });
    }
  }, [activeFeederId, setValue]);

  /**
   * Mock 24h Baseline Generator
   * Computes a diurnal sine-wave progression of load and voltage ending at current UTC hour.
   * Guarantees 24 chronologically ascending hourly readings within physical bounds.
   */
  const handleGenerateBaseline = () => {
    const now = new Date();
    // Anchor to top of the current hour in UTC
    const endHour = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      now.getUTCHours(),
      0, 0, 0
    ));

    const baselineReadings: TelemetryReading[] = [];

    for (let i = 23; i >= 0; i--) {
      const timestampDate = subHours(endHour, i);
      const hour = timestampDate.getUTCHours();

      // Realistic diurnal sine-wave formula for voltage: centered at 230V, +/- 12V swing
      // Physical boundary: 0.0 <= voltage <= 500.0
      const voltageNoise = (Math.random() * 2 - 1) * 0.8;
      const voltageWave = 230 + 12 * Math.sin(((hour - 4) / 24) * 2 * Math.PI) + voltageNoise;
      const voltage = Math.round(Math.min(500, Math.max(0, voltageWave)) * 10) / 10;

      // Realistic diurnal load formula: peak load at 18:00 (~650 kW), trough at 04:00 (~350 kW)
      // Physical boundary: 0.0 <= load <= 1000.0
      const loadNoise = (Math.random() * 2 - 1) * 5;
      const loadWave = 500 + 175 * Math.sin(((hour - 10) / 24) * 2 * Math.PI) + loadNoise;
      const load = Math.round(Math.min(1000, Math.max(0, loadWave)) * 10) / 10;

      // Rare sporadic fault on certain hours
      const fault_count_recent = (i === 5 && Math.random() > 0.45) ? 1 : 0;

      baselineReadings.push({
        timestamp: timestampDate.toISOString(),
        voltage,
        load,
        fault_count_recent,
      });
    }

    replace(baselineReadings);
    setStatus("IDLE");
    setErrorMessage(null);
    toast.success("Synthesized 24-hour diurnal baseline telemetry successfully.");
  };

  const handleAddHour = () => {
    const lastReading = fields[fields.length - 1];
    let nextTimestamp: string;

    if (lastReading && lastReading.timestamp) {
      const lastDate = new Date(lastReading.timestamp);
      nextTimestamp = new Date(lastDate.getTime() + 60 * 60 * 1000).toISOString();
    } else {
      nextTimestamp = new Date().toISOString();
    }

    append({
      timestamp: nextTimestamp,
      voltage: 230.0,
      load: 450.0,
      fault_count_recent: 0,
    });
  };

  const onSubmit = async (data: EngineBIngestRequest) => {
    setStatus("SUBMITTING");
    setErrorMessage(null);
    setEgressResult(null);

    try {
      // Ensure feeder_id is bound from active state
      const payload: EngineBIngestRequest = {
        feeder_id: activeFeederId || data.feeder_id,
        readings: data.readings.map((r) => ({
          timestamp: new Date(r.timestamp).toISOString(),
          voltage: Number(r.voltage),
          load: Number(r.load),
          fault_count_recent: Math.trunc(Number(r.fault_count_recent)),
        })),
      };

      const response = await fetch("/api/proxy/v1/prediction/ingest", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        let summaryMsg = `Gateway Rejection (HTTP ${response.status})`;

        if (errorData) {
          // Map Pydantic v2 validation error array directly to react-hook-form fields
          if (Array.isArray(errorData.detail)) {
            errorData.detail.forEach((issue: { loc?: (string | number)[]; msg?: string }) => {
              if (issue.loc && Array.isArray(issue.loc)) {
                // Filter out standard FastAPI 'body' wrapper
                const cleanLoc = issue.loc.filter((p) => p !== "body");
                const pathString = cleanLoc.join(".");

                setError(pathString as any, {
                  type: "server",
                  message: issue.msg || "Invalid telemetry value",
                });
              }
            });
            summaryMsg = `Validation rejected: ${errorData.detail.map((e: any) => e.msg || "Invalid value").join("; ")}`;
          } else if (errorData.error || errorData.message) {
            summaryMsg = errorData.error || errorData.message;
          }
        }

        setErrorMessage(summaryMsg);
        setStatus("ERROR");
        toast.error(summaryMsg);
        return;
      }

      // Successful ingestion
      const resultData: EgressPredictionResponse = await response.json();
      setEgressResult(resultData);
      setStatus("SUCCESS");

      // Reset form readings
      reset({
        feeder_id: activeFeederId || "",
        readings: [],
      });

      toast.success("Telemetry payload ingested and validated by Go Gateway successfully!");
    } catch (err: any) {
      const networkMsg = err?.message || "Network transmission to Go Gateway failed.";
      setErrorMessage(networkMsg);
      setStatus("ERROR");
      toast.error(networkMsg);
    }
  };

  // State 0: Feeder Store Boundary Enforcement
  if (!activeFeederId) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center rounded-2xl bg-amber-500/10 border border-amber-500/30 backdrop-blur-xl shadow-[inset_0_1px_1px_rgba(255,255,255,0.8)]">
        <ShieldAlert className="w-12 h-12 text-amber-500 mb-4 animate-bounce" />
        <h3 className="text-lg font-semibold text-slate-800 mb-2">
          Asset Context Unassigned
        </h3>
        <p className="text-sm text-slate-600 max-w-md leading-relaxed">
          Command Pathway ingestion requires an active grid asset binding. Please select a feeder
          from the global asset selector in the navigation sidebar before generating or submitting manual telemetry.
        </p>
      </div>
    );
  }

  const readingsCount = fields.length;
  const isReadingsValid = readingsCount >= 24;

  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <form onSubmit={handleSubmit(onSubmit as any)} className="space-y-6">
      {/* Top Asset & Ingestion Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200/60">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase font-bold tracking-widest text-slate-400">
              Synchronized Target Feeder
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-700 border border-emerald-500/30">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              {activeFeederId}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Zero-re-render feeder binding via Phase 0 Global State Store
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleGenerateBaseline}
            disabled={status === "SUBMITTING"}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-emerald-800 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 rounded-xl backdrop-blur-md shadow-sm transition-all duration-200 disabled:opacity-50 cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
            Generate 24h Baseline
          </button>

          <button
            type="button"
            onClick={handleAddHour}
            disabled={status === "SUBMITTING"}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white/60 hover:bg-white/80 border border-white/80 rounded-xl backdrop-blur-md shadow-sm transition-all duration-200 disabled:opacity-50 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 text-slate-600" />
            Add Hour
          </button>

          {readingsCount > 0 && (
            <button
              type="button"
              onClick={() => replace([])}
              disabled={status === "SUBMITTING"}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-red-700 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 rounded-xl backdrop-blur-md shadow-sm transition-all duration-200 disabled:opacity-50 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5 text-red-500" />
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Crimson Alert Banner for ERROR state */}
      <AnimatePresence>
        {status === "ERROR" && errorMessage && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex items-start gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/30 backdrop-blur-md shadow-[inset_0_1px_1px_rgba(255,255,255,0.8)]"
          >
            <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <div className="flex-1 text-xs">
              <p className="font-semibold text-red-800">Telemetry Ingestion Rejected</p>
              <p className="text-red-700/90 mt-0.5 leading-relaxed">{errorMessage}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Emerald Success Banner for SUCCESS state */}
      <AnimatePresence>
        {status === "SUCCESS" && egressResult && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex items-start gap-3 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 backdrop-blur-md shadow-[inset_0_1px_1px_rgba(255,255,255,0.8)]"
          >
            <CheckCircle2 className="w-6 h-6 text-emerald-500 shrink-0 animate-pulse mt-0.5" />
            <div className="flex-1 text-xs space-y-1">
              <p className="font-semibold text-emerald-900">
                Payload Ingested & Processed Successfully
              </p>
              <p className="text-emerald-800">
                Evaluated Feeder: <span className="font-mono font-bold">{egressResult.feeder_id}</span> | 
                Risk Score: <span className="font-bold">{egressResult.risk_score}</span> | 
                Risk Level: <span className="font-bold">{egressResult.risk_level}</span> | 
                Model: <span className="font-mono">{egressResult.model_version}</span>
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Array Validation Summary */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2 text-xs">
          <span className="font-medium text-slate-600">Rolling Window Depth:</span>
          <span
            className={`font-semibold px-2 py-0.5 rounded-md ${
              isReadingsValid
                ? "bg-emerald-500/15 text-emerald-700 border border-emerald-500/30"
                : "bg-amber-500/15 text-amber-700 border border-amber-500/30"
            }`}
          >
            {readingsCount} / 24 Hours {isReadingsValid ? "(Sufficient)" : "(Requires >= 24 entries)"}
          </span>
        </div>

        {errors.readings?.root?.message && (
          <p className="text-xs text-red-500 font-medium">
            {errors.readings.root.message}
          </p>
        )}
        {errors.readings?.message && !errors.readings?.root?.message && (
          <p className="text-xs text-red-500 font-medium">
            {errors.readings.message}
          </p>
        )}
      </div>

      {/* FieldArray Table Container */}
      {readingsCount === 0 ? (
        <div className="p-8 text-center rounded-xl bg-white/30 border border-white/60 backdrop-blur-sm">
          <Database className="w-10 h-10 text-slate-400 mx-auto mb-3 opacity-60" />
          <p className="text-sm font-medium text-slate-700">No telemetry readings queued</p>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            Click &ldquo;Generate 24h Baseline&rdquo; above to automatically assemble a diurnal 24-hour
            operational series, or manually add hourly rows.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/60 bg-white/20 backdrop-blur-md max-h-[460px] overflow-y-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="sticky top-0 bg-white/80 backdrop-blur-md border-b border-white/60 text-slate-600 z-10 shadow-sm">
              <tr>
                <th className="py-2.5 px-3 font-semibold w-12 text-center">#</th>
                <th className="py-2.5 px-3 font-semibold">ISO-8601 Timestamp (UTC)</th>
                <th className="py-2.5 px-3 font-semibold w-32">Voltage (0-500V)</th>
                <th className="py-2.5 px-3 font-semibold w-32">Load (0-1000kW)</th>
                <th className="py-2.5 px-3 font-semibold w-24">Faults (&gt;=0)</th>
                <th className="py-2.5 px-3 font-semibold w-12 text-center"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/40">
              {fields.map((field, index) => {
                const rowErrors = errors.readings?.[index];

                return (
                  <tr
                    key={field.id}
                    className="hover:bg-white/40 transition-colors duration-150"
                  >
                    {/* Index */}
                    <td className="py-2 px-3 text-center text-slate-400 font-mono">
                      {index + 1}
                    </td>

                    {/* Timestamp */}
                    <td className="py-2 px-3">
                      <input
                        type="text"
                        disabled={status === "SUBMITTING"}
                        {...register(`readings.${index}.timestamp`)}
                        className={`w-full bg-white/40 border ${
                          rowErrors?.timestamp ? "border-red-400 ring-1 ring-red-400" : "border-white/60"
                        } focus:ring-2 focus:ring-emerald-500/50 focus:bg-white/80 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 font-mono transition-all disabled:opacity-50`}
                      />
                      {rowErrors?.timestamp && (
                        <p className="text-[10px] text-red-500 mt-0.5 leading-tight">
                          {rowErrors.timestamp.message}
                        </p>
                      )}
                    </td>

                    {/* Voltage */}
                    <td className="py-2 px-3">
                      <div className="relative">
                        <input
                          type="number"
                          step="0.1"
                          disabled={status === "SUBMITTING"}
                          {...register(`readings.${index}.voltage`, { valueAsNumber: true })}
                          className={`w-full bg-white/40 border ${
                            rowErrors?.voltage ? "border-red-400 ring-1 ring-red-400" : "border-white/60"
                          } focus:ring-2 focus:ring-emerald-500/50 focus:bg-white/80 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 transition-all disabled:opacity-50`}
                        />
                      </div>
                      {rowErrors?.voltage && (
                        <p className="text-[10px] text-red-500 mt-0.5 leading-tight">
                          {rowErrors.voltage.message}
                        </p>
                      )}
                    </td>

                    {/* Load */}
                    <td className="py-2 px-3">
                      <div className="relative">
                        <input
                          type="number"
                          step="0.1"
                          disabled={status === "SUBMITTING"}
                          {...register(`readings.${index}.load`, { valueAsNumber: true })}
                          className={`w-full bg-white/40 border ${
                            rowErrors?.load ? "border-red-400 ring-1 ring-red-400" : "border-white/60"
                          } focus:ring-2 focus:ring-emerald-500/50 focus:bg-white/80 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 transition-all disabled:opacity-50`}
                        />
                      </div>
                      {rowErrors?.load && (
                        <p className="text-[10px] text-red-500 mt-0.5 leading-tight">
                          {rowErrors.load.message}
                        </p>
                      )}
                    </td>

                    {/* Fault Count */}
                    <td className="py-2 px-3">
                      <input
                        type="number"
                        step="1"
                        min="0"
                        disabled={status === "SUBMITTING"}
                        {...register(`readings.${index}.fault_count_recent`, { valueAsNumber: true })}
                        className={`w-full bg-white/40 border ${
                          rowErrors?.fault_count_recent ? "border-red-400 ring-1 ring-red-400" : "border-white/60"
                        } focus:ring-2 focus:ring-emerald-500/50 focus:bg-white/80 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 text-center transition-all disabled:opacity-50`}
                      />
                      {rowErrors?.fault_count_recent && (
                        <p className="text-[10px] text-red-500 mt-0.5 leading-tight">
                          {rowErrors.fault_count_recent.message}
                        </p>
                      )}
                    </td>

                    {/* Remove Action */}
                    <td className="py-2 px-3 text-center">
                      <button
                        type="button"
                        onClick={() => remove(index)}
                        disabled={status === "SUBMITTING"}
                        className="p-1 text-slate-400 hover:text-red-500 transition-colors disabled:opacity-30 cursor-pointer"
                        title="Remove Reading"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Form Submission Pathway */}
      <div className="pt-2 flex items-center justify-between">
        <p className="text-[11px] text-slate-500 flex items-center gap-1.5">
          <Zap className="w-3.5 h-3.5 text-amber-500" />
          Payload enforces strict Pydantic v2 boundaries before Go Gateway ingress.
        </p>

        <button
          type="submit"
          disabled={status === "SUBMITTING" || readingsCount < 24}
          className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 rounded-xl shadow-md shadow-emerald-600/20 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        >
          {status === "SUBMITTING" ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin text-white" />
              <span>Transmitting Payload...</span>
            </>
          ) : (
            <>
              <Send className="w-4 h-4" />
              <span>Submit Telemetry Payload</span>
            </>
          )}
        </button>
      </div>
    </form>
  );
}
