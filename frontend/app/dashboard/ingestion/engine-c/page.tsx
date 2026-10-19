import React from "react";
import EngineCForm from "@/components/ingestion/engine-c-form";

export const metadata = {
  title: "Engine C: Telemetry Ingestion | GridSense AI",
  description: "24-hour telemetry ingestion interface for Engine C Multivariate Anomaly Detection.",
};

export default function EngineCIngestionPage() {
  return (
    <div className="max-w-7xl mx-auto w-full p-6 lg:p-8 flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header with Title */}
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200/50">
        <div>
          <h1 className="text-3xl font-light tracking-tight text-slate-900">
            Engine C: Telemetry Ingestion
          </h1>
          <p className="text-xs font-semibold tracking-[0.2em] text-slate-500 uppercase mt-1">
            Multivariate Anomaly Detection Telemetry Ingress
          </p>
        </div>
      </header>

      {/* Expanded Full-Width Primary Container for Telemetry Form */}
      <div className="w-full bg-white/20 backdrop-blur-2xl bg-gradient-to-br from-white/60 via-white/10 to-white/5 shadow-[inset_1px_1px_2px_rgba(255,255,255,0.8),inset_-1px_-1px_3px_rgba(255,255,255,0.1)] shadow-[0_16px_40px_-8px_rgba(15,23,42,0.15)] rounded-3xl border border-white/40 overflow-hidden p-6 lg:p-8">
        <EngineCForm />
      </div>
    </div>
  );
}
