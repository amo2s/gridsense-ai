import EngineAForm from "@/components/ingestion/engine-a-form";

export default function EngineAIngestionPage() {
  return (
    <div className="max-w-4xl mx-auto w-full p-6 lg:p-8 flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-light tracking-tight text-slate-900">
          Engine A: Telemetry Ingestion
        </h1>
        <p className="text-xs font-semibold tracking-[0.2em] text-slate-500 uppercase">
          MANUAL OVERRIDE & SYNTHETIC DATA ENTRY
        </p>
      </header>

      <div className="liquid-panel bg-white/40 backdrop-blur-xl border border-white/60 shadow-[0_8px_32px_rgba(0,0,0,0.04)] shadow-[inset_0_1px_1px_rgba(255,255,255,0.8)] rounded-2xl overflow-hidden p-8">
        <EngineAForm />
      </div>
    </div>
  );
}
