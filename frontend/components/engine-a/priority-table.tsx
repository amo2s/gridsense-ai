"use client";

import { Button } from "@/components/ui/button";

const mockData = [
  { id: "FDR-001", status: "Stable", score: 95, load: "45%", lastAnomaly: "2023-10-01 10:00 AM" },
  { id: "FDR-002", status: "Vulnerable", score: 65, load: "85%", lastAnomaly: "2023-10-05 14:30 PM" },
  { id: "FDR-003", status: "Critical", score: 20, load: "98%", lastAnomaly: "2023-10-07 08:15 AM" },
];

export function PriorityTable() {
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
              <th className="py-3 px-4 text-sm font-semibold text-neutral-600">Status</th>
              <th className="py-3 px-4 text-sm font-semibold text-neutral-600">Reliability Score</th>
              <th className="py-3 px-4 text-sm font-semibold text-neutral-600">Peak Load Capacity</th>
              <th className="py-3 px-4 text-sm font-semibold text-neutral-600">Last Anomaly</th>
              <th className="py-3 px-4 text-sm font-semibold text-neutral-600">Actions</th>
            </tr>
          </thead>
          <tbody>
            {mockData.map((row) => (
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
                <td className="py-4 px-4 text-sm relative z-10">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                    row.status === 'Stable' ? 'bg-[#10b981]/10 text-[#10b981]' :
                    row.status === 'Vulnerable' ? 'bg-amber-500/10 text-amber-600' :
                    'bg-red-500/10 text-red-600'
                  }`}>
                    {row.status}
                  </span>
                </td>
                <td className="py-4 px-4 text-sm font-medium relative z-10">
                  <span style={{ 
                    color: row.score >= 80 ? '#10b981' : row.score >= 50 ? '#f59e0b' : '#ef4444' 
                  }}>
                    {row.score}%
                  </span>
                </td>
                <td className="py-4 px-4 text-sm text-neutral-600 relative z-10">{row.load}</td>
                <td className="py-4 px-4 text-sm text-neutral-500 relative z-10">{row.lastAnomaly}</td>
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
