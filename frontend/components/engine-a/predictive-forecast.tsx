"use client";

import React from "react";
import { useQuery } from "@tanstack/react-query";
import { graphqlClient } from "@/lib/graphql-client";
import { GET_AREA_DRILL_DOWN_METRICS } from "@/lib/graphql/queries";
import { Loader2 } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

interface PredictiveForecastProps {
  feederId: string;
}

export function PredictiveForecast({ feederId }: PredictiveForecastProps) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["predictive-forecast", feederId],
    queryFn: async () => {
      const res = await graphqlClient.request<any>(GET_AREA_DRILL_DOWN_METRICS, {
        areaId: feederId,
        timeRange: "6h"
      });
      return res.predictiveRiskForecast;
    }
  });

  if (isLoading) {
    return (
      <div className="liquid-panel backdrop-blur-md relative overflow-hidden p-6 bg-gradient-to-br from-white/80 to-white/30 border border-white/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),_0_8px_16px_-4px_rgba(0,0,0,0.1)] rounded-3xl w-full h-full min-h-[400px] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#10b981]" />
      </div>
    );
  }

  // Intercept empty state before mounting Recharts
  if (isError || !data || data.length === 0) {
    return (
      <div className="liquid-panel backdrop-blur-md relative overflow-hidden p-6 bg-gradient-to-br from-white/80 to-white/30 border border-white/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),_0_8px_16px_-4px_rgba(0,0,0,0.1)] rounded-3xl w-full h-full min-h-[400px] flex flex-col items-center justify-center">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white to-transparent opacity-80" />
        <p className="text-gray-400 font-medium z-10">No data available</p>
      </div>
    );
  }

  // Format dataset for Recharts
  const formattedData = data.map((d: any) => {
    const date = new Date(d.timestamp);
    return {
      ...d,
      timeLabel: date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
  });

  return (
    <div className="liquid-panel backdrop-blur-md relative overflow-hidden p-6 bg-gradient-to-br from-white/80 to-white/30 border border-white/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),_0_8px_16px_-4px_rgba(0,0,0,0.1)] rounded-3xl w-full h-full min-h-[400px] flex flex-col">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white to-transparent opacity-80" />
      
      <div className="flex justify-between items-center mb-6 relative z-10">
        <h2 className="text-lg font-semibold text-neutral-800">Predictive Risk Forecast</h2>
        <div className="flex gap-4">
          <div className="flex items-center gap-2">
            <span className="w-3 h-0.5 bg-slate-500"></span>
            <span className="text-xs text-slate-500 font-medium">Historical</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-0.5 border-t border-dashed border-[#10b981]"></span>
            <span className="text-xs text-[#10b981] font-medium">Forecast (Engine A)</span>
          </div>
        </div>
      </div>
      
      <div className="flex-1 w-full relative z-10 min-h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={formattedData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <defs>
              {/* Glowing SVG filter for the forecasted intelligence line */}
              <filter id="emeraldGlow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="4" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e5e5" />
            <XAxis 
              dataKey="timeLabel" 
              axisLine={false} 
              tickLine={false} 
              tick={{ fontSize: 11, fill: '#71717a' }} 
              dy={10}
            />
            <YAxis 
              axisLine={false} 
              tickLine={false} 
              tick={{ fontSize: 11, fill: '#71717a' }}
              domain={[0, 100]} 
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'rgba(255, 255, 255, 0.9)',
                backdropFilter: 'blur(12px)',
                borderRadius: '12px',
                border: '1px solid rgba(255,255,255,0.6)',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                color: '#3f3f46'
              }}
              labelStyle={{ color: '#71717a', fontSize: '12px', marginBottom: '4px' }}
              itemStyle={{ fontWeight: 600 }}
            />

            {/* Confirmed Historical Telemetry (Solid Line) */}
            <Line
              type="monotone"
              dataKey="historicalValue"
              stroke="#64748b"
              strokeWidth={3}
              dot={false}
              activeDot={{ r: 6, fill: '#64748b', stroke: '#fff', strokeWidth: 2 }}
              name="Historical Risk"
            />

            {/* AI-Generated Forecasted Intelligence (Dashed Line + Glowing Drop-Shadow) */}
            <Line
              type="monotone"
              dataKey="predictedValue"
              stroke="#10b981"
              strokeWidth={3}
              strokeDasharray="5 5"
              dot={false}
              activeDot={{ r: 6, fill: '#10b981', stroke: '#fff', strokeWidth: 2 }}
              name="Predicted Risk"
              filter="url(#emeraldGlow)"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
