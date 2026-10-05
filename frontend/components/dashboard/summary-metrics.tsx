"use client";

import { DashboardSummary } from "@/lib/graphql/generated";

interface SummaryMetricsProps {
  summaryData?: DashboardSummary;
}

export function SummaryMetrics({ summaryData }: SummaryMetricsProps) {
  if (!summaryData) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="h-32 w-full animate-pulse rounded-3xl bg-white/60 shadow-sm border border-white/80" />
        <div className="h-32 w-full animate-pulse rounded-3xl bg-white/60 shadow-sm border border-white/80" />
        <div className="h-32 w-full animate-pulse rounded-3xl bg-white/60 shadow-sm border border-white/80" />
      </div>
    );
  }

  const score = summaryData.overallReliabilityScore || 0;
  const isOptimal = score >= 90;
  const strokeColor = isOptimal ? "#10b981" : "#f59e0b"; // Emerald vs Amber

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {/* Reliability Score Tile */}
      <div className="liquid-panel rounded-3xl bg-white/60 p-6 shadow-xl shadow-emerald-900/5 border border-white/80 relative flex items-center justify-between">
        <div>
          <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Overall Reliability</h3>
          <p className="text-4xl font-light text-zinc-800 tracking-tight">
            {score.toFixed(1)}<span className="text-xl text-zinc-400 font-normal">%</span>
          </p>
        </div>
        <div className="relative w-16 h-16">
          <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
            <circle cx="18" cy="18" r="16" fill="none" className="stroke-black/5" strokeWidth="3" />
            <circle 
              cx="18" cy="18" r="16" fill="none" 
              stroke={strokeColor} 
              strokeWidth="3" 
              strokeDasharray="100" 
              strokeDashoffset={100 - score} 
              strokeLinecap="round" 
              className="transition-all duration-1000 ease-out" 
            />
          </svg>
        </div>
      </div>

      {/* High-Risk Areas Tile */}
      <div className="liquid-panel rounded-3xl bg-white/60 p-6 shadow-xl shadow-emerald-900/5 border border-white/80 relative flex flex-col justify-center">
         <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">High-Risk Areas</h3>
         <p className="text-4xl font-light text-zinc-800 tracking-tight">{summaryData.activeHighRiskAreas || 0}</p>
      </div>

      {/* Active Alerts Tile */}
      <div className={`liquid-panel rounded-3xl p-6 shadow-xl border relative flex flex-col justify-center ${summaryData.totalActiveAlerts > 0 ? 'bg-amber-50/90 border-amber-200 shadow-amber-900/10' : 'bg-white/60 border-white/80 shadow-emerald-900/5'}`}>
         <h3 className={`text-xs font-semibold uppercase tracking-wider mb-2 ${summaryData.totalActiveAlerts > 0 ? 'text-amber-700/80' : 'text-zinc-500'}`}>Active Alerts</h3>
         <p className={`text-4xl font-light tracking-tight ${summaryData.totalActiveAlerts > 0 ? 'text-amber-600' : 'text-zinc-800'}`}>{summaryData.totalActiveAlerts || 0}</p>
      </div>
    </div>
  );
}
