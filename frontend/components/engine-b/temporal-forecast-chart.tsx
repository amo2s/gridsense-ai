"use client";

import React, { memo, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useFloating, offset, flip, shift } from "@floating-ui/react";
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

interface TooltipState {
  isOpen: boolean;
  x: number;
  y: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: any;
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
  // State Management (Step 3: Floating UI Virtual Anchor)
  const [tooltipState, setTooltipState] = useState<TooltipState>({
    isOpen: false,
    x: 0,
    y: 0,
    payload: null,
  });

  // Floating UI Hook Configuration (Step 3)
  const { refs, floatingStyles } = useFloating({
    open: tooltipState.isOpen,
    strategy: "fixed",
    placement: "top-start",
    middleware: [
      offset(30), // Pushes tooltip exactly 30px away from the cursor
      flip({ fallbackPlacements: ["bottom-start", "left-start", "right-start"] }), // Smart collision detection
      shift({ padding: 20 }), // Glides along the axis if trapped
    ],
  });

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
          onMouseMove={(e: any) => {
            if (e && e.activePayload && e.activePayload.length > 0) {
              const nativeEvent = e.nativeEvent as MouseEvent | undefined;
              const clientX = nativeEvent?.clientX ?? (e.activeCoordinate?.x ?? 0);
              const clientY = nativeEvent?.clientY ?? (e.activeCoordinate?.y ?? 0);

              refs.setPositionReference({
                getBoundingClientRect: () => ({
                  width: 0,
                  height: 0,
                  x: clientX,
                  y: clientY,
                  top: clientY,
                  left: clientX,
                  right: clientX,
                  bottom: clientY,
                }),
              });

              setTooltipState({
                isOpen: true,
                x: clientX,
                y: clientY,
                payload: e.activePayload,
              });
            } else {
              setTooltipState((prev) => (prev.isOpen ? { ...prev, isOpen: false } : prev));
            }
          }}
          onMouseLeave={() => {
            setTooltipState((prev) => (prev.isOpen ? { ...prev, isOpen: false } : prev));
          }}
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

          {/* Decoupled Recharts Tooltip triggering activePayload without SVG obstruction */}
          <Tooltip content={<></>} cursor={{ stroke: "transparent", fill: "transparent" }} />

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
                dx: -100,
              }}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>

      {/* Spatially-Aware Floating UI Tooltip with Framer Motion Layout Transitions */}
      <AnimatePresence>
        {tooltipState.isOpen && (() => {
          const point = tooltipState.payload?.[0]?.payload as TemporalDataPoint | undefined;
          if (!point) return null;

          const isForecast = Boolean(point.isForecast);
          const prob = point.outage_probability != null ? Number(point.outage_probability) : null;
          const voltage = point.voltage != null ? Number(point.voltage) : null;
          const load = point.load != null ? Number(point.load) : null;

          return (
            <motion.div
              layout
              ref={refs.setFloating}
              style={floatingStyles}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{
                type: "spring",
                stiffness: 300,
                damping: 25,
              }}
              className="pointer-events-none select-none z-50 bg-slate-900/80 backdrop-blur-xl border border-slate-700/50 shadow-[0_16px_40px_-8px_rgba(0,0,0,0.5)] rounded-2xl p-4 text-slate-50 min-w-64"
            >
              {/* Header Badge */}
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-700/50">
                <span className="text-xs font-medium text-slate-400 uppercase tracking-wider font-mono flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  {point.timeLabel}
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
                    <span className="text-xs font-medium text-slate-400">
                      Outage Risk:
                    </span>
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
                  <div className="grid grid-cols-2 gap-2">
                    <div className="p-2.5 rounded-xl bg-slate-800/80 border border-slate-700/80 shadow-xs">
                      <div className="flex items-center gap-1 text-xs font-medium text-slate-400">
                        <Zap className="w-3.5 h-3.5 text-blue-400" />
                        Voltage
                      </div>
                      <p className="font-mono font-bold text-lg text-slate-50 mt-0.5">
                        {voltage != null ? `${voltage.toFixed(1)} V` : "--"}
                      </p>
                    </div>
                    <div className="p-2.5 rounded-xl bg-slate-800/80 border border-slate-700/80 shadow-xs">
                      <div className="flex items-center gap-1 text-xs font-medium text-slate-400">
                        <Activity className="w-3.5 h-3.5 text-purple-400" />
                        Load
                      </div>
                      <p className="font-mono font-bold text-lg text-slate-50 mt-0.5">
                        {load != null ? `${load.toFixed(1)} kW` : "--"}
                      </p>
                    </div>
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
            </motion.div>
          );
        })()}
      </AnimatePresence>
    </motion.div>
  );
};

export const TemporalForecastChart = memo(TemporalForecastChartBase, areTemporalPropsEqual);
export default TemporalForecastChart;
