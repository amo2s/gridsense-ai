"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { motion, AnimatePresence, Variants } from "framer-motion";
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  Building2,
  CheckCircle2,
  Clock,
  Cpu,
  Database,
  Flame,
  Layers,
  Radio,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";
import { useFeederStore } from "@/store/feeder-store";
import { useEngineCAnomaly } from "@/hooks/use-engine-c-anomaly";
import { AnomalySeverity } from "@/types/engine-c-anomaly";

import TriLayerAnomalyMatrix from "@/components/dashboard/engine-c/tri-layer-anomaly-matrix";
import SeasonalSTLTunnelChart from "@/components/dashboard/engine-c/seasonal-stl-tunnel-chart";
import SHAPDivergenceWaterfall from "@/components/dashboard/engine-c/shap-divergence-waterfall";
import ChartErrorBoundary from "@/components/dashboard/engine-c/chart-error-boundary";

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.04,
    },
  },
};

const cardItemVariants: Variants = {
  hidden: { opacity: 0, y: 16, scale: 0.98 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      type: "spring",
      stiffness: 240,
      damping: 26,
    },
  },
};

/**
 * ============================================================================
 * VISUAL RISK STRATIFICATION MATRIX (PHASE 2, STEP 2.4)
 * ============================================================================
 * Maps aggregate risk score [0 - 100] to dynamic styling matrices:
 *  - Score > 66 (CRITICAL): Crimson text, crimson Liquid Glass alarm background, strobe/pulse.
 *  - Score 33 - 66 (ELEVATED): Amber typography and warning backgrounds.
 *  - Score < 33 (STABLE): Continuous emerald indicators and stable background panels.
 */
function getRiskStratification(score: number, severity: AnomalySeverity) {
  if (score > 66 || severity === "CRITICAL") {
    return {
      tier: "CRITICAL" as const,
      label: "CRITICAL ALARM",
      textClass: "text-rose-600",
      accentText: "text-rose-700",
      bgClass: "bg-gradient-to-br from-rose-500/15 via-white/50 to-white/20",
      borderClass: "border-rose-500/35",
      badgeClass: "bg-rose-500/15 text-rose-800 border-rose-500/35",
      glowShadow: "shadow-[0_0_35px_rgba(244,63,94,0.22)] shadow-[inset_1px_1px_2px_rgba(255,255,255,0.9),inset_-1px_-1px_3px_rgba(255,255,255,0.1)]",
      pulseClass: "animate-pulse",
      barColor: "bg-rose-500",
      icon: AlertOctagon,
      statusMessage: "Multi-layer anomaly breach detected. Critical load/voltage deviation exceeds safety limits.",
    };
  }

  if (score >= 33 || severity === "HIGH" || severity === "MEDIUM") {
    return {
      tier: "ELEVATED" as const,
      label: "ELEVATED RISK",
      textClass: "text-amber-600",
      accentText: "text-amber-800",
      bgClass: "bg-gradient-to-br from-amber-500/15 via-white/50 to-white/20",
      borderClass: "border-amber-500/35",
      badgeClass: "bg-amber-500/15 text-amber-800 border-amber-500/35",
      glowShadow: "shadow-[0_0_25px_rgba(245,158,11,0.18)] shadow-[inset_1px_1px_2px_rgba(255,255,255,0.9),inset_-1px_-1px_3px_rgba(255,255,255,0.1)]",
      pulseClass: "",
      barColor: "bg-amber-500",
      icon: AlertTriangle,
      statusMessage: "Moderate variance detected. STL seasonal baseline approaching warning bounds.",
    };
  }

  return {
    tier: "STABLE" as const,
    label: "GRID STABLE",
    textClass: "text-emerald-700",
    accentText: "text-emerald-800",
    bgClass: "bg-gradient-to-br from-emerald-500/10 via-white/50 to-white/20",
    borderClass: "border-emerald-500/30",
    badgeClass: "bg-emerald-500/15 text-emerald-800 border-emerald-500/30",
    glowShadow: "shadow-[0_0_20px_rgba(16,185,129,0.12)] shadow-[inset_1px_1px_2px_rgba(255,255,255,0.9),inset_-1px_-1px_3px_rgba(255,255,255,0.1)]",
    pulseClass: "",
    barColor: "bg-emerald-500",
    icon: CheckCircle2,
    statusMessage: "Operational telemetry strictly bounded within physical baseline envelopes.",
  };
}

/**
 * ============================================================================
 * ENGINE C ANOMALY INTELLIGENCE DASHBOARD (PHASE 2 & PHASE 3 QUERY PATHWAY)
 * ============================================================================
 * Read-only materialized operational view consuming data from the Go API Gateway
 * via TanStack Query polling at 30,000ms cadence, with event-driven Redis SSE cache
 * invalidation on critical emergency events.
 *
 * Phase 3 Architecture:
 *  - Step 3.1: Tri-Layer Anomaly Matrix (MAD, STL, PyOD) with Framer Motion spring physics
 *  - Step 3.2: Seasonal STL Residual Tunnel Chart with 60 FPS HTML5 Canvas fallback
 *  - Step 3.3 & 3.4: Horizontal SHAP Divergence Waterfall with Electrical Engineering Dictionary
 *  - Step 3.5: Strict deep-equality render optimization via fast-deep-equal
 */
export default function EngineCDashboardPage() {
  const activeFeederId = useFeederStore((state) => state.activeFeederId);
  const activeSubstationId = useFeederStore((state) => state.activeSubstationId);

  const {
    data,
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
    dataUpdatedAt,
    dispatchMockAlert,
    isDegraded,
    degradedMessage,
    lastSuccessfulSync,
  } = useEngineCAnomaly();

  // Cadence timer for live visual feedback of the 30-second polling cycle
  const [countdown, setCountdown] = useState(30);

  useEffect(() => {
    setCountdown(30);
  }, [dataUpdatedAt]);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => (prev > 1 ? prev - 1 : 30));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const riskScore = data?.risk_score ?? 0;
  const severity = data?.severity ?? "LOW";
  const strat = getRiskStratification(riskScore, severity);
  const StratIcon = strat.icon;

  const lastFetchTime = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString()
    : "Syncing...";

  // State 0: Unified Empty State when Feeder Context is unselected
  if (!activeFeederId) {
    return (
      <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
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
            Engine C anomaly intelligence requires an active feeder context binding.
            Please select a feeder from the global asset selector in the navigation sidebar.
          </p>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/60 border border-white/80 text-xs font-mono text-slate-500 shadow-xs">
            <span>Query Pathway:</span>
            <span className="text-teal-700 font-semibold">useFeederStore (Phase 0.2)</span>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6"
    >
      {/* Blueprint Step 4.4: Degraded State UI Fallback (HTTP 503 Systemic Degradation) */}
      <AnimatePresence>
        {isDegraded && (
          <motion.div
            initial={{ opacity: 0, y: -16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -16, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 350, damping: 28 }}
            className="rounded-3xl border border-amber-500/40 bg-gradient-to-r from-amber-500/20 via-amber-500/10 to-orange-500/15 backdrop-blur-2xl p-5 shadow-[inset_1px_1px_2px_rgba(255,255,255,0.8),inset_-1px_-1px_3px_rgba(255,255,255,0.1)] shadow-[0_16px_40px_-8px_rgba(245,158,11,0.2)]"
            data-testid="degraded-state-banner"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start sm:items-center gap-3.5">
                <div className="p-3 rounded-2xl bg-amber-500/25 border border-amber-500/40 text-amber-700 shadow-xs shrink-0">
                  <AlertTriangle className="w-5 h-5 animate-pulse" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider bg-amber-500/25 text-amber-900 border border-amber-500/40">
                      HTTP 503 INTERCEPTED
                    </span>
                    <h3 className="text-sm font-bold text-slate-900 tracking-tight">
                      SYSTEMIC DEGRADATION: PYTHON ENGINE C OFFLINE - GATEWAY HTTP 503
                    </h3>
                  </div>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                    Upstream Python ML inference engine is currently unreachable. Aggressive polling retries have been suppressed to protect the Go Gateway. Displaying cached anomaly intelligence to preserve operational situational awareness.
                  </p>
                </div>
              </div>
              <div className="flex sm:flex-col items-center sm:items-end justify-between border-t sm:border-t-0 border-amber-500/20 pt-2 sm:pt-0 shrink-0">
                <span className="text-[10px] uppercase font-mono font-bold tracking-wider text-amber-900/70">
                  Situational Awareness
                </span>
                <span className="text-xs font-mono font-bold text-amber-950 bg-amber-500/20 px-2.5 py-1 rounded-xl border border-amber-500/30">
                  Last Successful Sync: {lastSuccessfulSync || "Awaiting Telemetry"}
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Dynamic Header: Global Zustand Asset Context & Polling Status */}
      <motion.div
        variants={cardItemVariants}
        className="rounded-3xl border border-white/60 bg-white/40 backdrop-blur-2xl p-6 shadow-[inset_1px_1px_2px_rgba(255,255,255,0.9),inset_-1px_-1px_3px_rgba(255,255,255,0.1)] shadow-[0_16px_40px_-8px_rgba(15,23,42,0.1)] flex flex-col md:flex-row md:items-center justify-between gap-5"
      >
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="text-xs uppercase font-bold tracking-widest text-slate-400">
              Query Pathway
            </span>

            {/* Feeder Badge */}
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-700 border border-emerald-500/30 shadow-xs">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <Zap className="w-3 h-3 text-emerald-600" />
              <span>Feeder:</span>
              <span className="font-mono">{activeFeederId}</span>
            </span>

            {/* Substation Badge */}
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border shadow-xs ${
              activeSubstationId
                ? "bg-teal-500/10 text-teal-800 border-teal-500/30"
                : "bg-amber-500/10 text-amber-800 border-amber-500/30"
            }`}>
              <Building2 className="w-3 h-3 text-teal-600" />
              <span>Substation:</span>
              <span className="font-mono">{activeSubstationId || "Unassigned"}</span>
            </span>

            {/* Polling Cadence Badge */}
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono font-medium bg-slate-100 text-slate-600 border border-slate-200">
              <Clock className="w-3 h-3 text-slate-500" />
              <span>Poll: 30s</span>
              <span className="text-slate-400">({countdown}s)</span>
            </span>

            {/* Redis Stream Connection Badge */}
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono font-medium bg-blue-500/10 text-blue-700 border border-blue-500/30">
              <Radio className="w-3 h-3 text-blue-600 animate-pulse" />
              <span>Redis SSE: Active</span>
            </span>
          </div>

          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 mt-2">
            Engine C: Multivariate Anomaly Intelligence
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Materialized Operational View &bull; Multi-Layer Statistical, Seasonal & Ensemble Detection
          </p>
        </div>

        {/* Action Controls & Diagnostic Verification Triggers */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Test SSE Alert Button (Step 2.3 Verification) */}
          <button
            type="button"
            onClick={() => dispatchMockAlert("CRITICAL")}
            title="Simulate critical Redis stream alert triggering immediate out-of-cycle cache invalidation"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-rose-800 bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 rounded-xl shadow-xs transition-all duration-200 cursor-pointer"
          >
            <Flame className="w-3.5 h-3.5 text-rose-600 animate-pulse" />
            <span>Simulate SSE Alert</span>
          </button>

          {/* Manual Refetch */}
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white/70 hover:bg-white border border-white/90 rounded-xl shadow-xs transition-all duration-200 disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${isFetching ? "animate-spin" : ""}`} />
            <span>Sync</span>
          </button>

          {/* CQRS Link to Command Pathway */}
          <Link
            href="/dashboard/ingestion/engine-c"
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-white bg-slate-900 hover:bg-slate-800 rounded-xl shadow-md hover:shadow-lg transition-all duration-200"
          >
            <span>Stage Ingestion</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </motion.div>

      {/* Critical Alarm Alert Banner (Rendered when riskScore > 66) */}
      <AnimatePresence>
        {riskScore > 66 && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.99 }}
            className="p-4 rounded-3xl bg-rose-500/15 border border-rose-500/40 backdrop-blur-2xl shadow-[0_0_30px_rgba(244,63,94,0.25)] flex items-center justify-between gap-4"
          >
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-rose-600 text-white shadow-md animate-pulse">
                <AlertOctagon className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-rose-950 flex items-center gap-2">
                  <span>CRITICAL ANOMALY ALERT</span>
                  <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-rose-600 text-white">
                    Severity: {severity}
                  </span>
                </h4>
                <p className="text-xs text-rose-900/90 mt-0.5">
                  Multi-layer anomaly breach confirmed on {activeFeederId}. Active operational risk score: {riskScore}/100.
                </p>
              </div>
            </div>
            <Link
              href="/dashboard/ingestion/engine-c"
              className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-rose-600 text-white text-xs font-semibold hover:bg-rose-700 shadow-sm transition-all"
            >
              <span>Inspect Command Pipeline</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Primary KPI Grid (Step 2.4: Visual Risk Stratification) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* KPI 1: Visual Risk Stratification Aggregate Score */}
        <motion.div
          variants={cardItemVariants}
          className={`rounded-3xl border ${strat.borderClass} ${strat.bgClass} backdrop-blur-2xl p-6 ${strat.glowShadow} flex flex-col justify-between`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase font-bold tracking-wider text-slate-500">
              Anomaly Risk Score
            </span>
            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase border ${strat.badgeClass} ${strat.pulseClass}`}>
              {strat.label}
            </span>
          </div>

          <div className="my-4 flex items-baseline gap-2">
            <span className={`text-4xl sm:text-5xl font-black font-mono tracking-tight ${strat.textClass}`}>
              {riskScore}
            </span>
            <span className="text-xs font-bold font-mono text-slate-400">/ 100</span>
          </div>

          <div>
            {/* Progress Bar */}
            <div className="w-full h-2 rounded-full bg-slate-200/60 overflow-hidden mb-2">
              <div
                className={`h-full ${strat.barColor} transition-all duration-500`}
                style={{ width: `${Math.min(100, Math.max(0, riskScore))}%` }}
              />
            </div>
            <p className="text-[11px] text-slate-600 leading-snug">
              Confidence: {(data?.confidence_score ?? 0).toFixed(2)} &bull; {strat.statusMessage}
            </p>
          </div>
        </motion.div>

        {/* KPI 2: Anomaly State & Classification */}
        <motion.div
          variants={cardItemVariants}
          className="rounded-3xl border border-white/60 bg-white/40 backdrop-blur-2xl p-6 shadow-[inset_1px_1px_2px_rgba(255,255,255,0.9),inset_-1px_-1px_3px_rgba(255,255,255,0.1)] shadow-[0_16px_40px_-8px_rgba(15,23,42,0.08)] flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase font-bold tracking-wider text-slate-500">
              Classification
            </span>
            <StratIcon className={`w-4 h-4 ${strat.textClass}`} />
          </div>

          <div className="my-3">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
                {data?.is_anomaly ? "Anomalous" : "Conforming"}
              </span>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase border ${strat.badgeClass}`}>
                {severity}
              </span>
              <span className="text-xs text-slate-400 font-mono">
                {data?.is_anomaly ? "Intervention Advised" : "Normal Envelope"}
              </span>
            </div>
          </div>

          <div className="text-[11px] text-slate-500 flex items-center gap-1.5 font-mono">
            <Cpu className="w-3.5 h-3.5 text-slate-400" />
            <span className="truncate">{data?.model_version || "engine_c_v2_isolation_forest"}</span>
          </div>
        </motion.div>

        {/* KPI 3: Infrastructure SLA & Latency */}
        <motion.div
          variants={cardItemVariants}
          className="rounded-3xl border border-white/60 bg-white/40 backdrop-blur-2xl p-6 shadow-[inset_1px_1px_2px_rgba(255,255,255,0.9),inset_-1px_-1px_3px_rgba(255,255,255,0.1)] shadow-[0_16px_40px_-8px_rgba(15,23,42,0.08)] flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase font-bold tracking-wider text-slate-500">
              Pipeline SLA
            </span>
            <Database className="w-4 h-4 text-slate-400" />
          </div>

          <div className="my-3">
            <div className="flex items-baseline gap-1.5">
              <span className="text-3xl font-bold font-mono text-slate-900">
                {(data?.inference_latency_ms ?? 0).toFixed(1)}
              </span>
              <span className="text-xs font-mono text-slate-500">ms inference</span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Gateway Budget: 8000ms &bull; p99 &lt; 35ms
            </p>
          </div>

          <div className="text-[11px] text-slate-500 flex items-center justify-between border-t border-slate-200/50 pt-2 font-mono">
            <span>Last Sync:</span>
            <span className="text-slate-700 font-medium">{lastFetchTime}</span>
          </div>
        </motion.div>
      </div>

      {/* Blueprint Step 3.1 & 4.3: Tri-Layer Anomaly Detection Matrix with Isolated Error Boundary */}
      <motion.div variants={cardItemVariants}>
        <ChartErrorBoundary
          componentName="Tri-Layer Anomaly Matrix"
          fallbackTitle="ENGINE C FAULT TRAPPED: TRI-LAYER ANOMALY MATRIX"
          fallbackDescription="The Multi-Layer Anomaly KPI matrix encountered a localized rendering exception. Real-time telemetry ingestion and adjacent charting modules remain live."
        >
          <TriLayerAnomalyMatrix
            layerFlags={
              data?.layer_flags ?? {
                layer1_stat: false,
                layer2_seas: false,
                layer3_multi: false,
              }
            }
            confidenceScore={data?.confidence_score ?? 0}
            severity={severity}
            riskScore={riskScore}
            isAnomaly={Boolean(data?.is_anomaly)}
            activeFeederId={activeFeederId}
            inferenceLatencyMs={data?.inference_latency_ms ?? 0}
          />
        </ChartErrorBoundary>
      </motion.div>

      {/* Blueprint Step 3.2 & 4.3: Seasonal STL Residual Tunnel Chart with Isolated Error Boundary */}
      <motion.div variants={cardItemVariants}>
        <ChartErrorBoundary
          componentName="Seasonal STL Residual Tunnel"
          fallbackTitle="ENGINE C FAULT TRAPPED: SEASONAL STL RESIDUAL TUNNEL"
          fallbackDescription="The Seasonal STL timeline chart encountered an SVG calculation exception. Statistical outlier monitoring and multivariate models remain live."
        >
          <SeasonalSTLTunnelChart
            telemetry={data?.stl_telemetry ?? []}
            isAnomaly={Boolean(data?.is_anomaly)}
            severity={severity}
            activeFeederId={activeFeederId}
          />
        </ChartErrorBoundary>
      </motion.div>

      {/* Blueprint Step 3.3, 3.4 & 4.3: Horizontal SHAP Divergence Waterfall with Isolated Error Boundary */}
      <motion.div variants={cardItemVariants}>
        <ChartErrorBoundary
          componentName="SHAP Divergence Waterfall"
          fallbackTitle="ENGINE C FAULT TRAPPED: SHAP DIVERGENCE WATERFALL"
          fallbackDescription="The explainable AI divergence waterfall encountered a feature attribution rendering exception. Point-outlier and seasonal drift tracking remain live."
        >
          <SHAPDivergenceWaterfall
            attributions={data?.ranked_attributions ?? []}
            isAnomaly={Boolean(data?.is_anomaly)}
            activeFeederId={activeFeederId}
            confidenceScore={data?.confidence_score ?? 0}
          />
        </ChartErrorBoundary>
      </motion.div>

      {/* Deterministic Explanations Audit Trail Panel */}
      <motion.div
        variants={cardItemVariants}
        className="rounded-3xl border border-white/60 bg-white/40 backdrop-blur-2xl p-6 shadow-[inset_1px_1px_2px_rgba(255,255,255,0.9),inset_-1px_-1px_3px_rgba(255,255,255,0.1)] shadow-[0_16px_40px_-8px_rgba(15,23,42,0.08)]"
      >
        <div className="flex items-center gap-2 pb-4 border-b border-slate-200/60 mb-4">
          <Sparkles className="w-4 h-4 text-slate-600" />
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
            Deterministic Decision Explanations & Model Lineage
          </h3>
        </div>

        {(!data?.reasons || data.reasons.length === 0) ? (
          <div className="py-6 text-center text-slate-400 text-xs">
            Operational baseline state: Zero threshold violations or physical boundary alerts flagged.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {data.reasons.map((reason, idx) => (
              <div
                key={idx}
                className="p-3.5 rounded-2xl bg-white/60 border border-white/80 shadow-2xs text-xs text-slate-700 leading-relaxed flex items-start gap-2.5"
              >
                <span className="w-2 h-2 rounded-full bg-slate-400 mt-1.5 shrink-0" />
                <span>{reason}</span>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 pt-3 border-t border-slate-200/50 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-slate-500 font-mono">
          <span>Engine C Isolation Forest Lineage: {data?.model_version || "engine_c_v2"}</span>
          <span>Zero Generative Hallucinations &bull; Purely Deterministic Mathematical Inference</span>
        </div>
      </motion.div>
    </motion.div>
  );
}

