"use client";

import { Button } from "@/components/ui/button";
import { usePriorityRanking } from "@/hooks/use-priority-ranking";
import { Loader2 } from "lucide-react";

export function PriorityTable() {
  const { data: priorityAreas, isLoading, isError } = usePriorityRanking();
  const handleDrillDown = (id: string) => {
    console.log("Drill down triggered for Feeder ID: ", id);
  };

  return (
    <div className="liquid-panel backdrop-blur-md relative overflow-hidden p-6 bg-gradient-to-br from-white/80 to-white/30 border border-white/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),_0_8px_16px_-4px_rgba(0,0,0,0.1)]">
      {/* Specular edge highlight */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white to-transparent opacity-80" />
      
      <div className="flex justify-between items-center mb-6 relative z-10">
        <h2 className="text-xl font-bold text-neutral-900">Priority Areas Decision Matrix</h2>
      </div>

      <div className="overflow-x-auto relative z-10">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-neutral-200/50">
              <th className="py-3 px-4 text-sm font-semibold text-neutral-600">Feeder ID</th>
              <th className="py-3 px-4 text-sm font-semibold text-neutral-600">Name</th>
              <th className="py-3 px-4 text-sm font-semibold text-neutral-600">Status</th>
              <th className="py-3 px-4 text-sm font-semibold text-neutral-600">Risk Score</th>
              <th className="py-3 px-4 text-sm font-semibold text-neutral-600">Urgency Rank</th>
              <th className="py-3 px-4 text-sm font-semibold text-neutral-600">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={6} className="py-12 text-center">
                  <Loader2 className="w-8 h-8 animate-spin mx-auto text-[#10b981]" />
                </td>
              </tr>
            ) : isError || !priorityAreas ? (
              <tr>
                <td colSpan={6} className="py-12 text-center text-red-500 font-medium">
                  Failed to load priority areas
                </td>
              </tr>
            ) : priorityAreas.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-12 text-center text-neutral-500 font-medium">
                  No data available
                </td>
              </tr>
            ) : priorityAreas.map((row) => (
              <tr
                key={row.id}
                onClick={() => handleDrillDown(row.id)}
                className="group relative cursor-pointer border-b border-neutral-100/50 transition-colors duration-300 hover:bg-white/40"
              >
                {/* Glossy sweeping highlight effect on hover */}
                <td className="absolute inset-0 pointer-events-none overflow-hidden" colSpan={6}>
                  <div className="absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-transparent via-white/80 to-transparent -translate-x-[150%] group-hover:translate-x-[300%] transition-transform duration-[1500ms] ease-in-out" />
                </td>

                <td className="py-4 px-4 text-sm font-medium text-neutral-800 relative z-10">{row.id}</td>
                <td className="py-4 px-4 text-sm font-medium text-neutral-600 relative z-10">{row.name}</td>
                <td className="py-4 px-4 text-sm relative z-10">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                    (() => {
                      const s = row.status?.trim().toUpperCase();
                      if (s === 'STABLE') return 'bg-[#10b981]/10 text-[#10b981]';
                      if (s === 'VULNERABLE') return 'bg-amber-500/10 text-amber-600';
                      if (s === 'HIGH_RISK') return 'bg-red-500/10 text-red-600';
                      return 'bg-neutral-500/10 text-neutral-600';
                    })()
                  }`}>
                    {row.status}
                  </span>
                </td>
                <td className="py-4 px-4 text-sm font-medium relative z-10">
                  <span style={{ 
                    color: (() => {
                      const s = row.status?.trim().toUpperCase();
                      if (s === 'STABLE') return '#10b981';
                      if (s === 'VULNERABLE') return '#f59e0b';
                      if (s === 'HIGH_RISK') return '#ef4444';
                      return '#737373';
                    })()
                  }}>
                    {Math.round(row.riskScore)}
                  </span>
                </td>
                <td className="py-4 px-4 text-sm font-bold text-neutral-700 relative z-10">#{row.urgencyRank}</td>
                <td className="py-4 px-4 relative z-10">
                  <Button
                    className="border-[#10b981] text-[#10b981] hover:bg-[#10b981] hover:text-white transition-colors bg-transparent border py-1.5 px-3 text-xs"
                    onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                      e.stopPropagation(); // Prevent drill down when clicking acknowledge
                      console.log("Acknowledged: ", row.id);
                    }}
                  >
                    Acknowledge
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
