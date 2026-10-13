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
import { Clock, AlertTriangle, ShieldCheck } from "lucide-react";

/**
 * Phase 5: Generic Metric Specification for Dynamic Telemetry
 */
export interface ChartMetricConfig {
  key: string;
  name: string;
  color: string;
  strokeDasharray?: string;
  strokeWidth?: number;
  unit?: string;
}

/**
 * Default Engine Telemetry Metrics (Voltage & Load)
 */
export const DEFAULT_TEMPORAL_METRICS: ChartMetricConfig[] = [
  {
    key: "voltage",
    name: "Voltage",
    color: "#2563eb",
    strokeWidth: 1.5,
    unit: "V",
  },
  {
    key: "load",
    name: "Load",
    color: "#7c3aed",
    strokeDasharray: "4 4",
    strokeWidth: 1.5,
    unit: "kW",
  },
];

export interface TemporalDataPoint {
  timestamp: string;
  timeLabel: string;
  outage_probability?: number | null;
  isForecast?: boolean;
  [key: string]: string | number | boolean | null | undefined;
}

export interface TemporalForecastChartProps {
  data?: TemporalDataPoint[];
  generatedAt?: string;
  horizonHours?: number;
  horizonDepth?: number; // Phase 5: Dynamic Prop for variable forward horizons (12h, 24h, 48h)
  riskScore?: number;
  metrics?: ChartMetricConfig[]; // Phase 5: Generic array of telemetry metrics
  className?: string;
}

/**
 * Deep Equality Comparator for Memoization
 */
export function areTemporalPropsEqual(
  prevProps: TemporalForecastChartProps,
  nextProps: TemporalForecastChartProps
): boolean {
  if (prevProps === nextProps) return true;
  if (prevProps.generatedAt !== nextProps.generatedAt) return false;
  if (prevProps.horizonHours !== nextProps.horizonHours) return false;
  if (prevProps.horizonDepth !== nextProps.horizonDepth) return false;
  if (prevProps.riskScore !== nextProps.riskScore) return false;
  if (prevProps.className !== nextProps.className) return false;

  // Compare metrics configurations
  const prevMetrics = prevProps.metrics;
  const nextMetrics = nextProps.metrics;
  if (prevMetrics !== nextMetrics) {
    if (!prevMetrics || !nextMetrics) return false;
    if (prevMetrics.length !== nextMetrics.length) return false;
    for (let i = 0; i < prevMetrics.length; i++) {
      if (
        prevMetrics[i].key !== nextMetrics[i].key ||
        prevMetrics[i].name !== nextMetrics[i].name ||
        prevMetrics[i].color !== nextMetrics[i].color ||
        prevMetrics[i].strokeDasharray !== nextMetrics[i].strokeDasharray
      ) {
        return false;
      }
    }
  }

  // Compare datasets
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
      prev[i].outage_probability !== next[i].outage_probability ||
      prev[i].isForecast !== next[i].isForecast
    ) {
      return false;
    }
  }

  return true;
}

/**
 * Native Recharts Custom Tooltip for Generic Temporal Forecast Chart
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function renderTemporalTooltip(props: any, activeMetrics: ChartMetricConfig[]) {
  const { active, payload, label } = props;
  if (active && payload && payload.length) {
    const point = payload[0]?.payload as TemporalDataPoint | undefined;
    if (!point) return null;

    const isForecast = Boolean(point.isForecast);
    const prob = point.outage_probability != null ? Number(point.outage_probability) : null;

    return (
      <div className="bg-slate-900/90 backdrop-blur-xl border border-slate-700/50 shadow-[0_16px_40px_-8px_rgba(0,0,0,0.5)] rounded-2xl p-4 z-50 text-slate-50 min-w-[220px] select-none pointer-events-none">
        {/* Header Badge */}
        <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-700/50">
          <span className="text-xs font-medium text-slate-400 uppercase tracking-wider font-mono flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            {point.timeLabel || label}
          </span>
          <span
            className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
              isForecast
                ? "bg-rose-500/20 text-rose-300 border-rose-500/40"
                : "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
            }`}
          >
            {isForecast ? (
              <>
                <AlertTriangle className="w-3 h-3" />
                Forecast Horizon
              </>
            ) : (
              <>
                <ShieldCheck className="w-3 h-3" />
                Historical Baseline
              </>
            )}
          </span>
        </div>

        {/* Context-Aware Content */}
        {isForecast ? (
          <div className="space-y-2">
            <div>
              <span className="text-xs font-medium text-slate-400">Outage Risk:</span>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <span className="font-mono font-bold text-lg text-slate-50 tracking-tight">
                  {prob != null ? `${prob.toFixed(1)}%` : "--"}
                </span>
                <span className="text-xs font-medium text-slate-400">probability</span>
              </div>
            </div>
            <div className="pt-2 border-t border-slate-700/50 text-xs font-medium text-slate-400 flex justify-between">
              <span>Evaluation Stage:</span>
              <span className="text-slate-300">Post-Evaluation Projection</span>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {/* Dynamically mapped metrics */}
            <div className={`grid ${activeMetrics.length > 1 ? "grid-cols-2" : "grid-cols-1"} gap-2`}>
              {activeMetrics.map((metric) => {
                const val = point[metric.key];
                const numericVal = typeof val === "number" ? val : null;
                return (
                  <div key={metric.key} className="p-2.5 rounded-xl bg-slate-800/80 border border-slate-700/80 shadow-xs">
                    <div className="flex items-center gap-1.5 text-xs font-medium text-slate-400 truncate">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: metric.color }} />
                      <span className="truncate">{metric.name}</span>
                    </div>
                    <p className="font-mono font-bold text-lg text-slate-50 mt-0.5">
                      {numericVal != null
                        ? `${numericVal.toFixed(1)}${metric.unit ? ` ${metric.unit}` : ""}`
                        : "--"}
                    </p>
                  </div>
                );
              })}
            </div>
            {prob != null && (
              <div className="pt-2 border-t border-slate-700/50 flex items-center justify-between">
                <span className="text-xs font-medium text-slate-400">Baseline Risk:</span>
                <span className="font-mono font-bold text-lg text-slate-50">
                  {prob.toFixed(1)}%
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }
  return null;
}

/**
 * Phase 5: Decoupled Dual-Axis Temporal Forecasting Component
 * Supports variable horizon depths (6h, 12h, 24h, 48h) and arbitrary telemetry metric definitions.
 */
const TemporalForecastChartBase: React.FC<TemporalForecastChartProps> = ({
  data,
  generatedAt,
  horizonHours,
  horizonDepth,
  riskScore = 50,
  metrics,
  className = "",
}) => {
  // Resolve dynamic horizon depth (defaults to 6 if neither is specified)
  const effectiveHorizon = horizonDepth ?? horizonHours ?? 6;
  const activeMetrics = metrics && metrics.length > 0 ? metrics : DEFAULT_TEMPORAL_METRICS;

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

      // Diurnal historical telemetry baselines
      const voltage = Math.round((230 + 9 * Math.sin(((hour - 4) / 24) * 2 * Math.PI)) * 10) / 10;
      const load = Math.round((480 + 160 * Math.sin(((hour - 10) / 24) * 2 * Math.PI)) * 10) / 10;

      // Historical baseline risk (rises gently towards the evaluation moment)
      const historicalRisk = Math.max(
        5,
        Math.min(95, Math.round((riskScore * 0.35 + (24 - i) * (riskScore * 0.65 / 24)) * 10) / 10)
      );

      const point: TemporalDataPoint = {
        timestamp: pointDate.toISOString(),
        timeLabel: pointDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        outage_probability: historicalRisk,
        isForecast: false,
        voltage,
        load,
      };

      result.push(point);
    }

    // 2. Present Evaluation Moment (T=0)
    result.push({
      timestamp: baseDate.toISOString(),
      timeLabel: "Now (" + baseDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) + ")",
      outage_probability: Math.round(riskScore * 10) / 10,
      isForecast: false,
      voltage: 232.4,
      load: 540.2,
    });

    // 3. Forward Predictive Horizon (+1h to +H hours) based on effectiveHorizon
    for (let h = 1; h <= effectiveHorizon; h++) {
      const forecastDate = new Date(baseDate.getTime() + h * 60 * 60 * 1000);
      // Forecast risk evolution trajectory
      const growthFactor = 1 + (h / effectiveHorizon) * (riskScore > 50 ? 0.25 : -0.15);
      const projectedProb = Math.max(0, Math.min(100, Math.round(riskScore * growthFactor * 10) / 10));

      const point: TemporalDataPoint = {
        timestamp: forecastDate.toISOString(),
        timeLabel: `+${h}h (${forecastDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })})`,
        outage_probability: projectedProb,
        isForecast: true,
      };

      // Set forecast telemetry metrics to null
      activeMetrics.forEach((m) => {
        point[m.key] = null;
      });

      result.push(point);
    }

    return result;
  }, [data, generatedAt, effectiveHorizon, riskScore, activeMetrics]);

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
            padding={{ left: 20, right: 30 }}
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

          {/* Secondary Y-Axis (Right - Telemetry with Domain Padding) */}
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

          {/* Native Recharts Custom Tooltip with restricted horizontal escape and elevated stacking */}
          <Tooltip
            content={(props) => renderTemporalTooltip(props, activeMetrics)}
            cursor={{ stroke: "transparent", fill: "transparent" }}
            offset={40}
            allowEscapeViewBox={{ x: false, y: true }}
            wrapperStyle={{ zIndex: 100 }}
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

          {/* Dynamically Mapped Telemetry Lines (Phase 5 Decoupling) */}
          {activeMetrics.map((metric) => (
            <Line
              key={metric.key}
              yAxisId="right"
              type="monotone"
              dataKey={metric.key}
              stroke={metric.color}
              strokeWidth={metric.strokeWidth ?? 1.5}
              strokeDasharray={metric.strokeDasharray}
              dot={false}
              activeDot={{ r: 4, fill: metric.color, stroke: "#ffffff", strokeWidth: 2 }}
              name={metric.unit ? `${metric.name} (${metric.unit})` : metric.name}
            />
          ))}

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
                dx: -100,
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
