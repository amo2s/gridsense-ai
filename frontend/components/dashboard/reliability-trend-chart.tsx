"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { TrendDataPoint } from "@/lib/graphql/generated";

interface ReliabilityTrendChartProps {
  trendData?: TrendDataPoint[];
}

export function ReliabilityTrendChart({ trendData = [] }: ReliabilityTrendChartProps) {
  if (!trendData || trendData.length === 0) {
    return (
      <div className="rounded-3xl border border-emerald-100 bg-white/60 p-6 text-center text-zinc-500 shadow-sm h-72 flex items-center justify-center">
        <p className="text-sm font-medium">No trend data available.</p>
      </div>
    );
  }

  // Format data for Recharts
  const formattedData = trendData.map((d) => {
    const date = new Date(d.timestamp);
    return {
      ...d,
      timeLabel: date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
  });

  return (
    <div className="liquid-panel rounded-3xl bg-white/60 shadow-xl shadow-emerald-900/5 border border-white/80 p-6 w-full h-80 flex flex-col">
      <h3 className="text-sm font-semibold text-zinc-600 mb-6">Network Reliability Trend (24h)</h3>
      <div className="flex-1 w-full h-full min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={formattedData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="emeraldGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis 
              dataKey="timeLabel" 
              axisLine={false} 
              tickLine={false} 
              tick={{ fontSize: 12, fill: '#71717a' }} 
              dy={10}
              minTickGap={30}
            />
            <YAxis 
              axisLine={false} 
              tickLine={false} 
              tick={false} 
              domain={[0, 100]} 
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'rgba(24, 24, 27, 0.8)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                borderRadius: '16px',
                border: '1px solid rgba(255,255,255,0.1)',
                boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3)',
                color: '#fff'
              }}
              itemStyle={{ color: '#34d399', fontWeight: 600 }}
              labelStyle={{ color: '#a1a1aa', fontSize: '12px', marginBottom: '4px' }}
            />
            
            <ReferenceLine y={50} stroke="#e4e4e7" strokeDasharray="3 3" />
            <ReferenceLine y={80} stroke="#e4e4e7" strokeDasharray="3 3" />
            <ReferenceLine y={100} stroke="#e4e4e7" strokeDasharray="3 3" />

            <Area
              type="monotone"
              dataKey="value"
              stroke="#10b981"
              strokeWidth={3}
              fillOpacity={1}
              fill="url(#emeraldGradient)"
              activeDot={{ r: 6, fill: '#059669', stroke: '#fff', strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
