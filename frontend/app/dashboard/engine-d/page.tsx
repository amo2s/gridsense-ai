"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { 
  ShieldAlert, 
  RefreshCw, 
  AlertTriangle, 
  Cpu, 
  Layers, 
  Sparkles, 
  Plus, 
  Clock, 
  CheckCircle2,
  Building2,
  ArrowRight
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useEngineDStore } from "@/store/engine-d-store";
import { useEngineDQuery } from "@/hooks/use-engine-d-query";
import { useAlertStore } from "@/store/alert-store";
import PriorityMatrixTable from "@/components/engine-d/priority-matrix-table";
import ShapAttributionWaterfall from "@/components/engine-d/shap-attribution-waterfall";
import InterventionActionDialog from "@/components/engine-d/intervention-action-dialog";
import { RankedAsset } from "@/types/engine-d";

export default function EngineDDashboardPage() {
  const activeAreaId = useEngineDStore((state) => state.activeAreaId);
  const setActiveAreaId = useEngineDStore((state) => state.setActiveAreaId);
  const activeFeederId = useEngineDStore((state) => state.activeFeederId);

  // Phase 3: Query & Resilient Circuit Breaker
  const {
    data: prioritizationData,
    isLoading,
    isFetching,
    isError,
    error,
    isCircuitBreakerOpen,
    circuitBreakerRemainingSeconds,
    resetCircuitBreaker,
    refetch,
  } = useEngineDQuery();

  // State for active intervention dialog
  const [selectedInterventionAsset, setSelectedInterventionAsset] = useState<RankedAsset | null>(null);
  const [isInterventionModalOpen, setIsInterventionModalOpen] = useState(false);
  const [isCriticalAlertActive, setIsCriticalAlertActive] = useState(false);

  // Real-Time Alert Stream Subscription (gridsense:alerts:stream)
  const alerts = useAlertStore((state) => state.alerts);

  useEffect(() => {
    if (!alerts || alerts.length === 0) return;

    const latestAlert = alerts[0];
    const isEngineDAlert =
      latestAlert.message?.includes("Engine D") ||
      latestAlert.severity === "CRITICAL" ||
      latestAlert.is_critical;

    if (isEngineDAlert) {
      setIsCriticalAlertActive(true);
      toast.error(`CRITICAL GRID ALERT: ${latestAlert.message}`, {
        description: `Originating Target: Feeder ${latestAlert.feeder_id} • Urgency Breach`,
        duration: 8000,
      });

      // Automatically mount intervention for the top-ranked or alert feeder
      if (prioritizationData && prioritizationData.ranked_assets.length > 0) {
        const matchingAsset =
          prioritizationData.ranked_assets.find((a) => a.feeder_id === latestAlert.feeder_id) ||
          prioritizationData.ranked_assets[0];

        setSelectedInterventionAsset(matchingAsset);
        setIsInterventionModalOpen(true);
      }
    }
  }, [alerts, prioritizationData]);

  // Resolve currently active asset for SHAP Waterfall inspection
  const activeSelectedAsset = useMemo(() => {
    if (!prioritizationData?.ranked_assets || prioritizationData.ranked_assets.length === 0) {
      return null;
    }
    return (
      prioritizationData.ranked_assets.find((a) => a.feeder_id === activeFeederId) ||
      prioritizationData.ranked_assets[0]
    );
  }, [prioritizationData, activeFeederId]);

  return (
    <div className="max-w-7xl mx-auto w-full p-6 lg:p-8 flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Page Header */}
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200/50">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-light tracking-tight text-slate-900">
              Engine D: Intervention Prioritization
            </h1>
            <span className="text-[10px] font-mono font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-800 border border-emerald-500/30">
              Query Pathway
            </span>
          </div>
          <p className="text-xs font-semibold tracking-[0.2em] text-slate-500 uppercase mt-1">
            Learning-To-Rank Optimization &amp; Explainable AI (XAI)
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/dashboard/ingestion/engine-d">
            <Button size="sm" variant="outline" className="border-slate-300 text-slate-700">
              <Plus className="w-3.5 h-3.5 mr-1" />
              <span>Stage Telemetry</span>
            </Button>
          </Link>

          <Button
            size="sm"
            variant="default"
            disabled={isFetching || isCircuitBreakerOpen}
            onClick={() => refetch()}
            className="bg-emerald-700 hover:bg-emerald-800 text-white"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isFetching ? "animate-spin" : ""}`} />
            <span>Re-Rank Area</span>
          </Button>
        </div>
      </header>

      {/* Circuit Breaker Alert Banner: Explicit HTTP 503 Degradation State */}
      <AnimatePresence>
        {isCircuitBreakerOpen && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="w-full p-6 rounded-3xl bg-rose-500/15 border-2 border-rose-500/40 backdrop-blur-2xl shadow-[0_12px_32px_rgba(244,63,94,0.25)] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5"
          >
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-rose-600 text-white flex items-center justify-center shrink-0 shadow-md">
                <AlertTriangle className="w-6 h-6 animate-pulse" />
              </div>
              <div className="flex flex-col gap-1">
                <h3 className="text-base font-bold text-rose-900 tracking-wide flex items-center gap-2">
                  <span>HTTP 503 SERVICE UNAVAILABLE: ENGINE D CIRCUIT BREAKER TRIPPED</span>
                </h3>
                <p className="text-xs text-rose-800 leading-relaxed max-w-2xl">
                  Upstream Go Gateway / Engine D ONNX runtime exceeded the maximum 3-consecutive failure threshold.
                  Requests are halted to prevent cascading failure. Automatic cooldown active.
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <Clock className="w-3.5 h-3.5 text-rose-700" />
                  <span className="text-xs font-mono font-bold text-rose-900">
                    Cool-off Remaining: {circuitBreakerRemainingSeconds}s
                  </span>
                </div>
              </div>
            </div>

            <Button
              type="button"
              variant="danger"
              size="sm"
              onClick={resetCircuitBreaker}
              className="bg-rose-600 hover:bg-rose-700 text-white shadow-sm shrink-0"
            >
              Force Reset Circuit Breaker
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Standard Error Banner */}
      <AnimatePresence>
        {!isCircuitBreakerOpen && isError && error && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex items-start gap-3 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 backdrop-blur-md shadow-sm"
          >
            <ShieldAlert className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
            <div className="flex-1 text-xs">
              <p className="font-semibold text-rose-800">Ranking Evaluation Failed</p>
              <p className="text-rose-700 mt-0.5">{error.message}</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => refetch()} className="text-xs h-7">
              Retry Query
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Area Context Metadata Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-2xl bg-white/40 border border-white/60 backdrop-blur-md shadow-sm">
        <div className="flex items-center gap-3">
          <Building2 className="w-5 h-5 text-emerald-700 shrink-0" />
          <div>
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
              Active Operational Area (Query Scope)
            </span>
            <span className="text-xs font-mono font-bold text-slate-800">
              {activeAreaId || "Unassigned Area"}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs text-slate-600 font-mono">
          {prioritizationData?.model_version && (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-white/60 border border-slate-200">
              <Cpu className="w-3.5 h-3.5 text-slate-500" />
              <span>Model: {prioritizationData.model_version}</span>
            </div>
          )}
          {prioritizationData?.generated_at && (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-white/60 border border-slate-200">
              <Clock className="w-3.5 h-3.5 text-slate-500" />
              <span>{new Date(prioritizationData.generated_at).toLocaleTimeString()}</span>
            </div>
          )}
        </div>
      </div>

      {/* Main Grid: Priority Decision Table & SHAP Waterfall */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Priority Matrix Table */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          <PriorityMatrixTable
            rankedAssets={prioritizationData?.ranked_assets || []}
            isCriticalAlertActive={isCriticalAlertActive}
            onSelectIntervention={(asset) => {
              setSelectedInterventionAsset(asset);
              setIsInterventionModalOpen(true);
            }}
          />
        </div>

        {/* Right Column: SHAP Attribution Waterfall */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          <ShapAttributionWaterfall selectedAsset={activeSelectedAsset} />
        </div>
      </div>

      {/* Operator Intervention Modal Dialog */}
      <InterventionActionDialog
        asset={selectedInterventionAsset}
        isOpen={isInterventionModalOpen}
        onClose={() => {
          setIsInterventionModalOpen(false);
          setSelectedInterventionAsset(null);
          setIsCriticalAlertActive(false);
        }}
        onActionComplete={(action, feederId) => {
          toast.info(`Intervention state synchronized for Feeder ${feederId}`);
        }}
      />
    </div>
  );
}
