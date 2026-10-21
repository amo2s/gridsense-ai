"use client";

import React from "react";
import { motion } from "framer-motion";
import { ShieldAlert, AlertOctagon, AlertTriangle, CheckCircle, ChevronRight, Zap } from "lucide-react";
import { RankedAsset, PriorityTier } from "@/types/engine-d";
import { useEngineDStore } from "@/store/engine-d-store";

interface PriorityMatrixTableProps {
  rankedAssets: RankedAsset[];
  isCriticalAlertActive?: boolean;
  onSelectIntervention?: (asset: RankedAsset) => void;
}

export default function PriorityMatrixTable({
  rankedAssets,
  isCriticalAlertActive = false,
  onSelectIntervention,
}: PriorityMatrixTableProps) {
  const activeFeederId = useEngineDStore((state) => state.activeFeederId);
  const setActiveFeederId = useEngineDStore((state) => state.setActiveFeederId);

  const getTierBadge = (tier: PriorityTier) => {
    switch (tier) {
      case "CRITICAL":
        return {
          icon: AlertOctagon,
          className: "bg-rose-500/15 text-rose-800 border-rose-500/35 shadow-[0_0_12px_rgba(244,63,94,0.18)]",
          label: "CRITICAL",
        };
      case "HIGH":
        return {
          icon: AlertTriangle,
          className: "bg-amber-500/15 text-amber-800 border-amber-500/35",
          label: "HIGH",
        };
      case "MEDIUM":
        return {
          icon: Zap,
          className: "bg-blue-500/15 text-blue-800 border-blue-500/35",
          label: "MEDIUM",
        };
      case "LOW":
      default:
        return {
          icon: CheckCircle,
          className: "bg-slate-500/15 text-slate-700 border-slate-500/30",
          label: "LOW",
        };
    }
  };

  if (!rankedAssets || rankedAssets.length === 0) {
    return (
      <div className="flex h-56 w-full flex-col items-center justify-center rounded-3xl border border-white/60 bg-white/30 backdrop-blur-md p-6 text-center shadow-sm">
        <ShieldAlert className="w-10 h-10 text-slate-400 mb-2 opacity-60" />
        <p className="text-sm font-semibold text-slate-700">No Priority Evaluation Available</p>
        <p className="text-xs text-slate-500 mt-1 max-w-sm">
          Execute listwise prioritization on candidate grid assets from the Command Ingestion portal to populate rankings.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full rounded-3xl bg-white/40 border border-white/70 shadow-lg shadow-slate-900/5 backdrop-blur-2xl overflow-hidden">
      <div className="px-6 py-4 border-b border-white/60 bg-white/40 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">
            Grid Asset Priority Decision Matrix
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Rank-ordered interventions computed via LightGBM LambdaMART ranker
          </p>
        </div>
        <span className="text-[11px] font-mono px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-800 border border-emerald-500/20 font-semibold">
          {rankedAssets.length} Assets Evaluated
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs whitespace-nowrap border-collapse">
          <thead className="bg-white/60 text-slate-600 font-semibold border-b border-white/60">
            <tr>
              <th className="px-5 py-3 text-center w-14">Rank</th>
              <th className="px-5 py-3">Feeder Identifier</th>
              <th className="px-5 py-3">Urgency Score</th>
              <th className="px-5 py-3">Priority Tier</th>
              <th className="px-5 py-3">Baseline Offset</th>
              <th className="px-5 py-3 text-right">Operator Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/40">
            {rankedAssets.map((asset, index) => {
              const isSelected = activeFeederId === asset.feeder_id;
              const isTopCritical = index === 0 && (asset.priority_tier === "CRITICAL" || isCriticalAlertActive);
              const tierBadge = getTierBadge(asset.priority_tier);
              const TierIcon = tierBadge.icon;

              return (
                <motion.tr
                  key={asset.feeder_id}
                  onClick={() => setActiveFeederId(asset.feeder_id)}
                  className={`cursor-pointer transition-all duration-200 ${
                    isTopCritical
                      ? "bg-rose-50/80 hover:bg-rose-100/90 ring-1 ring-rose-500/50 shadow-[0_0_20px_rgba(244,63,94,0.15)] animate-pulse"
                      : isSelected
                      ? "bg-emerald-50/80 hover:bg-emerald-100/80 ring-1 ring-emerald-500/40"
                      : "hover:bg-white/70"
                  }`}
                >
                  {/* Rank Position */}
                  <td className="px-5 py-4 text-center font-bold font-mono">
                    <span
                      className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs ${
                        isTopCritical
                          ? "bg-rose-600 text-white shadow-sm"
                          : index === 0
                          ? "bg-amber-500 text-white"
                          : index === 1
                          ? "bg-slate-300 text-slate-800"
                          : "bg-white/80 text-slate-600 border border-slate-200"
                      }`}
                    >
                      {asset.rank_position}
                    </span>
                  </td>

                  {/* Feeder ID */}
                  <td className="px-5 py-4 font-mono font-medium text-slate-800">
                    <div className="flex items-center gap-2">
                      <span className={isSelected ? "text-emerald-900 font-bold" : ""}>
                        {asset.feeder_id}
                      </span>
                      {isSelected && (
                        <span className="text-[10px] uppercase font-sans font-semibold tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-800">
                          Active Target
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Priority Score */}
                  <td className="px-5 py-4 font-mono font-bold text-slate-800">
                    <div className="flex items-center gap-2">
                      <div className="w-16 bg-slate-200/60 rounded-full h-1.5 overflow-hidden">
                        <div
                          className={`h-full ${
                            asset.priority_score > 75
                              ? "bg-rose-500"
                              : asset.priority_score > 50
                              ? "bg-amber-500"
                              : "bg-emerald-500"
                          }`}
                          style={{ width: `${Math.min(100, Math.max(5, asset.priority_score))}%` }}
                        />
                      </div>
                      <span>{asset.priority_score.toFixed(1)}</span>
                    </div>
                  </td>

                  {/* Priority Tier Badge */}
                  <td className="px-5 py-4">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${tierBadge.className}`}
                    >
                      <TierIcon className="w-3.5 h-3.5 shrink-0" />
                      <span>{tierBadge.label}</span>
                    </span>
                  </td>

                  {/* Base Value */}
                  <td className="px-5 py-4 font-mono text-slate-500">
                    {typeof asset.base_value === "number" ? asset.base_value.toFixed(2) : "—"}
                  </td>

                  {/* Action */}
                  <td className="px-5 py-4 text-right">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveFeederId(asset.feeder_id);
                        if (onSelectIntervention) {
                          onSelectIntervention(asset);
                        }
                      }}
                      className="inline-flex items-center gap-1 px-3 py-1 rounded-xl text-xs font-semibold bg-white/80 hover:bg-emerald-600 hover:text-white text-slate-700 border border-slate-200 transition-all shadow-sm cursor-pointer"
                    >
                      <span>Intervene</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </motion.tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
