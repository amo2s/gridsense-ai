"use client";

import Link from "next/link";
import { 
  Zap, 
  AlertTriangle, 
  ShieldAlert, 
  Clock, 
  Activity, 
  ArrowRight, 
  RefreshCw,
  Cpu,
  BarChart2,
  TrendingDown,
  Layers
} from "lucide-react";
import { useFeederStore } from "@/store/feeder-store";
import { useEngineBSummary } from "@/hooks/use-engine-b-summary";
import { ShapWaterfallChart } from "@/components/engine-b/shap-waterfall-chart";

/**
 * ============================================================================
 * ENGINE B OUTAGE-RISK SUMMARY DASHBOARD (QUERY PATHWAY)
 * ============================================================================
 * Consumes 100% live, materialized data directly from the PostgreSQL `risk_predictions`
 * table via the Go API Gateway and Next.js proxy route.
 *
 * Implements strict CQRS isolation from the Command Pathway manual ingestion interface.
 */
export default function EngineBDashboardPage() {
  const activeFeederId = useFeederStore((state) => state.activeFeederId);
  const { data, isLoading, isError, error, refetch, isFetching } = useEngineBSummary();

  // Polarity helper for Metric Card 2 (Risk Tier)
  const getRiskTierStyling = (levelRaw?: string) => {
    const level = (levelRaw || "").toUpperCase().trim();
    if (level === "HIGH" || level === "HIGH_RISK" || level === "CRITICAL") {
      return {
        text: "text-red-500",
        bg: "bg-red-500/10",
        border: "border-red-500/30",
        shadow: "shadow-[0_0_25px_rgba(239,68,68,0.35)]",
        badge: "bg-red-500/20 text-red-600 border-red-500/40",
        pulse: "animate-pulse",
        label: "HIGH RISK",
      };
    }
    if (level === "MEDIUM" || level === "VULNERABLE" || level === "MODERATE") {
      return {
        text: "text-amber-500",
        bg: "bg-amber-500/10",
        border: "border-amber-500/30",
        shadow: "shadow-[0_0_15px_rgba(245,158,11,0.2)]",
        badge: "bg-amber-500/20 text-amber-700 border-amber-500/40",
        pulse: "",
        label: "VULNERABLE",
      };
    }
    // LOW or STABLE
    return {
      text: "text-[#10b981]",
      bg: "bg-[#10b981]/10",
      border: "border-[#10b981]/30",
      shadow: "shadow-[0_0_15px_rgba(16,185,129,0.15)]",
      badge: "bg-[#10b981]/20 text-[#10b981] border-[#10b981]/40",
      pulse: "",
      label: "STABLE",
    };
  };

  const is404 =
    error?.status === 404 ||
    error?.message?.includes("404") ||
    error?.message?.toLowerCase().includes("not found");

  return (
    <main className="min-h-screen bg-[#F8FAF8] p-6 lg:p-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header with Title and Query Pathway Badge */}
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-200/60">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-light tracking-tight text-slate-900">
                Engine B: Outage-Risk Intelligence
              </h1>
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold tracking-wider uppercase bg-emerald-500/10 text-emerald-700 border border-emerald-500/30">
                QUERY PATHWAY
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-white/70 text-slate-700 border border-white/80 shadow-sm font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                Asset: {activeFeederId || "Unselected"}
              </span>
            </div>
            <p className="text-xs font-semibold tracking-[0.2em] text-slate-500 uppercase mt-1">
              Materialized Machine Learning Inference & Explainable Risk Attribution
            </p>
          </div>

          {/* Polling & Refresh Status */}
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span className="flex items-center gap-1.5 bg-white/60 border border-white/80 px-3 py-1.5 rounded-xl shadow-xs">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              Live DB Polling: 30s
            </span>
            <button
              onClick={() => refetch()}
              disabled={isFetching || !activeFeederId}
              className="p-2 rounded-xl bg-white/60 hover:bg-white/80 border border-white/80 text-slate-600 transition-colors shadow-xs disabled:opacity-40 cursor-pointer"
              title="Refresh materialized view"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin text-emerald-600" : ""}`} />
            </button>
          </div>
        </header>

        {/* STATE 0: No Active Feeder Selected */}
        {!activeFeederId && (
          <div className="flex flex-col items-center justify-center p-12 text-center rounded-3xl bg-amber-500/10 border border-amber-500/30 backdrop-blur-xl shadow-[inset_0_1px_1px_rgba(255,255,255,0.8)]">
            <ShieldAlert className="w-12 h-12 text-amber-500 mb-4 animate-bounce" />
            <h3 className="text-lg font-semibold text-slate-800 mb-2">
              No Grid Asset Context Selected
            </h3>
            <p className="text-sm text-slate-600 max-w-md leading-relaxed">
              Please select an active feeder from the global asset selector in the navigation sidebar
              to query live materialized outage-risk intelligence.
            </p>
          </div>
        )}

        {/* STATE 1: INITIAL LOADING SKELETON */}
        {activeFeederId && isLoading && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[1, 2, 3].map((n) => (
                <div
                  key={n}
                  className="h-36 rounded-2xl bg-white/40 border border-white/60 backdrop-blur-md animate-pulse shadow-[inset_0_1px_1px_rgba(255,255,255,0.8)] p-6 flex flex-col justify-between"
                >
                  <div className="h-4 w-28 bg-slate-200/70 rounded" />
                  <div className="h-8 w-20 bg-slate-300/60 rounded" />
                  <div className="h-3 w-40 bg-slate-200/50 rounded" />
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="h-96 rounded-3xl bg-white/40 border border-white/60 backdrop-blur-md animate-pulse shadow-[inset_0_1px_1px_rgba(255,255,255,0.8)]" />
              <div className="h-96 rounded-3xl bg-white/40 border border-white/60 backdrop-blur-md animate-pulse shadow-[inset_0_1px_1px_rgba(255,255,255,0.8)]" />
            </div>
          </div>
        )}

        {/* STATE 2: 404 NO DATA EMPTY STATE */}
        {activeFeederId && !isLoading && is404 && (
          <div className="flex flex-col items-center justify-center p-12 text-center rounded-3xl bg-white/40 border border-white/60 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.04)] shadow-[inset_0_1px_1px_rgba(255,255,255,0.8)]">
            <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-600 mb-4">
              <AlertTriangle className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-semibold text-slate-800 mb-2">
              No Outage-Risk Intelligence Materialized
            </h3>
            <p className="text-sm text-slate-600 max-w-md leading-relaxed mb-6">
              No Outage-Risk Intelligence materialized for <span className="font-mono font-bold text-slate-800">{activeFeederId}</span>. 
              Navigate to the Command Pathway to ingest historical telemetry.
            </p>
            <Link
              href="/dashboard/ingestion/engine-b"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 shadow-md shadow-emerald-600/20 transition-all duration-200 cursor-pointer"
            >
              <span>Go to Command Pathway Ingestion</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        )}

        {/* STATE 3: GENERIC ERROR (NON-404) */}
        {activeFeederId && !isLoading && isError && !is404 && (
          <div className="flex flex-col items-center justify-center p-10 text-center rounded-3xl bg-red-500/10 border border-red-500/30 backdrop-blur-xl shadow-[inset_0_1px_1px_rgba(255,255,255,0.8)]">
            <AlertTriangle className="w-8 h-8 text-red-500 mb-3" />
            <h3 className="text-base font-semibold text-red-800 mb-1">
              Gateway Connection Error
            </h3>
            <p className="text-xs text-red-700 max-w-md mb-4">
              {error?.message || "Failed to retrieve materialized prediction from Go API Gateway."}
            </p>
            <button
              onClick={() => refetch()}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-800 bg-white/80 hover:bg-white border border-white shadow-xs cursor-pointer"
            >
              Retry Database Query
            </button>
          </div>
        )}

        {/* STATE 4: SUCCESS - LIVE MATERIALIZED DATA */}
        {activeFeederId && !isLoading && data && (
          <div className="space-y-6">
            {/* Top-Level Liquid Glass Metric Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Metric Card 1: Risk Score (0-100) */}
              <div className="liquid-panel bg-white/40 backdrop-blur-xl border border-white/60 shadow-[0_8px_32px_rgba(0,0,0,0.04)] shadow-[inset_0_1px_1px_rgba(255,255,255,0.8)] rounded-2xl p-6 flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Predictive Risk Score
                  </span>
                  <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600">
                    <Activity className="w-4 h-4" />
                  </div>
                </div>

                <div className="my-4">
                  <div className="flex items-baseline gap-2">
                    <span className="text-4xl font-light tracking-tight text-slate-900 font-mono">
                      {Number(data.risk_score).toFixed(1)}
                    </span>
                    <span className="text-sm font-semibold text-slate-400">/ 100</span>
                  </div>
                  <div className="w-full bg-slate-200/60 rounded-full h-1.5 mt-3 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        data.risk_score > 70
                          ? "bg-red-500"
                          : data.risk_score > 40
                          ? "bg-amber-500"
                          : "bg-emerald-500"
                      }`}
                      style={{ width: `${Math.min(100, Math.max(0, data.risk_score))}%` }}
                    />
                  </div>
                </div>

                <p className="text-[11px] text-slate-400">
                  Calculated from 24h rolling temporal window
                </p>
              </div>

              {/* Metric Card 2: Risk Tier (risk_level with strict polarity) */}
              {(() => {
                const styling = getRiskTierStyling(data.risk_level);
                return (
                  <div
                    className={`liquid-panel ${styling.bg} backdrop-blur-xl border ${styling.border} ${styling.shadow} rounded-2xl p-6 flex flex-col justify-between transition-all duration-300`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                        Risk Tier Classification
                      </span>
                      <div className={`p-2 rounded-xl bg-white/60 ${styling.text}`}>
                        <Zap className={`w-4 h-4 ${styling.pulse}`} />
                      </div>
                    </div>

                    <div className="my-4">
                      <div className="flex items-center gap-2.5">
                        <span className={`text-3xl font-bold tracking-tight ${styling.text}`}>
                          {data.risk_level.toUpperCase()}
                        </span>
                      </div>
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border mt-2 ${styling.badge}`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${styling.text} bg-current`} />
                        Status: {styling.label}
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-500">
                      Dispatched to Grid Automation Priority Queue
                    </p>
                  </div>
                );
              })()}

              {/* Metric Card 3: Evaluation Horizon */}
              <div className="liquid-panel bg-white/40 backdrop-blur-xl border border-white/60 shadow-[0_8px_32px_rgba(0,0,0,0.04)] shadow-[inset_0_1px_1px_rgba(255,255,255,0.8)] rounded-2xl p-6 flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Evaluation Horizon
                  </span>
                  <div className="p-2 rounded-xl bg-blue-500/10 text-blue-600">
                    <Clock className="w-4 h-4" />
                  </div>
                </div>

                <div className="my-4">
                  <p className="text-2xl font-medium tracking-tight text-slate-800">
                    {data.horizon_hours}-Hour Predictive Horizon
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Generated: {new Date(data.generated_at).toLocaleString()}
                  </p>
                </div>

                <div className="pt-2 border-t border-slate-200/50 flex items-center justify-between text-[11px] text-slate-400">
                  <span className="flex items-center gap-1">
                    <Cpu className="w-3 h-3 text-slate-400" />
                    Model Engine
                  </span>
                  <span className="font-mono text-slate-600 font-medium">
                    {data.model_version}
                  </span>
                </div>
              </div>
            </div>

            {/* STEP 5: SHAP EXPLAINABILITY & HORIZON PLACEHOLDERS */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Panel 1: Temporal Horizon Forecast */}
              <div className="h-96 rounded-3xl border border-white/60 shadow-sm bg-white/40 backdrop-blur-xl shadow-[inset_0_1px_1px_rgba(255,255,255,0.8)] p-6 flex flex-col justify-between">
                <div className="flex items-center justify-between pb-3 border-b border-slate-200/50">
                  <div className="flex items-center gap-2.5">
                    <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-600">
                      <TrendingDown className="w-4 h-4" />
                    </div>
                    <h2 className="text-sm font-semibold text-slate-800">
                      Temporal Horizon Forecast
                    </h2>
                  </div>
                  <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded bg-white/60 text-slate-500 border border-white">
                    Phase 3 Pipeline
                  </span>
                </div>

                {/* Structural Graphic Placeholder */}
                <div className="flex-1 flex flex-col items-center justify-center text-center p-6 my-2 rounded-2xl bg-white/20 border border-dashed border-slate-300/60">
                  <BarChart2 className="w-10 h-10 text-slate-400 mb-2 opacity-60" />
                  <p className="text-xs font-semibold text-slate-700">
                    Temporal Trajectory Projection
                  </p>
                  <p className="text-[11px] text-slate-500 max-w-xs mt-1">
                    Rolling 6-hour risk evolution curve with Upper/Lower confidence bounds scheduled for Phase 3 SVG rendering.
                  </p>
                </div>

                <div className="pt-2 border-t border-slate-200/50 flex items-center justify-between text-[11px] text-slate-400">
                  <span>Horizon Depth: {data.horizon_hours}h</span>
                  <span className="font-mono">ONNX Inference Stream</span>
                </div>
              </div>

              {/* Panel 2: Feature Attribution (SHAP) */}
              <div className="h-96 rounded-3xl border border-white/60 shadow-sm bg-white/40 backdrop-blur-xl shadow-[inset_0_1px_1px_rgba(255,255,255,0.8)] p-6 flex flex-col justify-between">
                <div className="flex items-center justify-between pb-3 border-b border-slate-200/50">
                  <div className="flex items-center gap-2.5">
                    <div className="p-1.5 rounded-lg bg-purple-500/10 text-purple-600">
                      <Layers className="w-4 h-4" />
                    </div>
                    <h2 className="text-sm font-semibold text-slate-800">
                      Feature Attribution (TreeSHAP)
                    </h2>
                  </div>
                  <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-700 border border-emerald-500/30">
                    Live XAI Matrix
                  </span>
                </div>

                {/* Mathematical Divergence Waterfall Chart */}
                <div className="flex-1 w-full min-h-0 my-2">
                  <ShapWaterfallChart contributing_factors={data.contributing_factors} />
                </div>

                <div className="pt-2 border-t border-slate-200/50 flex items-center justify-between text-[11px] text-slate-400">
                  <span>Factor Count: {data.contributing_factors?.length || 0}</span>
                  <span className="font-mono">KernelExplainer / ONNX</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
