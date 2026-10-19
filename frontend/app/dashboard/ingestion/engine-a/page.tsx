import EngineAForm from "@/components/ingestion/engine-a-form";

export const metadata = {
  title: "Engine A: Telemetry Ingestion | GridSense AI",
  description: "Telemetry ingestion interface for Engine A Reliability Indices.",
};

export default function EngineAIngestionPage() {
  return (
    <div className="max-w-7xl mx-auto w-full p-6 lg:p-8 flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200/50">
        <div>
          <h1 className="text-3xl font-light tracking-tight text-slate-900">
            Engine A: Telemetry Ingestion
          </h1>
          <p className="text-xs font-semibold tracking-[0.2em] text-slate-500 uppercase mt-1">
            Reliability Indices &amp; Interruption Ingress
          </p>
        </div>
      </header>

      <div className="w-full bg-white/20 backdrop-blur-2xl bg-gradient-to-br from-white/60 via-white/10 to-white/5 shadow-[inset_1px_1px_2px_rgba(255,255,255,0.8),inset_-1px_-1px_3px_rgba(255,255,255,0.1)] shadow-[0_16px_40px_-8px_rgba(15,23,42,0.15)] rounded-3xl border border-white/40 overflow-hidden p-6 lg:p-8">
        <EngineAForm />
      </div>
    </div>
  );
}
