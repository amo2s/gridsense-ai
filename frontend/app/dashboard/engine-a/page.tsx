import { SummaryCards } from "@/components/engine-a/summary-cards";
import { PriorityTable } from "@/components/engine-a/priority-table";
import { ReliabilityTrend } from "@/components/engine-a/reliability-trend";

export const metadata = {
  title: "Engine A Telemetry & Intelligence",
};

export default function EngineAPage() {
  return (
    <main className="min-h-screen bg-[#F8FAF8] p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <header>
          <h1 className="text-3xl font-bold text-neutral-900 tracking-tight">Engine A Telemetry & Intelligence</h1>
          <p className="text-neutral-500 mt-2">Standalone visualization experience dedicated to Engine A's intelligence.</p>
        </header>

        {/* CSS Grid / Flexbox layout */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <SummaryCards />
        </div>

        <div className="mt-8">
          <ReliabilityTrend />
        </div>

        <div className="mt-8">
          <PriorityTable />
        </div>
      </div>
    </main>
  );
}
