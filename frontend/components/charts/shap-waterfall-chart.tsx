"use client";

import React, { memo, useMemo, useState } from "react";
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

export type FeatureDictionaryResolver =
  | Record<string, string>
  | ((rawFeature: string) => string);

export interface ShapWaterfallChartProps {
  contributing_factors?: ShapFactor[] | null;
  featureDictionary?: FeatureDictionaryResolver; // Phase 5: Dynamic dictionary mapping
  baselineValue?: number; // Phase 5: Model expectation baseline
  positiveColor?: string; // Phase 5: Dynamic polarity coloring
  negativeColor?: string;
  positiveLabel?: string;
  negativeLabel?: string;
  title?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  className?: string;
}

interface ChartFactorItem {
  rawName: string;
  formattedName: string;
  value: number;
}

/**
 * Strict Custom Equality Comparator
 */
export function areShapPropsEqual(
  prevProps: ShapWaterfallChartProps,
  nextProps: ShapWaterfallChartProps
): boolean {
  if (prevProps.baselineValue !== nextProps.baselineValue) return false;
  if (prevProps.positiveColor !== nextProps.positiveColor) return false;
  if (prevProps.negativeColor !== nextProps.negativeColor) return false;
  if (prevProps.positiveLabel !== nextProps.positiveLabel) return false;
  if (prevProps.negativeLabel !== nextProps.negativeLabel) return false;
  if (prevProps.featureDictionary !== nextProps.featureDictionary) return false;
  if (prevProps.className !== nextProps.className) return false;

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
 * Custom Y-Axis Label Renderer
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
 * Native Recharts Custom Tooltip for Abstracted SHAP Waterfall Chart
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function renderShapTooltip(
  props: any,
  options: {
    baselineValue: number;
    positiveColor: string;
    negativeColor: string;
    positiveLabel: string;
    negativeLabel: string;
    title: string;
  }
) {
  const { active, payload } = props;
  if (active && payload && payload.length) {
    const data = payload[0]?.payload as ChartFactorItem | undefined;
    if (!data) return null;

    const isPositive = data.value > options.baselineValue;
    const formattedValue = (isPositive ? "+" : "") + data.value.toFixed(4);

    return (
      <div className="bg-slate-900/90 backdrop-blur-xl border border-slate-700/50 shadow-[0_16px_40px_-8px_rgba(0,0,0,0.5)] rounded-2xl p-4 z-50 text-slate-50 min-w-[200px] select-none pointer-events-none">
        <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-700/50">
          <span className="text-xs font-medium text-slate-400 uppercase tracking-wider font-mono">
            {options.title}
          </span>
          <span
            className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded border"
            style={{
              backgroundColor: isPositive ? `${options.positiveColor}20` : `${options.negativeColor}20`,
              color: isPositive ? options.positiveColor : options.negativeColor,
              borderColor: isPositive ? `${options.positiveColor}40` : `${options.negativeColor}40`,
            }}
          >
            {isPositive ? (
              <>
                <TrendingUp className="w-3 h-3" />
                {options.positiveLabel}
              </>
            ) : (
              <>
                <TrendingDown className="w-3 h-3" />
                {options.negativeLabel}
              </>
            )}
          </span>
        </div>

        <p className="text-xs font-semibold text-slate-200 leading-snug">
          {data.formattedName}
        </p>
        <p className="text-[10px] text-slate-400 font-mono mt-0.5">
          {data.rawName}
        </p>

        <div className="flex items-baseline justify-between mt-3 pt-2.5 border-t border-slate-700/50">
          <span className="text-xs font-medium text-slate-400">Attribution Impact:</span>
          <span className="font-mono font-bold text-lg text-slate-50 tracking-tight">
            {formattedValue}
          </span>
        </div>
      </div>
    );
  }
  return null;
}

/**
 * Phase 5: Decoupled Explainable AI (XAI) Waterfall Chart
 * Supports configurable feature dictionaries, dynamic baseline values, and model-specific polarity coloring.
 */
const ShapWaterfallChartBase: React.FC<ShapWaterfallChartProps> = ({
  contributing_factors,
  featureDictionary,
  baselineValue = 0,
  positiveColor = "#f43f5e",
  negativeColor = "#34d399",
  positiveLabel = "Risk Increasing",
  negativeLabel = "Risk Suppressing",
  title = "Feature Attribution",
  emptyTitle = "No Feature Attribution Factors Available",
  emptyDescription = "Inference payload does not contain factor decompositions for this snapshot.",
  className = "",
}) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  // Dynamic feature name resolution
  const resolveFeatureName = useMemo(() => {
    return (rawName: string): string => {
      if (typeof featureDictionary === "function") {
        return featureDictionary(rawName);
      }
      if (featureDictionary && typeof featureDictionary === "object" && featureDictionary[rawName]) {
        return featureDictionary[rawName];
      }
      return formatShapFeature(rawName);
    };
  }, [featureDictionary]);

  const chartData = useMemo<ChartFactorItem[]>(() => {
    if (!contributing_factors || contributing_factors.length === 0) {
      return [];
    }
    return contributing_factors.map((factor) => ({
      rawName: factor.feature_name,
      formattedName: resolveFeatureName(factor.feature_name),
      value: factor.contribution,
    }));
  }, [contributing_factors, resolveFeatureName]);

  if (chartData.length === 0) {
    return (
      <div
        className={`w-full h-full flex flex-col items-center justify-center p-6 text-center ${className}`}
      >
        <div className="w-10 h-10 rounded-2xl bg-white/60 border border-white/80 shadow-xs flex items-center justify-center text-slate-600 mb-2">
          <Activity className="w-5 h-5" />
        </div>
        <p className="text-xs font-semibold text-slate-800">
          {emptyTitle}
        </p>
        <p className="text-[11px] text-slate-500 max-w-xs mt-1">
          {emptyDescription}
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
          onMouseLeave={() => setHoveredIndex(null)}
        >
          {/* Subtle horizontal grid lines */}
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

          {/* Native Recharts Custom Tooltip with restricted horizontal escape and elevated stacking */}
          <Tooltip
            content={(props) =>
              renderShapTooltip(props, {
                baselineValue,
                positiveColor,
                negativeColor,
                positiveLabel,
                negativeLabel,
                title,
              })
            }
            cursor={{ stroke: "transparent", fill: "transparent" }}
            offset={40}
            allowEscapeViewBox={{ x: false, y: true }}
            wrapperStyle={{ zIndex: 100 }}
          />

          {/* Divergence Bar with Dynamic Polarity & Hover Dimming */}
          <Bar
            dataKey="value"
            radius={[4, 4, 4, 4]}
            isAnimationActive={true}
            animationDuration={600}
            animationEasing="ease-out"
          >
            {chartData.map((entry, index) => {
              const isPositive = entry.value > baselineValue;
              const isDimmed = hoveredIndex !== null && hoveredIndex !== index;
              return (
                <Cell
                  key={`cell-${entry.rawName}-${index}`}
                  fill={isPositive ? positiveColor : negativeColor}
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
    </div>
  );
};

export const ShapWaterfallChart = memo(ShapWaterfallChartBase, areShapPropsEqual);
export default ShapWaterfallChart;
