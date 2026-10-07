"use client";

import { useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { motion, AnimatePresence } from "framer-motion";
import { Trash2, Plus, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

const ingestionSchema = z.object({
  cycle_timestamp: z.string().min(1, "Timestamp is required"),
  asset: z.object({
    feeder_id: z.string().min(1, "Feeder ID is required"),
    voltage_class: z.string().min(1, "Voltage class is required"),
    capacity_mw: z.coerce.number().min(0, "Capacity must be positive"),
  }),
  interruptions: z.array(
    z.object({
      start_time: z.string().min(1, "Start time is required"),
      duration_minutes: z.coerce.number().min(0, "Duration must be positive"),
    })
  ).default([]),
});

type IngestionFormValues = z.infer<typeof ingestionSchema>;

export default function EngineAForm() {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
    reset
  } = useForm<IngestionFormValues>({
    resolver: zodResolver(ingestionSchema),
    defaultValues: {
      cycle_timestamp: new Date().toISOString().slice(0, 16),
      asset: {
        feeder_id: "",
        voltage_class: "",
        capacity_mw: undefined, // let user type
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
    
    try {
      // Transformation happens inherently via Zod's coerce and proper string types 
      // strictly format them as valid ISO strings
      const formattedData = {
        ...data,
        cycle_timestamp: new Date(data.cycle_timestamp).toISOString(),
        interruptions: data.interruptions.map(i => ({
          ...i,
          start_time: new Date(i.start_time).toISOString(),
        }))
      };

      await new Promise(resolve => setTimeout(resolve, 1500));
      
      console.log("Dispatching payload:", formattedData);
      
      toast.custom(() => (
        <div className="flex items-center gap-3 bg-white/80 backdrop-blur-md border border-white/60 shadow-lg shadow-[inset_0_1px_1px_rgba(255,255,255,0.8)] px-4 py-3 rounded-xl">
          <CheckCircle2 className="h-5 w-5 text-emerald-500" />
          <p className="text-sm font-medium text-slate-800">Telemetry Payload Dispatched</p>
        </div>
      ));
      
      reset();
    } catch (error) {
      toast.error("Failed to dispatch payload");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
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
          whileTap={{ scale: 0.98 }}
          onClick={() => append({ start_time: new Date().toISOString().slice(0, 16), duration_minutes: 0 })}
          className="w-full flex items-center justify-center gap-2 py-4 border-2 border-dashed border-slate-300 rounded-xl text-slate-500 font-medium hover:border-emerald-500 hover:text-emerald-600 hover:bg-emerald-50/50 transition-all duration-300"
        >
          <Plus className="h-5 w-5" />
          Add Interruption Record
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
          {/* Gloss overlay */}
          <div className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/20 to-white/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
        </button>
      </div>
    </form>
  );
}
