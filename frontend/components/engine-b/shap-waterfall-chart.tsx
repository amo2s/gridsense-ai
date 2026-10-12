"use client";

import React, { memo, useMemo } from "react";
import { motion } from "framer-motion";
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

/**
 * Custom Liquid Glass Tooltip Component (Step 5)
 * Matches the platform's specular glass aesthetic with high-contrast text and polarity cues.
 */
interface TooltipPayloadItem {
  payload: ChartFactorItem;
  value: number;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadItem[];
}

function CustomShapTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload || !payload.length) {
    return null;
  }

  const data = payload[0].payload;
  const value = data.value;
  const isPositive = value > 0;
  const formattedValue = (isPositive ? "+" : "") + value.toFixed(4);

  return (
    <div className="bg-black/60 backdrop-blur-xl border border-white/10 shadow-2xl rounded-xl p-3 text-white min-w-52 select-none pointer-events-none">
      <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-white/10">
        <span className="text-[10px] uppercase font-bold tracking-wider text-slate-300 font-mono">
          SHAP ATTRIBUTION
        </span>
        <span
          className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded ${
            isPositive
              ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
              : "bg-emerald-400/20 text-emerald-300 border border-emerald-400/30"
          }`}
        >
          {isPositive ? (
            <>
              <TrendingUp className="w-2.5 h-2.5" />
              Risk Increasing
            </>
          ) : (
            <>
              <TrendingDown className="w-2.5 h-2.5" />
              Risk Suppressing
            </>
          )}
        </span>
      </div>

      <p className="text-xs font-semibold text-white/95 leading-snug">
        {data.formattedName}
      </p>
      <p className="text-[10px] text-slate-400 font-mono mt-0.5">
        {data.rawName}
      </p>

      <div className="flex items-baseline justify-between mt-2 pt-2 border-t border-white/5">
        <span className="text-[11px] text-slate-300">Feature Impact:</span>
        <span
          className={`font-mono text-sm font-bold tracking-tight ${
            isPositive ? "text-rose-500" : "text-emerald-400"
          }`}
        >
          {formattedValue}
        </span>
      </div>
    </div>
  );
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function renderYAxisTick(props: any) {
  const { x = 0, y = 0, payload } = props;
  const text = String(payload?.value || "");
  const truncated = text.length > 22 ? `${text.slice(0, 20)}…` : text;

  return (
    <g transform={`translate(${x},${y})`}>
      <text
        x={-8}
        y={4}
        textAnchor="end"
        fill="#64748b"
        fontSize={11}
        fontWeight={500}
        className="font-sans select-none"
      >
        <title>{text}</title>
        {truncated}
      </text>
    </g>
  );
}

/**
 * Phase 3: Explainable AI (XAI) Mathematical Waterfall Chart
 */
const ShapWaterfallChartBase: React.FC<ShapWaterfallChartProps> = ({
  contributing_factors,
  className = "",
}) => {
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
        <div className="w-10 h-10 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 mb-2">
          <Activity className="w-5 h-5" />
        </div>
        <p className="text-xs font-semibold text-slate-700">
          No Feature Attribution Factors Available
        </p>
        <p className="text-[11px] text-slate-400 max-w-xs mt-1">
          Inference payload does not contain TreeSHAP factor decompositions for this snapshot.
        </p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97, filter: "blur(4px)" }}
      animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
      transition={{
        type: "spring",
        stiffness: 300,
        damping: 24,
        mass: 0.8,
      }}
      className={`w-full h-full relative ${className}`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          layout="vertical"
          data={chartData}
          margin={{ top: 10, right: 24, left: 10, bottom: 10 }}
        >
          {/* Noisy grid lines completely stripped */}
          <CartesianGrid vertical={false} horizontal={false} />

          {/* Minimalist X-Axis hidden */}
          <XAxis type="number" hide domain={["auto", "auto"]} />

          {/* Humanized & Truncated Y-Axis */}
          <YAxis
            dataKey="formattedName"
            type="category"
            tickLine={false}
            axisLine={false}
            tick={renderYAxisTick}
            width={150}
          />

          {/* Liquid Glass Tooltip */}
          <Tooltip
            content={<CustomShapTooltip />}
            cursor={{ fill: "rgba(15, 23, 42, 0.04)" }}
          />

          {/* Divergence Bar with Dynamic Polarity Cell Fills */}
          <Bar
            dataKey="value"
            radius={[4, 4, 4, 4]}
            isAnimationActive={true}
            animationDuration={600}
            animationEasing="ease-out"
          >
            {chartData.map((entry, index) => {
              const isPositive = entry.value > 0;
              return (
                <Cell
                  key={`cell-${entry.rawName}-${index}`}
                  fill={isPositive ? "#f43f5e" : "#34d399"}
                />
              );
            })}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </motion.div>
  );
};

export const ShapWaterfallChart = memo(ShapWaterfallChartBase, areShapPropsEqual);
export default ShapWaterfallChart;
