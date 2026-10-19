"use client";

import React, { useMemo } from "react";
import isEqual from "fast-deep-equal";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ReferenceLine,
  Cell,
  Tooltip,
  CartesianGrid,
} from "recharts";
import {
  Sparkles,
  HelpCircle,
  ArrowRight,
  ArrowLeft,
  ShieldCheck,
  AlertTriangle,
  Info,
  Sliders,
  Zap,
} from "lucide-react";
/**
 * ============================================================================
 * GENERIC DIVERGENCE PROPERTY INTERFACES (BLUEPRINT STEP 4.1)
 * ============================================================================
 * Strips hardcoded model or engine keys. Exposes a pure, reusable interface
 * ready for Engine C (Anomalies), Engine D (Predictive Maintenance), and beyond.
 */
export interface GenericDivergenceItem {
  label: string;
  contributionValue: number;
  baselineReference?: number;
  isRiskEscalating: boolean;
  unit?: string;
  category?: string;
  description?: string;
  source?: string;
}

export interface GenericDivergenceProps {
  items?: GenericDivergenceItem[];
  title?: string;
  subtitle?: string;
  baselineReference?: number;
  isAnomaly?: boolean;
  confidenceScore?: number;
  assetContext?: string;
  className?: string;

  // Generic backward compatibility for raw feature contributions
  attributions?: Array<{ feature: string; magnitude: number; source?: string }>;
  activeFeederId?: string;
}

// Retain type alias for backwards compatibility
export type SHAPDivergenceWaterfallProps = GenericDivergenceProps;

/**
 * ============================================================================
 * GENERIC DIVERGENCE WATERFALL COMPONENT (STEP 4.1 ABSTRACT VISUALIZER)
 * ============================================================================
 * Pure, generic horizontal divergence visualizer:
 *  - Centered baseline expectation value (x = 0)
 *  - Positive (risk-escalating) contributions extend to the RIGHT in Crimson/Amber
 *  - Negative (risk-suppressing) contributions extend to the LEFT in Emerald
 *  - Liquid Glass aesthetic container
 *  - Memoized via fast-deep-equal
 */
function SHAPDivergenceWaterfallComponent({
  items,
  attributions,
  title,
  subtitle,
  baselineReference = 0,
  isAnomaly = false,
  confidenceScore = 0,
  assetContext = "",
  activeFeederId = "",
  className = "",
}: GenericDivergenceProps) {
  const contextName = assetContext || activeFeederId || "Telemetry Vector";

  // Use generic items if provided, or fallback to generic unformatted attributions
  const waterfallData = useMemo<GenericDivergenceItem[]>(() => {
    if (items && items.length > 0) {
      return [...items].sort(
        (a, b) => Math.abs(b.contributionValue) - Math.abs(a.contributionValue)
      );
    }
    if (attributions && attributions.length > 0) {
      return attributions.map((attr) => ({
        label: attr.feature.replace(/_/g, " "),
        contributionValue: Number(attr.magnitude.toFixed(2)),
        baselineReference: 0,
        isRiskEscalating: attr.magnitude >= 0,
        source: attr.source || "Feature Contribution",
      })).sort((a, b) => Math.abs(b.contributionValue) - Math.abs(a.contributionValue));
    }
    return [];
  }, [items, attributions]);

  // Compute symmetrical domain bounds centered at 0
  const maxAbsValue = useMemo(() => {
    if (waterfallData.length === 0) return 5;
    const maxVal = Math.max(
      ...waterfallData.map((d) => Math.abs(d.contributionValue))
    );
    return Math.max(3, Math.ceil(maxVal * 1.25));
  }, [waterfallData]);

  const positiveCount = waterfallData.filter((d) => d.contributionValue > 0).length;
  const negativeCount = waterfallData.filter((d) => d.contributionValue < 0).length;

  return (
    <div
      className={`w-full bg-white/20 backdrop-blur-2xl bg-gradient-to-br from-white/60 via-white/10 to-white/5 shadow-[inset_1px_1px_2px_rgba(255,255,255,0.8),inset-1px_-1px_3px_rgba(255,255,255,0.1)] shadow-[0_16px_40px_-8px_rgba(15,23,42,0.15)] rounded-3xl border border-white/40 p-6 ${className}`}
    >
      {/* Component Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200/60 mb-5">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="p-2 rounded-xl bg-slate-900 text-white shadow-xs">
              <Sparkles className="w-4 h-4 text-emerald-400" />
            </div>
            <h2 className="text-base sm:text-lg font-bold tracking-tight text-slate-900">
              {title || "Feature Attribution & Contribution Divergence"}
            </h2>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-700 border border-emerald-500/20">
              <Sliders className="w-3 h-3 text-emerald-600" />
              <span>Generic XAI Engine</span>
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl leading-relaxed">
            {subtitle ||
              "Centered baseline divergence highlighting risk-escalating factors (extending right) versus risk-suppressing operational baseline factors (extending left)."}
          </p>
        </div>

        {/* Polarity Summary Pill */}
        <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
          <div className="px-3 py-1.5 rounded-xl bg-white/60 border border-white/80 shadow-2xs flex items-center gap-3 text-xs font-medium">
            <span className="flex items-center gap-1.5 text-rose-700">
              <span className="w-2 h-2 rounded-full bg-rose-500" />
              <span>+{positiveCount} Escalating</span>
            </span>
            <span className="text-slate-300">|</span>
            <span className="flex items-center gap-1.5 text-emerald-700">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span>-{negativeCount} Suppressing</span>
            </span>
          </div>
        </div>
      </div>

      {/* Visual Axis Legend */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-2 px-4 py-2.5 mb-4 rounded-2xl bg-slate-50/70 border border-slate-200/60 text-xs">
        <div className="flex items-center gap-1.5 text-emerald-700 font-semibold">
          <ArrowLeft className="w-3.5 h-3.5 text-emerald-600" />
          <span>&larr; Risk Suppressing (Safety Polarity)</span>
        </div>
        <div className="flex items-center gap-2 font-mono text-[11px] text-slate-500">
          <span className="px-2 py-0.5 rounded-md bg-white border border-slate-200">
            Baseline Expectation: 0.00
          </span>
          <span className="hidden md:inline text-slate-400">
            Target Asset: {contextName}
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-rose-700 font-semibold">
          <span>Risk Escalating (Danger Polarity) &rarr;</span>
          <ArrowRight className="w-3.5 h-3.5 text-rose-600" />
        </div>
      </div>

      {/* Recharts Horizontal Divergence Bar Chart */}
      {waterfallData.length === 0 ? (
        <div className="h-72 flex flex-col items-center justify-center text-center p-8 rounded-2xl bg-emerald-500/5 border border-emerald-500/20 shadow-[inset_0_0_20px_rgba(16,185,129,0.05)] backdrop-blur-md">
          <div className="bg-emerald-500/10 p-4 rounded-full animate-pulse mb-3">
            <ShieldCheck className="h-12 w-12 text-emerald-500" />
          </div>
          <h4 className="text-lg font-semibold text-emerald-700">
            System Nominal: No Divergence Detected
          </h4>
          <p className="text-sm text-emerald-600/80 mt-2 max-w-md">
            Operational telemetry is perfectly aligned with historical baseline envelopes. Zero anomalous feature weights to report.
          </p>
        </div>
      ) : (
        <div className="w-full h-80 sm:h-96">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={waterfallData}
              layout="vertical"
              margin={{ top: 10, right: 30, left: 30, bottom: 20 }}
            >
              <CartesianGrid stroke="rgba(203, 213, 225, 0.3)" strokeDasharray="3 3" />

              {/* Symmetrical X-Axis centered on 0 */}
              <XAxis
                type="number"
                domain={[-maxAbsValue, maxAbsValue]}
                tickLine={false}
                axisLine={false}
                tick={{ fill: "#64748b", fontSize: 12, fontFamily: "monospace" }}
                tickFormatter={(val) => `${val > 0 ? "+" : ""}${val}`}
              />

              {/* Y-Axis: Humanized Feature Names */}
              <YAxis
                type="category"
                dataKey="label"
                width={170}
                tickLine={false}
                axisLine={false}
                tick={{
                  fill: "#64748b",
                  fontSize: 12,
                  fontWeight: 500,
                }}
              />

              {/* Center Zero Baseline Reference Line */}
              <ReferenceLine
                x={0}
                stroke="#0f172a"
                strokeWidth={2}
                strokeDasharray="3 3"
                label={{
                  value: "0 Baseline",
                  position: "top",
                  fill: "#475569",
                  fontSize: 10,
                  fontFamily: "monospace",
                }}
              />

              {/* Liquid Glass Recharts Tooltip */}
              <Tooltip
                contentStyle={{ 
                  backgroundColor: 'rgba(255, 255, 255, 0.4)', 
                  backdropFilter: 'blur(16px)', 
                  borderRadius: '16px', 
                  border: '1px solid rgba(255, 255, 255, 0.5)',
                  boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
                  color: '#334155'
                }}
                itemStyle={{ color: '#0f172a', fontWeight: 500 }}
                cursor={{ fill: 'rgba(16, 185, 129, 0.05)' }}
                allowEscapeViewBox={{ x: false, y: true }}
                offset={20}
                wrapperStyle={{ zIndex: 100 }}
                content={({ active, payload }) => {
                  if (!active || !payload || !payload.length) return null;
                  const item = payload[0].payload as GenericDivergenceItem;
                  const isPositive = item.contributionValue >= 0;

                  return (
                    <div className="rounded-2xl border border-white/50 bg-white/40 backdrop-blur-xl p-3.5 shadow-xl max-w-xs text-xs space-y-2">
                      <div className="flex items-center justify-between gap-2 border-b border-slate-200/50 pb-2">
                        <span className="font-bold text-slate-900 text-xs truncate">
                          {item.label}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full font-mono text-[10px] font-bold ${
                            isPositive
                              ? "bg-rose-500/15 text-rose-700"
                              : "bg-emerald-500/15 text-emerald-700"
                          }`}
                        >
                          {item.category || "Metric"}
                        </span>
                      </div>

                      <div className="flex items-baseline justify-between font-mono">
                        <span className="text-slate-500 text-[11px]">
                          Contribution:
                        </span>
                        <span
                          className={`font-bold text-sm ${
                            isPositive ? "text-rose-600" : "text-emerald-600"
                          }`}
                        >
                          {isPositive ? "+" : ""}
                          {item.contributionValue.toFixed(2)}{" "}
                          <span className="text-[10px] text-slate-400 font-normal">
                            {item.unit || "a.u."}
                          </span>
                        </span>
                      </div>

                      {item.description && (
                        <p className="text-[11px] text-slate-600 leading-relaxed font-sans border-t border-slate-100 pt-1.5">
                          {item.description}
                        </p>
                      )}

                      {item.source && (
                        <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-mono border-t border-slate-100 pt-1">
                          <Zap className="w-3 h-3 text-slate-400" />
                          <span className="truncate">{item.source}</span>
                        </div>
                      )}
                    </div>
                  );
                }}
              />

              {/* Bidirectional Divergence Bar */}
              <Bar dataKey="contributionValue" radius={[4, 4, 4, 4]} maxBarSize={22}>
                {waterfallData.map((entry, index) => {
                  const isPositive = entry.contributionValue >= 0;
                  const barFill = isPositive
                    ? entry.contributionValue > 3.0
                      ? "#e11d48" // Rose-600 (Extreme Risk)
                      : "#d97706" // Amber-600 (Moderate Risk)
                    : "#059669"; // Emerald-600 (Stabilizing Safety)

                  return <Cell key={`cell-${index}`} fill={barFill} />;
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Interpretation Footer */}
      <div className="mt-4 pt-3.5 border-t border-slate-200/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-500">
        <div className="flex items-center gap-1.5">
          <HelpCircle className="w-3.5 h-3.5 text-slate-400" />
          <span>
            Bars extending right indicate factors elevating failure probability above expected baseline.
          </span>
        </div>
        <div className="font-mono text-[11px] text-slate-400">
          Normalized Zero-Sum Expectation: &plusmn;{maxAbsValue}.00 Bounds
        </div>
      </div>
    </div>
  );
}

/**
 * Custom fast-deep-equal equality comparison for GenericDivergenceProps.
 * Prevents unnecessary SVG layout recalculations when TanStack Query polls.
 */
function areGenericDivergencePropsEqual(
  prevProps: GenericDivergenceProps,
  nextProps: GenericDivergenceProps
): boolean {
  if (
    prevProps.isAnomaly !== nextProps.isAnomaly ||
    prevProps.confidenceScore !== nextProps.confidenceScore ||
    prevProps.activeFeederId !== nextProps.activeFeederId ||
    prevProps.assetContext !== nextProps.assetContext ||
    prevProps.title !== nextProps.title
  ) {
    return false;
  }

  // Deep comparison of generic items array
  if (!isEqual(prevProps.items, nextProps.items)) {
    return false;
  }

  // Deep comparison of legacy attributions if used
  if (!isEqual(prevProps.attributions, nextProps.attributions)) {
    return false;
  }

  return true;
}

export const SHAPDivergenceWaterfall = React.memo(
  SHAPDivergenceWaterfallComponent,
  areGenericDivergencePropsEqual
);

export const GenericDivergenceWaterfall = SHAPDivergenceWaterfall;

export default SHAPDivergenceWaterfall;
