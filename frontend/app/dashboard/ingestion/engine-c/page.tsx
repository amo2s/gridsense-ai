import React from "react";
import EngineCForm from "@/components/ingestion/engine-c-form";
import EngineCResilienceMonitor from "@/components/ingestion/engine-c-resilience-monitor";

export const metadata = {
  title: "Engine C: Telemetry Ingestion | GridSense AI",
  description: "Command Pathway manual 24-hour telemetry ingestion interface for Engine C Multivariate Anomaly Detection.",
};

/**
 * ============================================================================
 * ENGINE C INGESTION PAGE (COMMAND ORIGIN - CQRS BLUEPRINT)
 * ============================================================================
 * Route: /dashboard/ingestion/engine-c
 * Serves as the dedicated, decoupled command origin for manual telemetry overrides.
 * Assembles, validates, and stages sliding window telemetry for the Go API Gateway.
 */
export default function EngineCIngestionPage() {
  return (
    <div className="max-w-7xl mx-auto w-full p-6 lg:p-8 flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header with Title and Amber COMMAND PATHWAY badge */}
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200/50">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-light tracking-tight text-slate-900">
              Engine C: Manual Telemetry Ingestion
            </h1>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold tracking-wider uppercase bg-amber-500/10 text-amber-700 border border-amber-500/30">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
              COMMAND PATHWAY
            </span>
          </div>
          <p className="text-xs font-semibold tracking-[0.2em] text-slate-500 uppercase mt-1">
            Multivariate Anomaly Detection Rolling Window Telemetry Synthesis & Boundary Ingress
          </p>
        </div>
      </header>

      {/* Two-Column Responsive Liquid Glass Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
        {/* Primary Column (8 cols): Manual Override Telemetry Form */}
        <div className="lg:col-span-8 bg-white/20 backdrop-blur-2xl bg-gradient-to-br from-white/60 via-white/10 to-white/5 shadow-[inset_1px_1px_2px_rgba(255,255,255,0.8),inset_-1px_-1px_3px_rgba(255,255,255,0.1)] shadow-[0_16px_40px_-8px_rgba(15,23,42,0.15)] rounded-3xl border border-white/40 overflow-hidden p-6 lg:p-8">
          <EngineCForm />
        </div>

        {/* Secondary Column (4 cols): Gateway Network Resilience Monitor */}
        <div className="lg:col-span-4 sticky top-6">
          <EngineCResilienceMonitor />
        </div>
      </div>
    </div>
  );
}
