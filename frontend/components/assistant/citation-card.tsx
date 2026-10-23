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
          badgeStyle: "bg-indigo-50 text-indigo-700 border-indigo-200/80",
          icon: Layers,
        };
      case "risk_predictions":
        return {
          label: "Engine B Grounded",
          badgeStyle: "bg-amber-50 text-amber-700 border-amber-200/80",
          icon: Zap,
        };
      case "intervention_outcomes":
        return {
          label: "Engine D Grounded",
          badgeStyle: "bg-emerald-50 text-emerald-700 border-emerald-200/80",
          icon: ShieldAlert,
        };
      default:
        return {
          label: "Telemetry Grounded",
          badgeStyle: "bg-slate-100 text-slate-700 border-slate-200",
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
      className="group relative flex flex-col justify-between rounded-lg border border-slate-200/90 bg-white/95 p-3.5 shadow-sm backdrop-blur-sm transition-all duration-200 hover:border-slate-300 hover:shadow focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
    >
      {/* Top Header: Engine Badge & Table Name */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold border ${badgeConfig.badgeStyle}`}
        >
          <BadgeIcon className="h-3.5 w-3.5 shrink-0" />
          {badgeConfig.label}
        </span>
        <span className="font-mono text-[11px] text-slate-400 uppercase tracking-wider">
          {citation.source_table}
        </span>
      </div>

      {/* Snippet Content */}
      <p className="text-sm leading-relaxed text-slate-700 mb-3">
        {citation.metric_snippet}
      </p>

      {/* Footer: Monospace Record ID and Copy Action */}
      <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
        <div className="flex items-center gap-1.5 overflow-hidden">
          <span className="text-[11px] text-slate-400 font-medium shrink-0">ID:</span>
          <span
            className="font-mono text-[11px] text-slate-500 truncate select-all"
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
          className="ml-2 inline-flex items-center justify-center rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors focus:outline-none focus:ring-1 focus:ring-emerald-500"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-emerald-600" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
    </div>
  );
}
