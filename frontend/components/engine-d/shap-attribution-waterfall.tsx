"use client";

import React from "react";
import { motion } from "framer-motion";
import { Sparkles, HelpCircle, Activity, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { RankedAsset } from "@/types/engine-d";

interface ShapAttributionWaterfallProps {
  selectedAsset: RankedAsset | null;
}

export default function ShapAttributionWaterfall({ selectedAsset }: ShapAttributionWaterfallProps) {
  if (!selectedAsset) {
    return (
      <div className="w-full h-72 rounded-3xl bg-white/40 border border-white/70 shadow-lg shadow-slate-900/5 backdrop-blur-2xl p-6 flex flex-col items-center justify-center text-center">
        <Sparkles className="w-8 h-8 text-slate-400 mb-2 opacity-60" />
        <p className="text-sm font-semibold text-slate-700">No Asset Selected for XAI Analysis</p>
        <p className="text-xs text-slate-500 mt-1 max-w-xs">
          Select a feeder from the Priority Decision Matrix above to inspect its itemized SHAP marginal feature contributions.
        </p>
      </div>
    );
  }

  const { feeder_id, priority_score, priority_tier, explanations = [], base_value = 0 } = selectedAsset;

  // Calculate sum of contributions + base_value for mathematical verification
  const totalAttributionSum = explanations.reduce((acc, curr) => acc + curr.contribution, 0);
  const maxAbsContribution = Math.max(...explanations.map((e) => Math.abs(e.contribution)), 1);

  return (
    <div className="w-full rounded-3xl bg-white/40 border border-white/70 shadow-lg shadow-slate-900/5 backdrop-blur-2xl p-6 flex flex-col gap-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-white/60">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-emerald-700" />
            <h3 className="text-sm font-semibold text-slate-800">
              SHAP Attribution Waterfall (XAI Explanations)
            </h3>
          </div>
          <p className="text-xs text-slate-500 mt-0.5 font-mono">
            Target Feeder: <span className="font-semibold text-slate-700">{feeder_id}</span> • Priority:{" "}
            <span className="font-bold text-slate-800">{priority_score.toFixed(1)}</span> ({priority_tier})
          </p>
        </div>

        <div className="text-right">
          <span className="text-[11px] font-mono px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
            Neutral Baseline: {base_value.toFixed(2)}
          </span>
        </div>
      </div>

      {/* Feature Attribution List */}
      <div className="flex flex-col gap-3">
        {explanations.map((attr, idx) => {
          const isPositive = attr.contribution >= 0;
          const percentageWidth = Math.min(100, (Math.abs(attr.contribution) / maxAbsContribution) * 100);

          return (
            <div key={attr.feature_name} className="flex flex-col gap-1 text-xs">
              <div className="flex items-center justify-between text-slate-700 font-medium">
                <span className="font-mono text-slate-800 flex items-center gap-1.5">
                  {isPositive ? (
                    <ArrowUpRight className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                  ) : (
                    <ArrowDownRight className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  )}
                  {attr.feature_name.replace(/_/g, " ")}
                </span>
                <span
                  className={`font-mono font-semibold ${
                    isPositive ? "text-rose-600" : "text-emerald-700"
                  }`}
                >
                  {isPositive ? `+${attr.contribution.toFixed(2)}` : attr.contribution.toFixed(2)}
                </span>
              </div>

              {/* Bidirectional Bar Container */}
              <div className="w-full bg-slate-200/50 rounded-full h-2 overflow-hidden flex items-center">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    isPositive ? "bg-rose-500" : "bg-emerald-600"
                  }`}
                  style={{ width: `${Math.max(4, percentageWidth)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Additivity Footer */}
      <div className="pt-3 border-t border-white/60 flex items-center justify-between text-[11px] text-slate-500">
        <span className="flex items-center gap-1">
          <HelpCircle className="w-3.5 h-3.5 text-slate-400" />
          <span>Sum(Attributions) + Baseline ≡ Urgency Score</span>
        </span>
        <span className="font-mono font-semibold text-slate-700">
          {(totalAttributionSum + base_value).toFixed(2)} ≈ {priority_score.toFixed(1)}
        </span>
      </div>
    </div>
  );
}
