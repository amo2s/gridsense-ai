"use client";

import { useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { motion, AnimatePresence } from "framer-motion";
import { Trash2, Plus, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

const ingestionSchema = z.object({
  cycle_timestamp: z.string().min(1, "Timestamp is required"),
  asset: z.object({
    feeder_id: z.string().trim().min(1, "Feeder ID is required").max(50, "Feeder ID max length is 50"),
    voltage_class: z.string().trim().min(1, "Voltage class is required").max(20, "Voltage class max length is 20"),
    capacity_mw: z.coerce.number().positive("Capacity must be positive").max(99999999.99, "Capacity is too large"),
  }),
  interruptions: z.array(
    z.object({
      start_time: z.string().min(1, "Start time is required"),
      duration_minutes: z.coerce.number().min(0, "Duration must be at least 0").max(720, "Duration cannot exceed 720 minutes"),
    })
  ).max(6, "Cannot exceed 6 interruption records").default([]),
}).superRefine((data, ctx) => {
  const cycleTime = new Date(data.cycle_timestamp).getTime();
  const minTime = cycleTime - 24 * 60 * 60 * 1000;
  let totalDuration = 0;

  data.interruptions.forEach((intr, index) => {
    totalDuration += intr.duration_minutes;
    const startTime = new Date(intr.start_time).getTime();
    if (startTime < minTime || startTime > cycleTime) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Start time must be within 24h before cycle timestamp",
        path: ["interruptions", index, "start_time"],
      });
    }
  });

  if (totalDuration > 1440) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Total interruption duration cannot exceed 1440 minutes",
      path: ["interruptions"],
    });
  }
});

type IngestionFormValues = z.infer<typeof ingestionSchema>;

interface EgressPayload {
  reliability_score: number;
  risk_band: string;
  trajectory: string;
}

export default function EngineAForm() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [results, setResults] = useState<EgressPayload | null>(null);
  const queryClient = useQueryClient();

  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
    reset
  } = useForm<IngestionFormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(ingestionSchema) as any,
    defaultValues: {
      cycle_timestamp: new Date().toISOString().slice(0, 16),
      asset: {
        feeder_id: "",
        voltage_class: "",
        capacity_mw: undefined,
      },
      interruptions: [],
    },
  });

  const { fields, append, remove } = useFieldArray({
    name: "interruptions",
    control,
  });

  const onSubmit = async (data: IngestionFormValues) => {
    setIsSubmitting(true);
    setResults(null);
    
    try {
      // NOTE ON TIMEZONE: The datetime-local input naturally captures local time.
      // Calling new Date(str).toISOString() converts it accurately to UTC.
      const formattedData = {
        ...data,
        cycle_timestamp: new Date(data.cycle_timestamp).toISOString(),
        interruptions: data.interruptions.map(i => ({
          ...i,
          start_time: new Date(i.start_time).toISOString(),
        }))
      };

      const token = typeof window !== 'undefined' ? sessionStorage.getItem('access_token') : null;
      if (!token) {
        toast.error("Authentication token missing. Please re-authenticate.");
        setIsSubmitting(false);
        return;
      }

      const response = await fetch('/api/proxy/v1/reliability/ingest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(formattedData)
      });

      if (!response.ok) {
        let errMsg = `HTTP ${response.status}`;
        const errorData = await response.json().catch(() => null);
        if (errorData) {
          errMsg = errorData.error || errorData.detail || errorData.message || errMsg;
        }

        if (response.status === 401) {
          toast.error("Session expired. Please log in again.");
        } else if (response.status === 403) {
          toast.error("Forbidden. You need Admin privileges to ingest telemetry.");
        } else {
          toast.error(`Ingestion failed: ${errMsg}`);
        }
        throw new Error(errMsg);
      }

      const egressData: EgressPayload = await response.json();
      setResults(egressData);
      
      // Invalidate queries so the dashboard refreshes automatically
      queryClient.invalidateQueries({ queryKey: ["dashboard-metrics"] });
      queryClient.invalidateQueries({ queryKey: ["priority-areas"] });
      queryClient.invalidateQueries({ queryKey: ["reliability-trend"] });
      
      toast.custom(() => (
        <div className="flex items-center gap-3 bg-white/80 backdrop-blur-md border border-white/60 shadow-lg shadow-[inset_0_1px_1px_rgba(255,255,255,0.8)] px-4 py-3 rounded-xl">
          <CheckCircle2 className="h-5 w-5 text-emerald-500" />
          <p className="text-sm font-medium text-slate-800">
            Telemetry ingested successfully. Reliability Index: {egressData.reliability_score}
          </p>
        </div>
      ));
      
      reset();
    } catch (error) {
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <form onSubmit={handleSubmit(onSubmit as any)} className="space-y-8">
      {/* Root Details */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <label className="block text-xs uppercase tracking-widest text-gray-500 font-semibold">
            Cycle Timestamp
          </label>
          <input
            type="datetime-local"
            {...register("cycle_timestamp")}
            className="w-full bg-white/50 border-transparent shadow-inner rounded-xl px-4 py-3 text-sm text-slate-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all duration-300"
          />
          {errors.cycle_timestamp && (
            <p className="text-red-500 text-xs mt-1">{errors.cycle_timestamp.message}</p>
          )}
        </div>
      </div>

      <hr className="border-t border-slate-200/50" />

      {/* Asset Metadata */}
      <div>
        <h3 className="text-sm font-semibold text-slate-800 mb-4 tracking-wide">ASSET METADATA</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <label className="block text-xs uppercase tracking-widest text-gray-500 font-semibold">
              Feeder ID
            </label>
            <input
              type="text"
              placeholder="e.g. FDR-789"
              {...register("asset.feeder_id")}
              className="w-full bg-white/50 border-transparent shadow-inner rounded-xl px-4 py-3 text-sm text-slate-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all duration-300"
            />
            {errors.asset?.feeder_id && (
              <p className="text-red-500 text-xs mt-1">{errors.asset.feeder_id.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <label className="block text-xs uppercase tracking-widest text-gray-500 font-semibold">
              Voltage Class
            </label>
            <input
              type="text"
              placeholder="e.g. 12kV"
              {...register("asset.voltage_class")}
              className="w-full bg-white/50 border-transparent shadow-inner rounded-xl px-4 py-3 text-sm text-slate-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all duration-300"
            />
            {errors.asset?.voltage_class && (
              <p className="text-red-500 text-xs mt-1">{errors.asset.voltage_class.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <label className="block text-xs uppercase tracking-widest text-gray-500 font-semibold">
              Capacity (MW)
            </label>
            <input
              type="number"
              step="0.01"
              placeholder="0.00"
              {...register("asset.capacity_mw")}
              className="w-full bg-white/50 border-transparent shadow-inner rounded-xl px-4 py-3 text-sm text-slate-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all duration-300"
            />
            {errors.asset?.capacity_mw && (
              <p className="text-red-500 text-xs mt-1">{errors.asset.capacity_mw.message}</p>
            )}
          </div>
        </div>
      </div>

      <hr className="border-t border-slate-200/50" />

      {/* Interruptions */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-800 tracking-wide">INTERRUPTION RECORDS</h3>
        </div>
        
        {errors.interruptions?.root && (
          <p className="text-red-500 text-sm mb-4 bg-red-50 p-3 rounded-lg">{errors.interruptions.root.message}</p>
        )}

        <div className="space-y-3 mb-4">
          <AnimatePresence initial={false}>
            {fields.map((field, index) => (
              <motion.div
                key={field.id}
                initial={{ opacity: 0, y: -20, height: 0 }}
                animate={{ opacity: 1, y: 0, height: "auto" }}
                exit={{ opacity: 0, y: -20, height: 0 }}
                transition={{ type: "spring", stiffness: 350, damping: 30, mass: 0.8 }}
                className="overflow-hidden"
              >
                <div className="flex items-start gap-4 p-4 bg-white/30 rounded-xl border border-white/50">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1">
                    <div className="space-y-2">
                      <label className="block text-xs uppercase tracking-widest text-gray-500 font-semibold">
                        Start Time
                      </label>
                      <input
                        type="datetime-local"
                        {...register(`interruptions.${index}.start_time` as const)}
                        className="w-full bg-white/50 border-transparent shadow-inner rounded-xl px-4 py-3 text-sm text-slate-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all duration-300"
                      />
                      {errors.interruptions?.[index]?.start_time && (
                        <p className="text-red-500 text-xs mt-1">{errors.interruptions[index]?.start_time?.message}</p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <label className="block text-xs uppercase tracking-widest text-gray-500 font-semibold">
                        Duration (Min)
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        placeholder="0.0"
                        {...register(`interruptions.${index}.duration_minutes` as const)}
                        className="w-full bg-white/50 border-transparent shadow-inner rounded-xl px-4 py-3 text-sm text-slate-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all duration-300"
                      />
                      {errors.interruptions?.[index]?.duration_minutes && (
                        <p className="text-red-500 text-xs mt-1">{errors.interruptions[index]?.duration_minutes?.message}</p>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => remove(index)}
                    className="mt-7 p-2 text-slate-400 hover:text-red-500 hover:bg-red-50/50 rounded-lg transition-colors flex-shrink-0"
                  >
                    <Trash2 className="h-5 w-5" />
                  </button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        <motion.button
          type="button"
          whileTap={fields.length >= 6 ? {} : { scale: 0.98 }}
          onClick={() => append({ start_time: new Date().toISOString().slice(0, 16), duration_minutes: 0 })}
          disabled={fields.length >= 6}
          className={`w-full flex items-center justify-center gap-2 py-4 border-2 border-dashed rounded-xl font-medium transition-all duration-300 ${
            fields.length >= 6 
              ? "border-slate-200 text-slate-400 cursor-not-allowed bg-slate-50/50" 
              : "border-slate-300 text-slate-500 hover:border-emerald-500 hover:text-emerald-600 hover:bg-emerald-50/50"
          }`}
        >
          <Plus className="h-5 w-5" />
          {fields.length >= 6 ? "Maximum Limit Reached (6)" : "Add Interruption Record"}
        </motion.button>
      </div>

      <div className="pt-4 flex justify-end">
        <button
          type="submit"
          disabled={isSubmitting}
          className="relative overflow-hidden group bg-emerald-500 hover:bg-emerald-600 text-white font-medium px-8 py-3 rounded-full transition-all duration-300 disabled:opacity-80 disabled:cursor-not-allowed shadow-[0_4px_14px_rgba(16,185,129,0.4)] hover:shadow-[0_6px_20px_rgba(16,185,129,0.5)]"
        >
          {isSubmitting ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              Dispatching...
            </span>
          ) : (
            <span className="relative z-10 flex items-center gap-2">
              Dispatch Payload
            </span>
          )}
          <div className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/20 to-white/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
        </button>
      </div>

      <AnimatePresence>
        {results && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mt-6 p-6 rounded-xl border border-slate-200 bg-white/50 backdrop-blur-sm shadow-sm flex items-center justify-between"
          >
            <div>
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Results Summary</h4>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-light text-slate-900">{results.reliability_score}</span>
                <span className="text-sm text-slate-500 font-medium">/ 100</span>
              </div>
            </div>
            <div className="text-right">
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider
                ${results.risk_band === 'STABLE' ? 'bg-emerald-100 text-emerald-800' :
                  results.risk_band === 'VULNERABLE' ? 'bg-amber-100 text-amber-800' :
                  'bg-red-100 text-red-800'}`}
              >
                {results.risk_band}
              </span>
              <p className="text-xs text-slate-500 mt-2 font-medium">Trajectory: {results.trajectory}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </form>
  );
}
