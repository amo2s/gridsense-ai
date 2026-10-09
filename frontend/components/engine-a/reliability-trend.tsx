"use client";

import { useState, useMemo } from "react";
import { useReliabilityTrend } from "@/hooks/use-reliability-trend";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { Loader2 } from "lucide-react";

export function ReliabilityTrend() {
  const [timeRange, setTimeRange] = useState<"24h" | "7d" | "30d">("24h");
  const { data, isLoading, isError } = useReliabilityTrend(timeRange);

  const sortedData = useMemo(() => {
    if (!data) return [];
    return [...data].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  }, [data]);

  return (
    <div className="liquid-panel relative overflow-hidden backdrop-blur-md bg-gradient-to-br from-white/80 to-white/30 border border-white/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),_0_8px_16px_-4px_rgba(0,0,0,0.1)] p-6 h-80">
      {/* Specular edge highlight */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white to-transparent opacity-80" />
      
      <div className="flex justify-between items-center mb-6 relative z-10">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold text-neutral-900">Reliability Trend</h2>
          {sortedData.length > 0 && sortedData.length < 2 && (
            <span className="text-xs font-medium text-neutral-500 bg-neutral-100 border border-neutral-200/80 px-2.5 py-1 rounded-full">
              Not enough history in this range
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 bg-neutral-100 p-1 rounded-lg border border-neutral-200/60">
          {(["24h", "7d", "30d"] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setTimeRange(r)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                timeRange === r
                  ? "bg-white text-neutral-900 shadow-sm"
                  : "text-neutral-500 hover:text-neutral-900"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div className="h-full w-full relative z-10 pb-8">
        {isLoading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-[#10b981]" />
          </div>
        ) : isError || !data ? (
          <div className="absolute inset-0 flex items-center justify-center text-red-500">
            Failed to load trend data
          </div>
        ) : sortedData.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center text-neutral-500 font-medium">
            No data available
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={sortedData}
              margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
            >
              <defs>
                <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.5} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              {/* Minimalist Grid: only horizontal, very light dashed */}
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e5e5" />
              <XAxis 
                dataKey="timestamp" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: '#737373', fontSize: 12 }}
                tickFormatter={(val) => {
                  const d = new Date(val);
                  if (timeRange === "24h") {
                    return `${d.getHours()}:00`;
                  }
                  return `${d.getMonth() + 1}/${d.getDate()}`;
                }}
              />
              <YAxis 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: '#737373', fontSize: 12 }} 
                domain={[0, 100]} 
              />
              <Tooltip
                contentStyle={{
                  borderRadius: '12px',
                  border: '1px solid rgba(255,255,255,0.6)',
                  background: 'rgba(255,255,255,0.9)',
                  boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
                  backdropFilter: 'blur(8px)',
                }}
                labelFormatter={(val) => new Date(val as string | number).toLocaleString()}
                itemStyle={{ color: '#10b981', fontWeight: 600 }}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="#10b981"
                strokeWidth={3}
                fillOpacity={1}
                fill="url(#colorValue)"
                dot={{ r: 4, fill: '#10b981' }}
                activeDot={{ r: 6, fill: '#10b981', stroke: '#fff', strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
