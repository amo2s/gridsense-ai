import EngineDForm from "@/components/ingestion/engine-d-form";

export const metadata = {
  title: "Engine D: Telemetry Fusion Ingestion | GridSense AI",
  description: "Multi-asset operational telemetry fusion staging interface for Engine D Intervention Prioritization.",
};

export default function EngineDIngestionPage() {
  return (
    <div className="max-w-7xl mx-auto w-full p-6 lg:p-8 flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header with Title */}
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200/50">
        <div>
          <h1 className="text-3xl font-light tracking-tight text-slate-900">
            Engine D: Telemetry Fusion Ingestion
          </h1>
          <p className="text-xs font-semibold tracking-[0.2em] text-slate-500 uppercase mt-1">
            Multi-Asset Cross-Engine Signal Ingress (Command Pathway)
          </p>
        </div>
      </header>

      {/* Expanded Liquid Glass Container */}
      <div className="w-full bg-white/20 backdrop-blur-2xl bg-gradient-to-br from-white/60 via-white/10 to-white/5 shadow-[inset_1px_1px_2px_rgba(255,255,255,0.8),inset_-1px_-1px_3px_rgba(255,255,255,0.1)] shadow-[0_16px_40px_-8px_rgba(15,23,42,0.15)] rounded-3xl border border-white/40 overflow-hidden p-6 lg:p-8">
        <EngineDForm />
      </div>
    </div>
  );
}
