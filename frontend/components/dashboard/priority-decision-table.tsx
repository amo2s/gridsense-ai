"use client";

import { useRouter } from "next/navigation";
import { PriorityArea } from "@/lib/graphql/generated";

interface PriorityDecisionTableProps {
  priorityData?: PriorityArea[];
}

export function PriorityDecisionTable({ priorityData = [] }: PriorityDecisionTableProps) {
  const router = useRouter();

  if (!priorityData || priorityData.length === 0) {
    return (
      <div className="flex h-64 w-full flex-col items-center justify-center rounded-3xl border border-white/10 bg-white/5 shadow-sm">
        <p className="text-sm font-medium text-zinc-500">No active anomalies</p>
      </div>
    );
  }

  return (
    <div className="liquid-panel rounded-3xl bg-white/60 shadow-xl shadow-emerald-900/5 border border-white/80 overflow-hidden backdrop-blur-none">
      <div className="px-6 py-4 border-b border-white/60 bg-white/40">
        <h3 className="text-sm font-semibold text-zinc-600">Priority Interventions</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-emerald-50/20 text-zinc-500 font-medium border-b border-white/60">
            <tr>
              <th className="px-6 py-3 font-medium tracking-wide">Rank</th>
              <th className="px-6 py-3 font-medium tracking-wide">Area Name</th>
              <th className="px-6 py-3 font-medium tracking-wide">Risk Score</th>
              <th className="px-6 py-3 font-medium tracking-wide">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/40">
            {priorityData.map((area) => (
              <tr 
                key={area.id}
                onClick={() => router.push('/areas/' + area.id)}
                className="cursor-pointer transition-all duration-300 hover:bg-white/90 hover:shadow-[inset_0_0_20px_rgba(16,185,129,0.03)] group"
              >
                <td className="px-6 py-4 font-semibold text-zinc-700">{area.urgencyRank}</td>
                <td className="px-6 py-4 text-zinc-600 font-medium group-hover:text-emerald-700 transition-colors">{area.name}</td>
                <td className="px-6 py-4 text-zinc-600">{area.riskScore.toFixed(1)}</td>
                <td className="px-6 py-4">
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    area.status === 'CRITICAL' ? 'bg-red-50/80 text-red-700 border border-red-100' :
                    area.status === 'HIGH_RISK' ? 'bg-amber-50/80 text-amber-700 border border-amber-100' :
                    'bg-emerald-50/80 text-emerald-700 border border-emerald-100'
                  }`}>
                    {area.status.replace('_', ' ')}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
