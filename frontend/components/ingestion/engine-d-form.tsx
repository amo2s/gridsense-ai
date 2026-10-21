"use client";

import React, { useState, useEffect } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { motion, AnimatePresence } from "framer-motion";
import { 
  CheckCircle2, 
  AlertCircle, 
  Wand2, 
  Plus, 
  Trash2, 
  ShieldAlert, 
  Send,
  Layers,
  Database,
  Building2,
  Cpu
} from "lucide-react";
import { toast } from "sonner";
import { useEngineDStore, DEFAULT_ENGINE_D_AREA_ID } from "@/store/engine-d-store";
import {
  PrioritizationRequestSchema,
  PrioritizationRequest,
  PrioritizationResponse,
} from "@/types/engine-d";
import { Button } from "@/components/ui/button";
import { generateEngineDFusedBaseline } from "@/lib/telemetry-generator";

type FormStateFSM = "IDLE" | "SUBMITTING" | "ERROR" | "SUCCESS";

export default function EngineDForm() {
  const activeAreaId = useEngineDStore((state) => state.activeAreaId);
  const setActiveAreaId = useEngineDStore((state) => state.setActiveAreaId);
  const selectedFeeders = useEngineDStore((state) => state.selectedFeeders);
  const setSelectedFeeders = useEngineDStore((state) => state.setSelectedFeeders);

  const [status, setStatus] = useState<FormStateFSM>("IDLE");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [rankedResult, setRankedResult] = useState<PrioritizationResponse | null>(null);

  const {
    register,
    control,
    handleSubmit,
    setValue,
    setError,
    reset,
    watch,
    formState: { errors },
  } = useForm<PrioritizationRequest>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(PrioritizationRequestSchema) as any,
    defaultValues: {
      query_id: activeAreaId || DEFAULT_ENGINE_D_AREA_ID,
      assets: [],
    },
  });

  const { fields, replace, append, remove } = useFieldArray({
    control,
    name: "assets",
  });

  // Keep form query_id synchronized with store activeAreaId
  useEffect(() => {
    if (activeAreaId) {
      setValue("query_id", activeAreaId, { shouldValidate: true });
    }
  }, [activeAreaId, setValue]);

  /**
   * Dual-Step Pipeline: Stages cross-engine fused baseline intelligence
   * directly into form state via replace().
   */
  const handleStageFusedBaseline = () => {
    const syntheticAssets = generateEngineDFusedBaseline(
      selectedFeeders.length >= 2 ? selectedFeeders : undefined
    );
    replace(syntheticAssets);
    setStatus("IDLE");
    setErrorMessage(null);
    toast.success("Cross-engine intelligence baseline staged successfully (3 feeders).");
  };

  const handleAddFeederRow = () => {
    const nextIdx = fields.length + 1;
    const newId = `f47ac10b-58cc-4372-a567-0e02b2c3d4${String(nextIdx).padStart(2, "0")}`;
    append({
      feeder_id: newId,
      reliability_score: 75.0,
      duration_penalty: 0.15,
      frequency_penalty: 0.1,
      risk_score: 30.0,
      is_anomaly: false,
      anomaly_confidence: 0.05,
    });
  };

  const onSubmit = async (data: PrioritizationRequest) => {
    setStatus("SUBMITTING");
    setErrorMessage(null);
    setRankedResult(null);

    try {
      const targetQueryId = data.query_id || activeAreaId || DEFAULT_ENGINE_D_AREA_ID;

      const payload: PrioritizationRequest = {
        query_id: targetQueryId,
        assets: data.assets.map((asset) => ({
          feeder_id: asset.feeder_id.trim().toLowerCase(),
          reliability_score: Number(asset.reliability_score),
          duration_penalty: Number(asset.duration_penalty),
          frequency_penalty: Number(asset.frequency_penalty),
          risk_score: Number(asset.risk_score),
          is_anomaly: Boolean(asset.is_anomaly),
          anomaly_confidence: Number(asset.anomaly_confidence),
        })),
      };

      const response = await fetch(
        `/api/proxy/v1/priorities/rank?query_id=${encodeURIComponent(targetQueryId)}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        let summaryMsg = `Gateway Rejection (HTTP ${response.status})`;

        if (errorData) {
          if (Array.isArray(errorData.detail)) {
            errorData.detail.forEach((issue: { loc?: (string | number)[]; msg?: string }) => {
              if (issue.loc && Array.isArray(issue.loc)) {
                const cleanLoc = issue.loc.filter((p) => p !== "body");
                const pathString = cleanLoc.join(".");
                setError(pathString as any, {
                  type: "server",
                  message: issue.msg || "Invalid asset attribute",
                });
              }
            });
            summaryMsg = `Validation rejected: ${errorData.detail.map((e: any) => e.msg || "Invalid value").join("; ")}`;
          } else if (errorData.message || errorData.error) {
            summaryMsg = errorData.message || errorData.error;
          }
        }

        setErrorMessage(summaryMsg);
        setStatus("ERROR");
        toast.error(summaryMsg);
        return;
      }

      const result: PrioritizationResponse = await response.json();
      setRankedResult(result);
      setStatus("SUCCESS");

      // Synchronize successful feeder identifiers to Engine D store
      setSelectedFeeders(payload.assets.map((a) => a.feeder_id));
      if (payload.query_id) {
        setActiveAreaId(payload.query_id);
      }

      toast.success(
        `Ranking completed successfully! Evaluated ${result.ranked_assets.length} grid assets.`
      );
    } catch (err: any) {
      const msg = err?.message || "Failed to dispatch payload to Go Gateway.";
      setErrorMessage(msg);
      setStatus("ERROR");
      toast.error(msg);
    }
  };

  const assetsCount = fields.length;
  const isAssetsValid = assetsCount >= 2;

  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <form onSubmit={handleSubmit(onSubmit as any)} className="space-y-6">
      {/* Area Context Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 rounded-2xl bg-white/40 border border-white/60 shadow-sm backdrop-blur-md">
        <div className="flex items-center gap-3">
          <Building2 className="w-5 h-5 text-emerald-700 shrink-0" />
          <div>
            <label htmlFor="engine-d-query-id" className="text-xs font-semibold text-slate-800 uppercase tracking-wider block">
              Operational Area / Query Identifier (UUID)
            </label>
            <p className="text-[11px] text-slate-500">
              Groups candidate feeder assets into a common geographic and electrical cluster
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 max-w-md w-full">
          <input
            id="engine-d-query-id"
            type="text"
            disabled={status === "SUBMITTING"}
            {...register("query_id")}
            onChange={(e) => {
              setValue("query_id", e.target.value);
              setActiveAreaId(e.target.value);
            }}
            placeholder="e.g. 7a8b9c0d-1e2f-4a5b-8c9d-0e1f2a3b4c5d"
            className={`w-full bg-white/70 border ${
              errors.query_id ? "border-rose-400 ring-1 ring-rose-400" : "border-slate-200/80"
            } focus:ring-2 focus:ring-emerald-500/50 focus:bg-white rounded-xl px-3 py-1.5 text-xs text-slate-800 font-mono transition-all`}
          />
        </div>
      </div>

      {errors.query_id && (
        <p className="text-xs text-rose-500 font-medium px-2">{errors.query_id.message}</p>
      )}

      {/* Staging Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200/60">
        <div>
          <h3 className="text-base font-semibold text-slate-900">
            Multi-Asset Telemetry Fusion Matrix
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Stage cross-engine intelligence signals (Reliability, Risk, Anomaly) for listwise ONNX ranking
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={handleStageFusedBaseline}
            disabled={status === "SUBMITTING"}
          >
            <Wand2 className="w-3.5 h-3.5 mr-1 text-emerald-600" />
            <span>Stage 3-Feeder Baseline</span>
          </Button>

          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handleAddFeederRow}
            disabled={status === "SUBMITTING"}
          >
            <Plus className="w-3.5 h-3.5 mr-1 text-slate-600" />
            <span>Add Feeder</span>
          </Button>

          {assetsCount > 0 && (
            <Button
              type="button"
              size="sm"
              variant="danger"
              onClick={() => replace([])}
              disabled={status === "SUBMITTING"}
            >
              <Trash2 className="w-3.5 h-3.5 mr-1" />
              <span>Clear</span>
            </Button>
          )}
        </div>
      </div>

      {/* Alert Banner for ERROR */}
      <AnimatePresence>
        {status === "ERROR" && errorMessage && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex items-start gap-3 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 backdrop-blur-md shadow-[inset_0_1px_1px_rgba(255,255,255,0.8)]"
          >
            <AlertCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
            <div className="flex-1 text-xs">
              <p className="font-semibold text-rose-800">Ranking Request Rejected</p>
              <p className="text-rose-700/90 mt-0.5 leading-relaxed">{errorMessage}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Success Banner for SUCCESS */}
      <AnimatePresence>
        {status === "SUCCESS" && rankedResult && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex items-start gap-3 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 backdrop-blur-md shadow-[inset_0_1px_1px_rgba(255,255,255,0.8)]"
          >
            <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5 animate-pulse" />
            <div className="flex-1 text-xs">
              <p className="font-semibold text-emerald-900">
                Prioritization Ingestion &amp; Execution Complete
              </p>
              <p className="text-emerald-800 mt-0.5">
                Evaluated {rankedResult.ranked_assets.length} feeders under model version {rankedResult.model_version}.
                Rankings persisted to PostgreSQL.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Asset Count Badge */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2 text-xs">
          <span className="font-medium text-slate-600">Batch Asset Depth:</span>
          <span
            className={`font-semibold px-2.5 py-0.5 rounded-md ${
              isAssetsValid
                ? "bg-emerald-500/15 text-emerald-800 border border-emerald-500/30"
                : "bg-amber-500/15 text-amber-800 border border-amber-500/30"
            }`}
          >
            {assetsCount} Assets {isAssetsValid ? "(Ready for listwise ranking)" : "(Requires >= 2 feeders)"}
          </span>
        </div>

        {errors.assets?.message && (
          <p className="text-xs text-rose-500 font-medium">{errors.assets.message}</p>
        )}
      </div>

      {/* Table Container */}
      {assetsCount === 0 ? (
        <div className="p-10 text-center rounded-2xl bg-white/30 border border-white/60 backdrop-blur-sm">
          <Layers className="w-10 h-10 text-slate-400 mx-auto mb-3 opacity-60" />
          <p className="text-sm font-medium text-slate-700">No candidate feeders staged</p>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            Click &ldquo;Stage 3-Feeder Baseline&rdquo; to populate multi-engine operational telemetry, or manually add feeder rows.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-white/60 bg-white/20 backdrop-blur-md max-h-[500px] overflow-y-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="sticky top-0 bg-white/85 backdrop-blur-md border-b border-white/60 text-slate-700 z-10 shadow-sm">
              <tr>
                <th className="py-2.5 px-3 font-semibold w-10 text-center">#</th>
                <th className="py-2.5 px-3 font-semibold">Feeder Identifier</th>
                <th className="py-2.5 px-3 font-semibold w-28">Reliability (A)</th>
                <th className="py-2.5 px-3 font-semibold w-24">Dur. Pen (A)</th>
                <th className="py-2.5 px-3 font-semibold w-24">Freq. Pen (A)</th>
                <th className="py-2.5 px-3 font-semibold w-24">Risk (B)</th>
                <th className="py-2.5 px-3 font-semibold w-20 text-center">Anomaly (C)</th>
                <th className="py-2.5 px-3 font-semibold w-24">Anom. Conf (C)</th>
                <th className="py-2.5 px-3 font-semibold w-10 text-center"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/40">
              {fields.map((field, index) => {
                const rowErrors = errors.assets?.[index];

                return (
                  <tr key={field.id} className="hover:bg-white/40 transition-colors duration-150">
                    {/* Index */}
                    <td className="py-2 px-3 text-center text-slate-400 font-mono">
                      {index + 1}
                    </td>

                    {/* Feeder ID */}
                    <td className="py-2 px-3">
                      <input
                        type="text"
                        disabled={status === "SUBMITTING"}
                        {...register(`assets.${index}.feeder_id`)}
                        className={`w-full bg-white/50 border ${
                          rowErrors?.feeder_id ? "border-rose-400 ring-1 ring-rose-400" : "border-white/60"
                        } focus:ring-2 focus:ring-emerald-500/50 focus:bg-white rounded-lg px-2 py-1 text-xs text-slate-800 font-mono transition-all`}
                      />
                      {rowErrors?.feeder_id && (
                        <p className="text-[10px] text-rose-500 mt-0.5">{rowErrors.feeder_id.message}</p>
                      )}
                    </td>

                    {/* Reliability Score */}
                    <td className="py-2 px-3">
                      <input
                        type="number"
                        step="0.1"
                        disabled={status === "SUBMITTING"}
                        {...register(`assets.${index}.reliability_score`, { valueAsNumber: true })}
                        className={`w-full bg-white/50 border ${
                          rowErrors?.reliability_score ? "border-rose-400 ring-1 ring-rose-400" : "border-white/60"
                        } focus:ring-2 focus:ring-emerald-500/50 focus:bg-white rounded-lg px-2 py-1 text-xs text-slate-800 transition-all`}
                      />
                      {rowErrors?.reliability_score && (
                        <p className="text-[10px] text-rose-500 mt-0.5">{rowErrors.reliability_score.message}</p>
                      )}
                    </td>

                    {/* Duration Penalty */}
                    <td className="py-2 px-3">
                      <input
                        type="number"
                        step="0.01"
                        disabled={status === "SUBMITTING"}
                        {...register(`assets.${index}.duration_penalty`, { valueAsNumber: true })}
                        className={`w-full bg-white/50 border ${
                          rowErrors?.duration_penalty ? "border-rose-400 ring-1 ring-rose-400" : "border-white/60"
                        } focus:ring-2 focus:ring-emerald-500/50 focus:bg-white rounded-lg px-2 py-1 text-xs text-slate-800 transition-all`}
                      />
                    </td>

                    {/* Frequency Penalty */}
                    <td className="py-2 px-3">
                      <input
                        type="number"
                        step="0.01"
                        disabled={status === "SUBMITTING"}
                        {...register(`assets.${index}.frequency_penalty`, { valueAsNumber: true })}
                        className={`w-full bg-white/50 border ${
                          rowErrors?.frequency_penalty ? "border-rose-400 ring-1 ring-rose-400" : "border-white/60"
                        } focus:ring-2 focus:ring-emerald-500/50 focus:bg-white rounded-lg px-2 py-1 text-xs text-slate-800 transition-all`}
                      />
                    </td>

                    {/* Risk Score */}
                    <td className="py-2 px-3">
                      <input
                        type="number"
                        step="0.1"
                        disabled={status === "SUBMITTING"}
                        {...register(`assets.${index}.risk_score`, { valueAsNumber: true })}
                        className={`w-full bg-white/50 border ${
                          rowErrors?.risk_score ? "border-rose-400 ring-1 ring-rose-400" : "border-white/60"
                        } focus:ring-2 focus:ring-emerald-500/50 focus:bg-white rounded-lg px-2 py-1 text-xs text-slate-800 transition-all`}
                      />
                    </td>

                    {/* Is Anomaly Checkbox */}
                    <td className="py-2 px-3 text-center">
                      <input
                        type="checkbox"
                        disabled={status === "SUBMITTING"}
                        {...register(`assets.${index}.is_anomaly`)}
                        className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer"
                      />
                    </td>

                    {/* Anomaly Confidence */}
                    <td className="py-2 px-3">
                      <input
                        type="number"
                        step="0.01"
                        disabled={status === "SUBMITTING"}
                        {...register(`assets.${index}.anomaly_confidence`, { valueAsNumber: true })}
                        className={`w-full bg-white/50 border ${
                          rowErrors?.anomaly_confidence ? "border-rose-400 ring-1 ring-rose-400" : "border-white/60"
                        } focus:ring-2 focus:ring-emerald-500/50 focus:bg-white rounded-lg px-2 py-1 text-xs text-slate-800 transition-all`}
                      />
                    </td>

                    {/* Remove Action */}
                    <td className="py-2 px-3 text-center">
                      <button
                        type="button"
                        onClick={() => remove(index)}
                        disabled={status === "SUBMITTING"}
                        className="p-1 text-slate-400 hover:text-rose-500 transition-colors disabled:opacity-30 cursor-pointer"
                        title="Remove Feeder"
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

      {/* Form Submission Footer */}
      <div className="pt-2 flex items-center justify-between">
        <div className="text-xs text-slate-500">
          {isAssetsValid ? (
            <span className="text-emerald-700 font-medium">Batch ready for comparative ranking</span>
          ) : (
            <span className="text-amber-700 font-medium">Minimum 2 candidate feeders required</span>
          )}
        </div>

        <Button
          size="default"
          type="submit"
          variant="default"
          disabled={status === "SUBMITTING" || !isAssetsValid}
          isLoading={status === "SUBMITTING"}
        >
          <Send className="w-4 h-4 mr-1.5" />
          <span>Execute Listwise Ranking</span>
        </Button>
      </div>
    </form>
  );
}
