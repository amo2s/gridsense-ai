"use client";

import React, { useState } from "react";
import { Citation } from "@/store/assistant-store";
import { Check, Copy, Database, Layers, ShieldAlert, Zap } from "lucide-react";

interface CitationCardProps {
  citation: Citation;
  index: number;
}

export function CitationCard({ citation, index }: CitationCardProps) {
  const [copied, setCopied] = useState(false);

  const handleCopyRecordId = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(citation.record_id);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore clipboard write failures in restricted contexts
    }
  };

  // Resolve dynamic infrastructure badge based on source_table
  const resolveBadgeConfig = (sourceTable: string) => {
    switch (sourceTable?.toLowerCase()) {
      case "anomalies":
        return {
          label: "Engine C Grounded",
          badgeStyle: "bg-indigo-950/80 text-indigo-300 border-indigo-700/60",
          icon: Layers,
        };
      case "risk_predictions":
        return {
          label: "Engine B Grounded",
          badgeStyle: "bg-amber-950/80 text-amber-300 border-amber-700/60",
          icon: Zap,
        };
      case "intervention_outcomes":
        return {
          label: "Engine D Grounded",
          badgeStyle: "bg-teal-950/80 text-teal-300 border-teal-700/60",
          icon: ShieldAlert,
        };
      default:
        return {
          label: "Telemetry Grounded",
          badgeStyle: "bg-slate-800 text-slate-300 border-slate-700",
          icon: Database,
        };
    }
  };

  const badgeConfig = resolveBadgeConfig(citation.source_table);
  const BadgeIcon = badgeConfig.icon;

  return (
    <div
      tabIndex={0}
      aria-label={`Citation ${index + 1}: ${badgeConfig.label} from ${citation.source_table}`}
      className="group relative flex flex-col justify-between rounded-xl border border-white/15 bg-black/25 p-3.5 shadow-md backdrop-blur-md transition-all duration-200 hover:border-white/30 hover:bg-black/35 focus:outline-none focus:ring-2 focus:ring-white/40"
    >
      {/* Top Header: Engine Badge & Table Name */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold border ${badgeConfig.badgeStyle}`}
        >
          <BadgeIcon className="h-3 w-3 shrink-0" />
          {badgeConfig.label}
        </span>
        <span className="font-mono text-[10px] text-emerald-200/70 uppercase tracking-wider">
          {citation.source_table}
        </span>
      </div>

      {/* Snippet Content */}
      <p className="text-xs leading-relaxed text-slate-100 mb-3 font-normal">
        {citation.metric_snippet}
      </p>

      {/* Footer: Monospace Record ID and Copy Action */}
      <div className="flex items-center justify-between pt-2 border-t border-white/10 text-xs">
        <div className="flex items-center gap-1.5 overflow-hidden">
          <span className="text-[10px] text-emerald-300/80 font-medium shrink-0">REC ID:</span>
          <span
            className="font-mono text-[10px] text-emerald-100/90 truncate select-all"
            title={citation.record_id}
          >
            {citation.record_id}
          </span>
        </div>

        <button
          type="button"
          onClick={handleCopyRecordId}
          aria-label="Copy record ID"
          title="Copy record UUID"
          className="ml-2 inline-flex items-center justify-center rounded p-1 text-emerald-200/80 hover:bg-white/15 hover:text-white transition-colors focus:outline-none focus:ring-1 focus:ring-white"
        >
          {copied ? (
            <Check className="h-3 w-3 text-emerald-300" />
          ) : (
            <Copy className="h-3 w-3" />
          )}
        </button>
      </div>
    </div>
  );
}
