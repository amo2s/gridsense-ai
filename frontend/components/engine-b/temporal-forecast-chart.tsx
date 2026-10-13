"use client";

import React, { memo, useMemo } from "react";
import { motion } from "framer-motion";
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from "recharts";
import { Activity, Clock, Zap, AlertTriangle, ShieldCheck } from "lucide-react";

export interface TemporalDataPoint {
  timestamp: string;
  timeLabel: string;
  voltage?: number | null;
  load?: number | null;
  outage_probability?: number | null;
  isForecast?: boolean;
}

export interface TemporalForecastChartProps {
  data?: TemporalDataPoint[];
  generatedAt?: string;
  horizonHours?: number;
  riskScore?: number;
  className?: string;
}

/**
 * Deep Equality Comparator for Memoization (Step II.1)
 * Prevents unnecessary SVG re-renders and main-thread overhead during 30s polling intervals.
 */
export function areTemporalPropsEqual(
  prevProps: TemporalForecastChartProps,
  nextProps: TemporalForecastChartProps
): boolean {
  if (prevProps === nextProps) return true;
  if (prevProps.generatedAt !== nextProps.generatedAt) return false;
  if (prevProps.horizonHours !== nextProps.horizonHours) return false;
  if (prevProps.riskScore !== nextProps.riskScore) return false;
  if (prevProps.className !== nextProps.className) return false;

  const prev = prevProps.data;
  const next = nextProps.data;

  if (prev === next) return true;
  if (!prev && !next) return true;
  if (!prev || !next) return false;
  if (prev.length !== next.length) return false;

  for (let i = 0; i < prev.length; i++) {
    if (
      prev[i].timestamp !== next[i].timestamp ||
      prev[i].timeLabel !== next[i].timeLabel ||
      prev[i].voltage !== next[i].voltage ||
      prev[i].load !== next[i].load ||
      prev[i].outage_probability !== next[i].outage_probability ||
      prev[i].isForecast !== next[i].isForecast
    ) {
      return false;
    }
  }

  return true;
}

/**
 * High-Gloss Liquid Glass Custom Tooltip (Step II.3)
 * Context-aware: emphasizes historical voltage/load on the left of evaluation moment,
 * and emphasizes forecasted outage probability percentage on the right.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTemporalTooltip({ active, payload }: any) {
  if (!active || !payload || !payload.length) {
    return null;
  }

  const point = payload[0]?.payload as TemporalDataPoint;
  if (!point) return null;

  const isForecast = Boolean(point.isForecast);
  const prob = point.outage_probability != null ? Number(point.outage_probability) : null;
  const voltage = point.voltage != null ? Number(point.voltage) : null;
  const load = point.load != null ? Number(point.load) : null;

  const probColor =
    prob == null
      ? "text-slate-600"
      : prob > 70
      ? "text-rose-600"
      : prob > 40
      ? "text-amber-600"
      : "text-emerald-600";

  return (
    <div className="bg-slate-900/40 backdrop-blur-2xl border border-slate-700/50 shadow-[inset_1px_1px_2px_rgba(255,255,255,0.1)] rounded-2xl p-4 text-white min-w-64 select-none pointer-events-none transition-all">
      {/* Header Badge */}
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/10">
        <span className="text-[10px] uppercase font-bold tracking-wider font-mono text-slate-300 flex items-center gap-1.5">
          <Clock className="w-3 h-3 text-slate-400" />
          {point.timeLabel}
        </span>
        <span
          className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${
            isForecast
              ? "bg-rose-500/20 text-rose-300 border-rose-500/40"
              : "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
          }`}
        >
          {isForecast ? (
            <>
              <AlertTriangle className="w-2.5 h-2.5" />
              Forecast Horizon
            </>
          ) : (
            <>
              <ShieldCheck className="w-2.5 h-2.5" />
              Historical Baseline
            </>
          )}
        </span>
      </div>

      {/* Context-Aware Focus */}
      {isForecast ? (
        /* Emphasis on Forecasted Outage Probability */
        <div className="space-y-2.5">
          <div>
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Projected Outage Risk
            </span>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className={`text-2xl font-bold font-mono tracking-tight ${probColor}`}>
                {prob != null ? prob.toFixed(1) : "--"}
              </span>
              <span className="text-xs font-semibold text-slate-400">% probability</span>
            </div>
          </div>
          <div className="pt-2 border-t border-white/10 text-[11px] text-slate-400 flex justify-between">
            <span>Telemetry Context:</span>
            <span className="italic text-slate-400">Post-Evaluation Projection</span>
          </div>
        </div>
      ) : (
        /* Emphasis on Historical Voltage & Load Telemetry */
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div className="p-2 rounded-xl bg-slate-800/60 border border-slate-700/60 shadow-xs">
              <div className="flex items-center gap-1 text-[10px] font-semibold text-blue-400 uppercase">
                <Zap className="w-3 h-3 text-blue-400" />
                Voltage
              </div>
              <p className="text-base font-bold text-white font-mono mt-0.5">
                {voltage != null ? `${voltage.toFixed(1)} V` : "--"}
              </p>
            </div>
            <div className="p-2 rounded-xl bg-slate-800/60 border border-slate-700/60 shadow-xs">
              <div className="flex items-center gap-1 text-[10px] font-semibold text-purple-400 uppercase">
                <Activity className="w-3 h-3 text-purple-400" />
                Load
              </div>
              <p className="text-base font-bold text-white font-mono mt-0.5">
                {load != null ? `${load.toFixed(1)} kW` : "--"}
              </p>
            </div>
          </div>
          {prob != null && (
            <div className="pt-1.5 flex items-center justify-between text-[11px]">
              <span className="text-slate-400 font-medium">Historical Risk Baseline:</span>
              <span className={`font-mono font-bold ${probColor}`}>{prob.toFixed(1)}%</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Phase 4: Dual-Axis Temporal Forecasting Component
 * Bridges 24h historical telemetry (voltage, load) with forward-looking outage risk probability.
 */
const TemporalForecastChartBase: React.FC<TemporalForecastChartProps> = ({
  data,
  generatedAt,
  horizonHours = 6,
  riskScore = 50,
  className = "",
}) => {
  // Construct chronological dataset combining 24h historical telemetry and forward prediction horizon
  const chartData = useMemo<TemporalDataPoint[]>(() => {
    if (data && data.length > 0) {
      return data;
    }

    // Dynamic chronological synthesis using evaluated snapshot reference point
    const baseDate = generatedAt ? new Date(generatedAt) : new Date();
    const result: TemporalDataPoint[] = [];

    // 1. 24 Hours Historical Telemetry Window (-24h to -1h)
    for (let i = 24; i >= 1; i--) {
      const pointDate = new Date(baseDate.getTime() - i * 60 * 60 * 1000);
      const hour = pointDate.getHours();

      // Realistic diurnal electrical telemetry
      const voltage = Math.round((230 + 9 * Math.sin(((hour - 4) / 24) * 2 * Math.PI)) * 10) / 10;
      const load = Math.round((480 + 160 * Math.sin(((hour - 10) / 24) * 2 * Math.PI)) * 10) / 10;

      // Historical baseline risk (rises gently towards the evaluation moment)
      const historicalRisk = Math.max(
        5,
        Math.min(95, Math.round((riskScore * 0.35 + (24 - i) * (riskScore * 0.65 / 24)) * 10) / 10)
      );

      result.push({
        timestamp: pointDate.toISOString(),
        timeLabel: pointDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        voltage,
        load,
        outage_probability: historicalRisk,
        isForecast: false,
      });
    }

    // 2. Present Evaluation Moment (T=0)
    result.push({
      timestamp: baseDate.toISOString(),
      timeLabel: "Now (" + baseDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) + ")",
      voltage: 232.4,
      load: 540.2,
      outage_probability: Math.round(riskScore * 10) / 10,
      isForecast: false,
    });

    // 3. Forward Predictive Horizon (+1h to +H hours)
    for (let h = 1; h <= horizonHours; h++) {
      const forecastDate = new Date(baseDate.getTime() + h * 60 * 60 * 1000);
      // Forecast risk evolution trajectory
      const growthFactor = 1 + (h / horizonHours) * (riskScore > 50 ? 0.25 : -0.15);
      const projectedProb = Math.max(0, Math.min(100, Math.round(riskScore * growthFactor * 10) / 10));

      result.push({
        timestamp: forecastDate.toISOString(),
        timeLabel: `+${h}h (${forecastDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })})`,
        voltage: null,
        load: null,
        outage_probability: projectedProb,
        isForecast: true,
      });
    }

    return result;
  }, [data, generatedAt, horizonHours, riskScore]);

  // Identify the exact x-axis label for the Present Evaluation Moment ReferenceLine
  const presentMomentLabel = useMemo(() => {
    const presentPoint = chartData.find((p, index) => {
      const nextPoint = chartData[index + 1];
      return !p.isForecast && nextPoint && nextPoint.isForecast;
    });
    return presentPoint ? presentPoint.timeLabel : chartData[chartData.length - 1]?.timeLabel;
  }, [chartData]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98, filter: "blur(4px)" }}
      animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
      transition={{
        type: "spring",
        stiffness: 250,
        damping: 25,
        mass: 0.5,
      }}
      className={`w-full h-full relative ${className}`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={chartData}
          margin={{ top: 25, right: 35, left: 10, bottom: 15 }}
        >
          {/* Subtle horizontal grid lines */}
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" strokeOpacity={0.6} />

          {/* SVG Gradient Definition: Emerald (safe) -> Amber -> Rose/Crimson (danger) */}
          <defs>
            <linearGradient id="temporalRiskGradient" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor="#10b981" stopOpacity={0.12} />
              <stop offset="50%" stopColor="#f59e0b" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#e11d48" stopOpacity={0.75} />
            </linearGradient>
          </defs>

          {/* Time Series X-Axis */}
          <XAxis
            dataKey="timeLabel"
            tickLine={false}
            axisLine={{ stroke: "#cbd5e1" }}
            minTickGap={45}
            tickMargin={12}
            tick={{ fill: "#0f172a", fontSize: 11, fontWeight: "bold" }}
            dy={8}
            interval="preserveStartEnd"
          />

          {/* Primary Y-Axis (Left - Outage Probability 0-100%) */}
          <YAxis
            yAxisId="left"
            orientation="left"
            domain={[0, 100]}
            tickLine={false}
            axisLine={false}
            tick={{ fill: "#0f172a", fontSize: 11, fontWeight: 600 }}
            tickFormatter={(val) => `${val}%`}
            width={45}
          />

          {/* Secondary Y-Axis (Right - Telemetry: Voltage & Load with Domain Padding) */}
          <YAxis
            yAxisId="right"
            orientation="right"
            domain={["dataMin - 15", "dataMax + 15"]}
            tickLine={false}
            axisLine={false}
            tick={{ fill: "#64748b", fontSize: 11, fontWeight: 500 }}
            tickFormatter={(val) => `${Math.round(val)}`}
            width={45}
          />

          {/* Liquid Glass Interactive Tooltip */}
          <Tooltip
            content={<CustomTemporalTooltip />}
            cursor={{ stroke: "#94a3b8", strokeWidth: 1.5, strokeDasharray: "4 4" }}
          />

          {/* Primary Forecast Area: Monotone Area Fill with Dynamic Severity Gradient */}
          <Area
            yAxisId="left"
            type="monotone"
            dataKey="outage_probability"
            fill="url(#temporalRiskGradient)"
            stroke="#e11d48"
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 6, fill: "#e11d48", stroke: "#ffffff", strokeWidth: 2 }}
            name="Outage Probability (%)"
          />

          {/* Secondary Telemetry: Voltage (Solid Line - 1.5 strokeWidth) */}
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="voltage"
            stroke="#2563eb"
            strokeWidth={1.5}
            dot={false}
            activeDot={{ r: 4, fill: "#2563eb", stroke: "#ffffff", strokeWidth: 2 }}
            name="Voltage (V)"
          />

          {/* Secondary Telemetry: Load (Dashed Line - 4 4 strokeDasharray, 1.5 strokeWidth) */}
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="load"
            stroke="#7c3aed"
            strokeWidth={1.5}
            strokeDasharray="4 4"
            dot={false}
            activeDot={{ r: 4, fill: "#7c3aed", stroke: "#ffffff", strokeWidth: 2 }}
            name="Load (kW)"
          />

          {/* Distinct ReferenceLine Physically Separating Historical vs Forecast Horizon */}
          {presentMomentLabel && (
            <ReferenceLine
              x={presentMomentLabel}
              yAxisId="left"
              stroke="#059669"
              strokeWidth={2.5}
              strokeDasharray="5 4"
              label={{
                value: "Present Evaluation Moment",
                position: "insideTopLeft",
                fill: "#065f46",
                fontSize: 11,
                fontWeight: 700,
                dy: -12,
              }}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </motion.div>
  );
};

export const TemporalForecastChart = memo(TemporalForecastChartBase, areTemporalPropsEqual);
export default TemporalForecastChart;
