"use client";

import React, { useRef, useEffect, useState, useMemo } from "react";
import isEqual from "fast-deep-equal";
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ReferenceLine,
} from "recharts";
import {
  Activity,
  Calendar,
  Layers,
  Cpu,
  TrendingUp,
  AlertTriangle,
  Zap,
  Gauge,
  Sliders,
  CheckCircle2,
} from "lucide-react";
import { useTelemetryRenderMode, TelemetryRenderMode } from "@/hooks/use-telemetry-render-mode";

/**
 * ============================================================================
 * GENERIC TEMPORAL HORIZON TUNNEL INTERFACES (BLUEPRINT STEP 4.1)
 * ============================================================================
 * Completely decoupled from specific Engine C schemas.
 * Exposes a generic timeline dataset with statistical envelope bounds (±3σ)
 * and excursion markers, ready for Engine C, Engine D, and beyond.
 */
export interface GenericTunnelPoint {
  timestamp: string;
  timeLabel: string;
  observed: number;
  baseline: number;
  upper_bound: number;
  lower_bound: number;
  residual?: number;
  is_excursion?: boolean;
}

export interface GenericTemporalTunnelProps {
  dataPoints?: GenericTunnelPoint[];
  title?: string;
  subtitle?: string;
  metricLabel?: string;
  metricUnit?: string;
  nominalValue?: number;
  isAnomaly?: boolean;
  severity?: string;
  assetContext?: string;
  className?: string;

  // Backwards-compatible legacy props:
  telemetry?: GenericTunnelPoint[];
  activeFeederId?: string;
}

export type SeasonalSTLTunnelChartProps = GenericTemporalTunnelProps;

/**
 * ============================================================================
 * GENERIC TEMPORAL HORIZON / SEASONAL STL RESIDUAL TUNNEL CHART
 * ============================================================================
 * Plots dynamic upper (+3σ) and lower (-3σ) confidence bounds around the
 * expectation baseline to visualize real-time residual drift.
 *
 * Implements:
 *  - Composed Recharts SVG structure for standard density
 *  - Dynamic HTML5 Canvas rendering fallback when point density threatens DOM
 *  - 60 FPS hardware-accelerated Canvas render loop
 *  - Strict Liquid Glass styling
 *  - fast-deep-equal React.memo render optimization (Step 3.5)
 */
function SeasonalSTLTunnelChartComponent({
  dataPoints,
  telemetry = [],
  title,
  subtitle,
  metricLabel = "Observed Telemetry",
  metricUnit = "kW",
  isAnomaly = false,
  severity = "LOW",
  assetContext = "",
  activeFeederId = "",
  nominalValue = 520,
  className = "",
}: GenericTemporalTunnelProps) {
  const points = (dataPoints && dataPoints.length > 0 ? dataPoints : telemetry) || [];
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Blueprint Step 3.2: Custom Hook for dynamic render mode arbitration (SVG vs Canvas)
  const {
    renderMode,
    mode,
    isCanvas,
    isFallbackActive,
    fps,
    setMode,
    threshold,
  } = useTelemetryRenderMode(points.length, { threshold: 96 });

  // Pre-calculate tunnel metrics for display
  const metrics = useMemo(() => {
    if (!points || points.length === 0) {
      return {
        maxExcursion: 0,
        excursionCount: 0,
        avgBandWidth: 147,
        latestObserved: nominalValue,
        latestBaseline: nominalValue,
        status: "Nominal",
      };
    }

    let maxExcursion = 0;
    let excursionCount = 0;
    let totalBandWidth = 0;

    points.forEach((pt) => {
      const exc = Math.abs(pt.residual ?? (pt.observed - pt.baseline));
      if (exc > maxExcursion) maxExcursion = exc;
      if (pt.is_excursion) excursionCount++;
      totalBandWidth += pt.upper_bound - pt.lower_bound;
    });

    const latest = points[points.length - 1];
    return {
      maxExcursion: Number(maxExcursion.toFixed(1)),
      excursionCount,
      avgBandWidth: Number((totalBandWidth / points.length).toFixed(1)),
      latestObserved: latest?.observed ?? nominalValue,
      latestBaseline: latest?.baseline ?? nominalValue,
      status: excursionCount > 0 ? "Excursion Detected" : "Within Envelope",
    };
  }, [points, nominalValue]);

  // Transform telemetry points for Recharts ComposedChart
  const chartData = useMemo(() => {
    return points.map((pt) => ({
      time: pt.timeLabel,
      observed: pt.observed,
      baseline: pt.baseline,
      upper_bound: pt.upper_bound,
      lower_bound: pt.lower_bound,
      tunnelRange: [pt.lower_bound, pt.upper_bound] as [number, number],
      residual: pt.residual ?? (pt.observed - pt.baseline),
      is_excursion: pt.is_excursion,
    }));
  }, [points]);

  // ---------------------------------------------------------------------------
  // NATIVE HTML5 CANVAS RENDERING PIPELINE (60 FPS DOM INFLATION FALLBACK)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!isCanvas || !canvasRef.current || points.length === 0) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId = 0;

    const renderCanvas = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      const width = rect.width;
      const height = rect.height;

      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.scale(dpr, dpr);

      // Clear Canvas
      ctx.clearRect(0, 0, width, height);

      const padding = { top: 24, right: 30, bottom: 36, left: 54 };
      const plotWidth = width - padding.left - padding.right;
      const plotHeight = height - padding.top - padding.bottom;

      if (plotWidth <= 0 || plotHeight <= 0) return;

      // Find min and max for scaling
      let minY = Infinity;
      let maxY = -Infinity;
      points.forEach((pt) => {
        if (pt.lower_bound < minY) minY = pt.lower_bound;
        if (pt.upper_bound > maxY) maxY = pt.upper_bound;
        if (pt.observed < minY) minY = pt.observed;
        if (pt.observed > maxY) maxY = pt.observed;
      });

      minY = Math.floor(minY - 20);
      maxY = Math.ceil(maxY + 20);
      const rangeY = maxY - minY || 1;

      const getX = (idx: number) => padding.left + (idx / Math.max(1, points.length - 1)) * plotWidth;
      const getY = (val: number) => padding.top + plotHeight - ((val - minY) / rangeY) * plotHeight;

      // 1. Draw Grid Lines
      ctx.strokeStyle = "rgba(148, 163, 184, 0.15)";
      ctx.lineWidth = 1;

      const gridSteps = 5;
      for (let i = 0; i <= gridSteps; i++) {
        const val = minY + (rangeY / gridSteps) * i;
        const y = getY(val);
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(width - padding.right, y);
        ctx.stroke();

        // Y-axis label
        ctx.fillStyle = "#94a3b8";
        ctx.font = "10px monospace";
        ctx.textAlign = "right";
        ctx.fillText(`${val.toFixed(0)}${metricUnit}`, padding.left - 8, y + 3);
      }

      // X-axis time labels (sample every 4 points)
      ctx.textAlign = "center";
      points.forEach((pt, idx) => {
        if (idx % 4 === 0 || idx === points.length - 1) {
          const x = getX(idx);
          ctx.fillStyle = "#94a3b8";
          ctx.font = "10px monospace";
          ctx.fillText(pt.timeLabel, x, height - 12);
        }
      });

      // 2. Draw Shaded Confidence Tunnel Envelope (±3σ)
      ctx.beginPath();
      points.forEach((pt, idx) => {
        const x = getX(idx);
        const yUpper = getY(pt.upper_bound);
        if (idx === 0) ctx.moveTo(x, yUpper);
        else ctx.lineTo(x, yUpper);
      });

      for (let i = points.length - 1; i >= 0; i--) {
        const pt = points[i];
        const x = getX(i);
        const yLower = getY(pt.lower_bound);
        ctx.lineTo(x, yLower);
      }
      ctx.closePath();

      // Shaded tunnel gradient
      const tunnelGrad = ctx.createLinearGradient(0, padding.top, 0, height - padding.bottom);
      if (isAnomaly) {
        tunnelGrad.addColorStop(0, "rgba(244, 63, 94, 0.22)");
        tunnelGrad.addColorStop(1, "rgba(244, 63, 94, 0.08)");
      } else {
        tunnelGrad.addColorStop(0, "rgba(59, 130, 246, 0.18)");
        tunnelGrad.addColorStop(1, "rgba(59, 130, 246, 0.05)");
      }
      ctx.fillStyle = tunnelGrad;
      ctx.fill();

      // Upper bound dashed outline
      ctx.strokeStyle = isAnomaly ? "rgba(244, 63, 94, 0.45)" : "rgba(59, 130, 246, 0.35)";
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      points.forEach((pt, idx) => {
        const x = getX(idx);
        const y = getY(pt.upper_bound);
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();

      // Lower bound dashed outline
      ctx.beginPath();
      points.forEach((pt, idx) => {
        const x = getX(idx);
        const y = getY(pt.lower_bound);
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();

      // 3. Draw Baseline Expectation (Dashed line)
      ctx.strokeStyle = "#94a3b8";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      points.forEach((pt, idx) => {
        const x = getX(idx);
        const y = getY(pt.baseline);
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();

      // 4. Draw Observed Real-Time Telemetry Line (Solid line)
      ctx.setLineDash([]);
      ctx.strokeStyle = isAnomaly ? "#f43f5e" : "#10b981";
      ctx.lineWidth = 2.5;
      ctx.shadowColor = isAnomaly ? "rgba(244, 63, 94, 0.4)" : "rgba(16, 185, 129, 0.3)";
      ctx.shadowBlur = 8;
      ctx.beginPath();
      points.forEach((pt, idx) => {
        const x = getX(idx);
        const y = getY(pt.observed);
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.shadowBlur = 0; // Reset shadow

      // 5. Draw Excursion Breach Markers
      points.forEach((pt, idx) => {
        if (pt.is_excursion) {
          const x = getX(idx);
          const y = getY(pt.observed);

          // Glowing outer halo
          ctx.beginPath();
          ctx.arc(x, y, 7, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(244, 63, 94, 0.25)";
          ctx.fill();

          // Solid crimson circle
          ctx.beginPath();
          ctx.arc(x, y, 4, 0, Math.PI * 2);
          ctx.fillStyle = "#f43f5e";
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 1.5;
          ctx.fill();
          ctx.stroke();
        }
      });
    };

    renderCanvas();
    const handleResize = () => {
      cancelAnimationFrame(animId);
      animId = requestAnimationFrame(renderCanvas);
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(animId);
    };
  }, [isCanvas, points, isAnomaly, metricUnit]);

  return (
    <div className="w-full bg-white/20 backdrop-blur-2xl bg-gradient-to-br from-white/60 via-white/10 to-white/5 shadow-[inset_1px_1px_2px_rgba(255,255,255,0.8),inset-1px_-1px_3px_rgba(255,255,255,0.1)] shadow-[0_16px_40px_-8px_rgba(15,23,42,0.15)] rounded-3xl border border-white/40 p-6">
      {/* Chart Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200/60 mb-5">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="p-2 rounded-xl bg-slate-900 text-white shadow-xs">
              <Calendar className="w-4 h-4 text-blue-400" />
            </div>
            <h2 className="text-base sm:text-lg font-bold tracking-tight text-slate-900">
              Seasonal STL Residual Tunnel
            </h2>
            <span className={`inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-xs font-semibold font-mono border ${
              isAnomaly
                ? "bg-rose-500/15 text-rose-800 border-rose-500/35"
                : "bg-emerald-500/10 text-emerald-700 border border-emerald-500/20"
            }`}>
              <span className={`w-2 h-2 rounded-full ${isAnomaly ? "bg-rose-500 animate-ping" : "bg-emerald-500"}`} />
              <span>{isAnomaly ? "Statistical Breach" : "Within Envelope"}</span>
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1 pl-9">
            Dynamic &plusmn;3&sigma; Confidence Envelope &bull; Real-Time Observed Telemetry Excursion Inspection
          </p>
        </div>

        {/* Rendering Pipeline & Performance Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Pipeline Switcher Badge */}
          <div className="flex items-center rounded-xl bg-white/60 border border-white/80 p-0.5 text-xs font-mono shadow-2xs">
            <button
              type="button"
              onClick={() => setMode("auto")}
              className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                mode === "auto" ? "bg-slate-900 text-white font-bold" : "text-slate-500 hover:text-slate-800"
              }`}
              title="Automatically select Canvas when telemetry points exceed threshold"
            >
              Auto
            </button>
            <button
              type="button"
              onClick={() => setMode("svg")}
              className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                mode === "svg" ? "bg-slate-900 text-white font-bold" : "text-slate-500 hover:text-slate-800"
              }`}
              title="Force Recharts SVG ComposedChart rendering"
            >
              SVG
            </button>
            <button
              type="button"
              onClick={() => setMode("canvas")}
              className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                mode === "canvas" ? "bg-slate-900 text-white font-bold" : "text-slate-500 hover:text-slate-800"
              }`}
              title="Force HTML5 Canvas 60 FPS hardware accelerated rendering"
            >
              Canvas
            </button>
          </div>

          {/* Active Mode Status Badge */}
          <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-mono border shadow-2xs ${
            isCanvas
              ? "bg-purple-500/10 text-purple-800 border-purple-500/30 font-semibold"
              : "bg-blue-500/10 text-blue-800 border-blue-500/30"
          }`}>
            <Cpu className="w-3.5 h-3.5" />
            <span>{isCanvas ? `Canvas 2D (${fps} FPS)` : "Recharts SVG"}</span>
          </span>
        </div>
      </div>

      {/* Overview Metric Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <div className="p-3.5 rounded-2xl bg-white/40 border border-white/60 shadow-xs backdrop-blur-md">
          <span className="text-[11px] text-slate-500 uppercase tracking-wider font-semibold block mb-0.5">
            Max Residual Delta
          </span>
          <div className="flex items-baseline gap-1">
            <span className={`text-xl font-bold font-mono ${
              metrics.maxExcursion > 60 ? "text-rose-600" : "text-slate-800"
            }`}>
              {metrics.maxExcursion}
            </span>
            <span className="text-xs font-mono text-slate-400">kW</span>
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-white/40 border border-white/60 shadow-xs backdrop-blur-md">
          <span className="text-[11px] text-slate-500 uppercase tracking-wider font-semibold block mb-0.5">
            Statistical Envelope
          </span>
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-bold font-mono text-blue-700">
              &plusmn;3&sigma;
            </span>
            <span className="text-xs font-mono text-slate-400">({metrics.avgBandWidth}kW span)</span>
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-white/40 border border-white/60 shadow-xs backdrop-blur-md">
          <span className="text-[11px] text-slate-500 uppercase tracking-wider font-semibold block mb-0.5">
            Out-of-Bounds Excursions
          </span>
          <div className="flex items-baseline gap-1">
            <span className={`text-xl font-bold font-mono ${
              metrics.excursionCount > 0 ? "text-rose-600" : "text-emerald-700"
            }`}>
              {metrics.excursionCount}
            </span>
            <span className="text-xs font-mono text-slate-400">/ {telemetry.length} steps</span>
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-white/40 border border-white/60 shadow-xs backdrop-blur-md">
          <span className="text-[11px] text-slate-500 uppercase tracking-wider font-semibold block mb-0.5">
            Current Telemetry
          </span>
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-bold font-mono text-slate-900">
              {metrics.latestObserved}
            </span>
            <span className="text-xs font-mono text-slate-400">kW (Exp: {metrics.latestBaseline})</span>
          </div>
        </div>
      </div>

      {/* Main Chart Visualization Space */}
      <div className="relative w-full h-[340px] rounded-2xl border border-white/60 bg-white/30 backdrop-blur-xl p-3 shadow-inner overflow-hidden">
        {isCanvas ? (
          /* HTML5 Canvas Rendering Fallback for high point density */
          <div className="relative w-full h-full flex flex-col justify-between">
            <canvas ref={canvasRef} className="w-full h-full block" />
            <div className="absolute top-3 right-4 flex items-center gap-2 px-2.5 py-1 rounded-lg bg-slate-900/80 text-white text-[10px] font-mono backdrop-blur-md shadow-xs">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Canvas Accelerated &bull; {fps} FPS</span>
            </div>
          </div>
        ) : (
          /* Recharts ComposedChart SVG Rendering for standard density */
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={chartData}
              margin={{ top: 20, right: 24, bottom: 12, left: 16 }}
            >
              <defs>
                <linearGradient id="tunnelGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor={isAnomaly ? "#f43f5e" : "#3b82f6"}
                    stopOpacity={0.22}
                  />
                  <stop
                    offset="100%"
                    stopColor={isAnomaly ? "#f43f5e" : "#3b82f6"}
                    stopOpacity={0.04}
                  />
                </linearGradient>
              </defs>

              <XAxis
                dataKey="time"
                tick={{ fontSize: 11, fill: "#64748b", fontFamily: "monospace" }}
                stroke="#cbd5e1"
                tickLine={false}
              />
              <YAxis
                domain={["auto", "auto"]}
                tick={{ fontSize: 11, fill: "#64748b", fontFamily: "monospace" }}
                stroke="#cbd5e1"
                tickLine={false}
                unit="kW"
              />

              {/* Custom Tooltip (Section 8.1 Native Recharts Tooltip Physics) */}
              <Tooltip
                allowEscapeViewBox={{ x: false, y: true }}
                offset={20}
                wrapperStyle={{ zIndex: 100 }}
                content={({ active, payload, label }) => {
                  if (!active || !payload || !payload.length) return null;
                  const data = payload[0]?.payload;
                  if (!data) return null;

                  return (
                    <div className="rounded-2xl border border-white/80 bg-white/90 backdrop-blur-xl p-3.5 shadow-xl text-xs font-mono space-y-1.5">
                      <div className="font-bold text-slate-800 border-b border-slate-200/60 pb-1 mb-1">
                        Timeline Step: {label}
                      </div>
                      <div className="flex items-center justify-between gap-4 text-slate-600">
                        <span>Observed Power:</span>
                        <span className={`font-bold ${data.is_excursion ? "text-rose-600" : "text-emerald-700"}`}>
                          {data.observed} kW
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-4 text-slate-600">
                        <span>STL Expectation:</span>
                        <span className="font-semibold text-slate-800">{data.baseline} kW</span>
                      </div>
                      <div className="flex items-center justify-between gap-4 text-blue-700">
                        <span>+3&sigma; Upper Bound:</span>
                        <span>{data.upper_bound} kW</span>
                      </div>
                      <div className="flex items-center justify-between gap-4 text-blue-700">
                        <span>-3&sigma; Lower Bound:</span>
                        <span>{data.lower_bound} kW</span>
                      </div>
                      <div className="flex items-center justify-between gap-4 text-slate-500 border-t border-slate-200/60 pt-1">
                        <span>Residual Excursion:</span>
                        <span className={Math.abs(data.residual) > 50 ? "text-rose-600 font-bold" : "text-slate-700"}>
                          {data.residual > 0 ? `+${data.residual}` : data.residual} kW
                        </span>
                      </div>
                    </div>
                  );
                }}
              />

              <Legend
                verticalAlign="top"
                align="right"
                wrapperStyle={{ paddingBottom: 10, fontSize: 11, fontFamily: "monospace" }}
              />

              {/* Statistical Confidence Tunnel (±3σ) */}
              <Area
                type="monotone"
                dataKey="tunnelRange"
                fill="url(#tunnelGradient)"
                stroke={isAnomaly ? "#f43f5e" : "#3b82f6"}
                strokeDasharray="3 3"
                strokeWidth={1}
                strokeOpacity={0.6}
                name="±3σ Confidence Tunnel Envelope"
              />

              {/* Seasonal Diurnal Baseline Expectation */}
              <Line
                type="monotone"
                dataKey="baseline"
                stroke="#64748b"
                strokeDasharray="4 4"
                strokeWidth={1.5}
                dot={false}
                name="STL Diurnal Baseline (Expected)"
              />

              {/* Observed Active Telemetry Series */}
              <Line
                type="monotone"
                dataKey="observed"
                stroke={isAnomaly ? "#f43f5e" : "#10b981"}
                strokeWidth={2.5}
                dot={(dotProps: any) => {
                  const { cx, cy, payload } = dotProps;
                  if (payload.is_excursion) {
                    return (
                      <g key={`dot-${payload.time}`}>
                        <circle cx={cx} cy={cy} r={6} fill="#f43f5e" fillOpacity={0.3} className="animate-ping" />
                        <circle cx={cx} cy={cy} r={4.5} fill="#f43f5e" stroke="#ffffff" strokeWidth={1.5} />
                      </g>
                    );
                  }
                  return <circle key={`dot-${payload.time}`} cx={cx} cy={cy} r={2} fill={isAnomaly ? "#f43f5e" : "#10b981"} />;
                }}
                activeDot={{ r: 6, stroke: "#ffffff", strokeWidth: 2 }}
                name="Observed Active Power Telemetry"
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

/**
 * Render Optimization: Wrapped in React.memo using fast-deep-equal (Blueprint Step 3.5)
 * Bypasses expensive Recharts SVG path recalculations on 30s polling ticks when data is unchanged.
 */
export const SeasonalSTLTunnelChart = React.memo(
  SeasonalSTLTunnelChartComponent,
  (prevProps, nextProps) => isEqual(prevProps, nextProps)
);

export default SeasonalSTLTunnelChart;
