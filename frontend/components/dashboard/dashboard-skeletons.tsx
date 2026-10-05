export function SummaryMetricsSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full">
      <div className="h-32 w-full animate-pulse rounded-3xl bg-white/60 shadow-sm border border-white/80" />
      <div className="h-32 w-full animate-pulse rounded-3xl bg-white/60 shadow-sm border border-white/80" />
      <div className="h-32 w-full animate-pulse rounded-3xl bg-white/60 shadow-sm border border-white/80" />
    </div>
  );
}

export function ReliabilityTrendChartSkeleton() {
  return (
    <div className="animate-pulse rounded-3xl bg-white/60 shadow-sm border border-white/80 p-6 h-72 w-full flex items-center justify-center">
      <span className="text-zinc-400 text-sm">Loading trend data...</span>
    </div>
  );
}

export function PriorityDecisionTableSkeleton() {
  return (
    <div className="animate-pulse rounded-3xl bg-white/60 shadow-sm border border-white/80 p-6 h-64 w-full flex items-center justify-center">
      <span className="text-zinc-400 text-sm">Loading priority matrix...</span>
    </div>
  );
}
