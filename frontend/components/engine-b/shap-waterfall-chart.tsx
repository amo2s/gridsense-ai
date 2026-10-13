"use client";

import React, { memo, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useFloating, offset, flip, shift } from "@floating-ui/react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  CartesianGrid,
} from "recharts";
import { formatShapFeature } from "@/lib/formatters/shap-dictionary";
import { ShapFactor } from "@/hooks/use-engine-b-summary";
import { Activity, TrendingUp, TrendingDown } from "lucide-react";

export interface ShapWaterfallChartProps {
  contributing_factors?: ShapFactor[] | null;
  className?: string;
}

interface ChartFactorItem {
  rawName: string;
  formattedName: string;
  value: number;
}

interface TooltipState {
  isOpen: boolean;
  x: number;
  y: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: any;
}

/**
 * Strict Custom Equality Comparator (Step 2)
 * Performs deep equality checking on contributing_factors to prevent Recharts
 * SVG re-renders and main thread stalls during 30s background TanStack Query ticks.
 */
export function areShapPropsEqual(
  prevProps: ShapWaterfallChartProps,
  nextProps: ShapWaterfallChartProps
): boolean {
  const prev = prevProps.contributing_factors;
  const next = nextProps.contributing_factors;

  if (prev === next) return true;
  if (!prev && !next) return true;
  if (!prev || !next) return false;
  if (prev.length !== next.length) return false;

  for (let i = 0; i < prev.length; i++) {
    if (
      prev[i].feature_name !== next[i].feature_name ||
      prev[i].contribution !== next[i].contribution
    ) {
      return false;
    }
  }

  return true;
}

/**
 * Custom Y-Axis Label Renderer (Step 1)
 * Typography: text-xs font-semibold text-slate-900 (#0f172a) with calculated dy offset
 * to center the SVG text node vertically against each horizontal bar.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function renderYAxisTick(props: any) {
  const { x = 0, y = 0, payload } = props;
  const text = String(payload?.value || "");

  return (
    <g transform={`translate(${x},${y})`}>
      <text
        x={-10}
        y={0}
        dy="0.35em"
        textAnchor="end"
        fill="#0f172a"
        className="text-xs font-semibold text-slate-900 select-none font-sans"
      >
        <title>{text}</title>
        {text}
      </text>
    </g>
  );
}

/**
 * Phase 3 & 4: Explainable AI (XAI) Mathematical Waterfall Chart
 */
const ShapWaterfallChartBase: React.FC<ShapWaterfallChartProps> = ({
  contributing_factors,
  className = "",
}) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

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

  const chartData = useMemo<ChartFactorItem[]>(() => {
    if (!contributing_factors || contributing_factors.length === 0) {
      return [];
    }
    return contributing_factors.map((factor) => ({
      rawName: factor.feature_name,
      formattedName: formatShapFeature(factor.feature_name),
      value: factor.contribution,
    }));
  }, [contributing_factors]);

  if (chartData.length === 0) {
    return (
      <div
        className={`w-full h-full flex flex-col items-center justify-center p-6 text-center ${className}`}
      >
        <div className="w-10 h-10 rounded-2xl bg-white/60 border border-white/80 shadow-xs flex items-center justify-center text-slate-600 mb-2">
          <Activity className="w-5 h-5" />
        </div>
        <p className="text-xs font-semibold text-slate-800">
          No Feature Attribution Factors Available
        </p>
        <p className="text-[11px] text-slate-500 max-w-xs mt-1">
          Inference payload does not contain TreeSHAP factor decompositions for this snapshot.
        </p>
      </div>
    );
  }

  return (
    <div className={`w-full h-full relative ${className}`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          layout="vertical"
          data={chartData}
          margin={{ top: 20, right: 30, left: 180, bottom: 20 }}
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
            setHoveredIndex(null);
          }}
        >
          {/* Noisy grid lines completely stripped */}
          <CartesianGrid vertical={false} horizontal={false} />

          {/* Minimalist X-Axis hidden */}
          <XAxis type="number" hide domain={["auto", "auto"]} />

          {/* Humanized Y-Axis with width 170 to match expanded margin */}
          <YAxis
            dataKey="formattedName"
            type="category"
            tickLine={false}
            axisLine={false}
            tick={renderYAxisTick}
            width={170}
          />

          {/* Decoupled Recharts Tooltip triggering activePayload without SVG obstruction */}
          <Tooltip content={<></>} cursor={{ fill: "transparent" }} />

          {/* Divergence Bar with Dynamic Polarity & Hover Dimming */}
          <Bar
            dataKey="value"
            radius={[4, 4, 4, 4]}
            isAnimationActive={true}
            animationDuration={600}
            animationEasing="ease-out"
          >
            {chartData.map((entry, index) => {
              const isPositive = entry.value > 0;
              const isDimmed = hoveredIndex !== null && hoveredIndex !== index;
              return (
                <Cell
                  key={`cell-${entry.rawName}-${index}`}
                  fill={isPositive ? "#f43f5e" : "#34d399"}
                  fillOpacity={isDimmed ? 0.4 : 1}
                  onMouseEnter={() => setHoveredIndex(index)}
                  onMouseLeave={() => setHoveredIndex(null)}
                  className="transition-opacity duration-200 cursor-pointer"
                />
              );
            })}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {/* Spatially-Aware Floating UI Tooltip with Framer Motion Layout Transitions */}
      <AnimatePresence>
        {tooltipState.isOpen && (() => {
          const activeFactor = tooltipState.payload?.[0]?.payload as ChartFactorItem | undefined;
          if (!activeFactor) return null;

          const isPositive = activeFactor.value > 0;
          const formattedValue = (isPositive ? "+" : "") + activeFactor.value.toFixed(4);

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
              className="pointer-events-none select-none z-50 bg-slate-900/80 backdrop-blur-xl border border-slate-700/50 shadow-[0_16px_40px_-8px_rgba(0,0,0,0.5)] rounded-2xl p-4 text-slate-50 min-w-56"
            >
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-700/50">
                <span className="text-xs font-medium text-slate-400 uppercase tracking-wider font-mono">
                  SHAP Attribution
                </span>
                <span
                  className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded ${
                    isPositive
                      ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                      : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                  }`}
                >
                  {isPositive ? (
                    <>
                      <TrendingUp className="w-3 h-3" />
                      Risk Increasing
                    </>
                  ) : (
                    <>
                      <TrendingDown className="w-3 h-3" />
                      Risk Suppressing
                    </>
                  )}
                </span>
              </div>

              <p className="text-xs font-semibold text-slate-200 leading-snug">
                {activeFactor.formattedName}
              </p>
              <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                {activeFactor.rawName}
              </p>

              <div className="flex items-baseline justify-between mt-3 pt-2.5 border-t border-slate-700/50">
                <span className="text-xs font-medium text-slate-400">SHAP Score:</span>
                <span className="font-mono font-bold text-lg text-slate-50 tracking-tight">
                  {formattedValue}
                </span>
              </div>
            </motion.div>
          );
        })()}
      </AnimatePresence>
    </div>
  );
};

export const ShapWaterfallChart = memo(ShapWaterfallChartBase, areShapPropsEqual);
export default ShapWaterfallChart;
