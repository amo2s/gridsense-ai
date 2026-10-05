"use client";

import React from 'react';
import { ResponsiveContainer, ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';

export interface PredictiveRiskData {
  timestamp: string;
  historicalValue?: number;
  predictedValue?: number;
  confidenceInterval?: [number, number];
}

interface RiskForecastChartProps {
  data?: PredictiveRiskData[];
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/10 shadow-lg p-3">
        <p className="text-sm font-semibold text-zinc-700 mb-1">{label}</p>
        {payload.map((entry: any, index: number) => (
          <p key={`item-${index}`} className="text-xs font-medium" style={{ color: entry.color }}>
            {entry.name}: {Number(entry.value).toFixed(2)}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

export function RiskForecastChart({ data = [] }: RiskForecastChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="flex h-64 w-full flex-col items-center justify-center rounded-3xl border border-white/10 bg-white/5 shadow-sm">
        <p className="text-sm font-medium text-zinc-500">No active anomalies</p>
      </div>
    );
  }

  // Format timestamps for display if necessary
  const chartData = data.map(d => {
    let formattedTime = d.timestamp;
    try {
      const date = new Date(d.timestamp);
      formattedTime = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: 'numeric' }).format(date);
    } catch {}
    return { ...d, formattedTime };
  });

  return (
    <div className="w-full h-full min-h-[400px]">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={chartData} margin={{ top: 20, right: 20, bottom: 20, left: 0 }}>
          <defs>
            <filter id="glow">
              <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#f59e0b" floodOpacity="0.5" />
            </filter>
          </defs>
          <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} vertical={false} />
          <XAxis 
            dataKey="formattedTime" 
            tick={{ fill: '#71717a', fontSize: 12 }} 
            axisLine={false} 
            tickLine={false} 
            dy={10} 
          />
          <YAxis 
            tick={false} 
            axisLine={false} 
            tickLine={false} 
            domain={['auto', 'auto']}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.2)', strokeWidth: 1 }} />
          <Line
            name="Historical"
            type="monotone"
            dataKey="historicalValue"
            stroke="#10b981"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 6, fill: '#10b981', stroke: '#fff', strokeWidth: 2 }}
          />
          <Line
            name="Predicted"
            type="monotone"
            dataKey="predictedValue"
            stroke="#f59e0b"
            strokeWidth={2}
            strokeDasharray="5 5"
            dot={false}
            filter="url(#glow)"
            activeDot={{ r: 6, fill: '#f59e0b', stroke: '#fff', strokeWidth: 2 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
