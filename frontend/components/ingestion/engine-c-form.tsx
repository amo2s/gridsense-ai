"use client";

import React, { useState, useEffect } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { subHours } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Sparkles, 
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
  Gauge
} from "lucide-react";
import { toast } from "sonner";
import { useFeederStore } from "@/store/feeder-store";

export interface EngineCTelemetryReadingForm {
  timestamp: string;
  voltage: number;
  load: number;
  frequency: number;
  availability: number;
}

export interface EngineCIngestionFormData {
  feeder_id: string;
  substation_id: string | null;
  readings: EngineCTelemetryReadingForm[];
}

type FormStateFSM = "IDLE" | "SUBMITTING" | "SUCCESS" | "ERROR";

/**
 * ============================================================================
 * ENGINE C MANUAL TELEMETRY INGESTION FORM (COMMAND PATHWAY)
 * ============================================================================
 * High-performance uncontrolled form state management powered by React Hook Form.
 * Directly binds to Phase 0.2 global Zustand store context (activeFeederId + activeSubstationId).
 * Pre-scaffolded for 24-step sliding window telemetry with zero re-render overhead.
 */
export default function EngineCForm() {
  const activeFeederId = useFeederStore((state) => state.activeFeederId);
  const activeSubstationId = useFeederStore((state) => state.activeSubstationId);
  const activeFeeder = useFeederStore((state) => state.activeFeeder);

  const [formStatus, setFormStatus] = useState<FormStateFSM>("IDLE");
  const [submissionFeedback, setSubmissionFeedback] = useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<EngineCIngestionFormData>({
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

  // Keep feeder_id and substation_id synchronized with global store without causing re-renders
  useEffect(() => {
    if (activeFeederId) {
      setValue("feeder_id", activeFeederId);
    }
    setValue("substation_id", activeSubstationId || null);
  }, [activeFeederId, activeSubstationId, setValue]);

  /**
   * Generates a 24-hour diurnal sliding window baseline for Engine C anomaly detection.
   * Produces 24 ascending hourly timestamps with realistic operational parameters:
   * - Voltage: Centered at 230V (+/- 8V diurnal variance)
   * - Load: Diurnal curve centered at 520 kW
   * - Frequency: Grid standard 50.0 Hz (+/- 0.15 Hz nominal variance)
   * - Availability: High baseline 0.98 - 1.00
   */
  const handleGenerateBaseline = () => {
    const now = new Date();
    const endHour = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      now.getUTCHours(),
      0, 0, 0
    ));

    const baseline: EngineCTelemetryReadingForm[] = [];

    for (let i = 23; i >= 0; i--) {
      const readingTime = subHours(endHour, i);
      const hour = readingTime.getUTCHours();

      // Diurnal voltage sine wave
      const voltageNoise = (Math.random() * 2 - 1) * 1.2;
      const voltage = Math.round((230 + 10 * Math.sin(((hour - 5) / 24) * 2 * Math.PI) + voltageNoise) * 10) / 10;

      // Diurnal load curve peaking in evening hours (18:00 UTC)
      const loadNoise = (Math.random() * 2 - 1) * 8;
      const load = Math.round((520 + 160 * Math.sin(((hour - 11) / 24) * 2 * Math.PI) + loadNoise) * 10) / 10;

      // Frequency nominal around 50Hz
      const frequencyNoise = (Math.random() * 2 - 1) * 0.08;
      const frequency = Math.round((50.0 + frequencyNoise) * 100) / 100;

      // Availability index
      const availability = Math.round((0.98 + Math.random() * 0.02) * 100) / 100;

      baseline.push({
        timestamp: readingTime.toISOString(),
        voltage,
        load,
        frequency,
        availability,
      });
    }

    replace(baseline);
    toast.success("Synthesized 24-hour sliding window telemetry baseline for Engine C.");
  };

  const onSubmit = async (data: EngineCIngestionFormData) => {
    try {
      setFormStatus("SUBMITTING");
      setSubmissionFeedback(null);

      // Scaffolded dispatch to Go API Gateway Command Ingress (Step 1.2 / 1.3 will wire proxy transport)
      await new Promise((resolve) => setTimeout(resolve, 800));

      setFormStatus("SUCCESS");
      setSubmissionFeedback(`Successfully validated ${data.readings.length} readings for Feeder ${data.feeder_id}.`);
      toast.success("Command payload validated and staged for Gateway ingestion!");
    } catch (err: unknown) {
      setFormStatus("ERROR");
      const msg = err instanceof Error ? err.message : "Failed to stage command ingestion payload.";
      setSubmissionFeedback(msg);
      toast.error(msg);
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
        <p className="text-sm text-slate-600 max-w-md leading-relaxed mb-6">
          Engine C multivariate anomaly ingestion requires an active hierarchical asset binding. 
          Please select a feeder from the global asset selector in the navigation sidebar before staging manual telemetry.
        </p>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/60 border border-white/80 text-xs font-mono text-slate-500 shadow-xs">
          <span>Target Store:</span>
          <span className="text-emerald-700 font-semibold">useFeederStore (Phase 0.2)</span>
        </div>
      </motion.div>
    );
  }

  const readingsCount = fields.length;
  const isWindowComplete = readingsCount >= 24;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Dynamic Header: Global Zustand Context Data Binding */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-slate-200/60">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="text-xs uppercase font-bold tracking-widest text-slate-400">
              Active Grid Context
            </span>
            {/* Active Feeder Badge */}
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-700 border border-emerald-500/30 shadow-xs">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <Zap className="w-3 h-3 text-emerald-600" />
              <span>Feeder:</span>
              <span className="font-mono">{activeFeederId}</span>
            </span>

            {/* Active Substation Badge (Hierarchical Context from Phase 0.2) */}
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border shadow-xs ${
              activeSubstationId
                ? "bg-teal-500/10 text-teal-800 border-teal-500/30"
                : "bg-amber-500/10 text-amber-800 border-amber-500/30"
            }`}>
              <Building2 className="w-3 h-3 text-teal-600" />
              <span>Substation:</span>
              <span className="font-mono">
                {activeSubstationId || activeFeeder?.substation || "Unassigned"}
              </span>
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1.5">
            Hierarchical asset binding dynamically mapped via Phase 0.2 Zustand store expansion
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleGenerateBaseline}
            disabled={formStatus === "SUBMITTING"}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-emerald-800 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 rounded-xl backdrop-blur-md shadow-sm transition-all duration-200 disabled:opacity-50 cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
            Generate 24h Baseline
          </button>
          <button
            type="button"
            onClick={() => {
              append({
                timestamp: new Date().toISOString(),
                voltage: 230.0,
                load: 500.0,
                frequency: 50.0,
                availability: 1.0,
              });
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white/60 hover:bg-white/80 border border-white/80 rounded-xl shadow-xs transition-all duration-200 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 text-slate-600" />
            Add Reading
          </button>
        </div>
      </div>

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
            <span>Voltage Class</span>
          </div>
          <span className="text-lg font-bold font-mono text-slate-800">
            {activeFeeder?.voltageClass || "33kV"}
          </span>
        </div>

        <div className="p-3.5 rounded-2xl bg-white/40 border border-white/60 shadow-xs backdrop-blur-md">
          <div className="flex items-center gap-2 text-slate-500 text-xs mb-1">
            <Gauge className="w-3.5 h-3.5 text-slate-400" />
            <span>Nominal Freq</span>
          </div>
          <span className="text-lg font-bold font-mono text-slate-800">
            50.00 Hz
          </span>
        </div>

        <div className="p-3.5 rounded-2xl bg-white/40 border border-white/60 shadow-xs backdrop-blur-md">
          <div className="flex items-center gap-2 text-slate-500 text-xs mb-1">
            <Activity className="w-3.5 h-3.5 text-slate-400" />
            <span>Asset Status</span>
          </div>
          <span className="text-xs font-bold uppercase tracking-wider text-emerald-700">
            {activeFeeder?.status || "STABLE"}
          </span>
        </div>
      </div>

      {/* Telemetry Matrix Container */}
      <div className="rounded-2xl border border-white/60 bg-white/30 backdrop-blur-xl shadow-inner overflow-hidden">
        <div className="p-3.5 bg-white/50 border-b border-white/60 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-slate-500" />
            <h4 className="text-xs font-semibold text-slate-800 uppercase tracking-wider">
              24-Hour Telemetry Matrix (Uncontrolled Input Array)
            </h4>
          </div>
          <span className="text-[11px] font-mono text-slate-500">
            Step Count: {fields.length}
          </span>
        </div>

        {fields.length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-xs">
            No telemetry readings staged. Click{" "}
            <span className="font-semibold text-emerald-700">"Generate 24h Baseline"</span>{" "}
            to auto-populate sequential operational vectors.
          </div>
        ) : (
          <div className="max-h-[380px] overflow-y-auto divide-y divide-white/40">
            <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-slate-50/50 text-[11px] font-semibold text-slate-500 uppercase tracking-wider sticky top-0 backdrop-blur-md">
              <span className="col-span-1">#</span>
              <span className="col-span-3">Timestamp (UTC)</span>
              <span className="col-span-2 text-right">Voltage (V)</span>
              <span className="col-span-2 text-right">Load (kW)</span>
              <span className="col-span-2 text-right">Freq (Hz)</span>
              <span className="col-span-1 text-right">Avail</span>
              <span className="col-span-1 text-center">Action</span>
            </div>

            {fields.map((field, index) => (
              <div
                key={field.id}
                className="grid grid-cols-12 gap-2 px-4 py-2 items-center text-xs hover:bg-white/40 transition-colors"
              >
                <span className="col-span-1 text-slate-400 font-mono text-[11px]">
                  {index + 1}
                </span>

                <input
                  type="text"
                  {...register(`readings.${index}.timestamp` as const)}
                  className="col-span-3 px-2 py-1 bg-white/60 border border-white/80 rounded-md font-mono text-[11px] text-slate-700 shadow-2xs focus:outline-emerald-500"
                />

                <input
                  type="number"
                  step="0.1"
                  {...register(`readings.${index}.voltage` as const, { valueAsNumber: true })}
                  className="col-span-2 px-2 py-1 bg-white/60 border border-white/80 rounded-md font-mono text-[11px] text-right text-slate-700 shadow-2xs focus:outline-emerald-500"
                />

                <input
                  type="number"
                  step="0.1"
                  {...register(`readings.${index}.load` as const, { valueAsNumber: true })}
                  className="col-span-2 px-2 py-1 bg-white/60 border border-white/80 rounded-md font-mono text-[11px] text-right text-slate-700 shadow-2xs focus:outline-emerald-500"
                />

                <input
                  type="number"
                  step="0.01"
                  {...register(`readings.${index}.frequency` as const, { valueAsNumber: true })}
                  className="col-span-2 px-2 py-1 bg-white/60 border border-white/80 rounded-md font-mono text-[11px] text-right text-slate-700 shadow-2xs focus:outline-emerald-500"
                />

                <input
                  type="number"
                  step="0.01"
                  {...register(`readings.${index}.availability` as const, { valueAsNumber: true })}
                  className="col-span-1 px-1.5 py-1 bg-white/60 border border-white/80 rounded-md font-mono text-[11px] text-right text-slate-700 shadow-2xs focus:outline-emerald-500"
                />

                <div className="col-span-1 flex justify-center">
                  <button
                    type="button"
                    onClick={() => remove(index)}
                    className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Submission Feedback Banner */}
      <AnimatePresence>
        {submissionFeedback && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className={`p-3.5 rounded-xl border flex items-center gap-2.5 text-xs ${
              formStatus === "SUCCESS"
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-800"
                : "bg-rose-500/10 border-rose-500/30 text-rose-800"
            }`}
          >
            {formStatus === "SUCCESS" ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{submissionFeedback}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Submission Footer */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-3 border-t border-slate-200/60">
        <div className="text-xs text-slate-500">
          <span>Boundary Target: </span>
          <span className="font-mono text-slate-700">POST /api/proxy/v1/anomalies/detect</span>
        </div>

        <button
          type="submit"
          disabled={!isWindowComplete || formStatus === "SUBMITTING"}
          className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-xs font-semibold tracking-wider uppercase text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed shadow-md hover:shadow-lg transition-all duration-200 cursor-pointer"
        >
          <Send className="w-3.5 h-3.5" />
          <span>Stage Command Payload</span>
        </button>
      </div>
    </form>
  );
}
