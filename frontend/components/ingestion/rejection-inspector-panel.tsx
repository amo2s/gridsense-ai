"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  AlertOctagon, 
  RefreshCw, 
  X, 
  HelpCircle, 
  FileWarning
} from "lucide-react";
import { ParsedRejection } from "@/hooks/use-engine-c-fsm";
import { Button } from "@/components/ui/button";

interface RejectionInspectorPanelProps {
  rejection: ParsedRejection;
  onRetry: () => void;
  onDismiss: () => void;
  isRetrying?: boolean;
}

export default function RejectionInspectorPanel({
  rejection,
  onRetry,
  onDismiss,
  isRetrying = false,
}: RejectionInspectorPanelProps) {
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -12, scale: 0.99 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -8, scale: 0.99 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="rounded-3xl border border-rose-500/35 bg-white/30 backdrop-blur-2xl bg-gradient-to-br from-white/75 via-rose-50/25 to-white/10 p-6 shadow-[inset_1px_1px_2px_rgba(255,255,255,0.9),inset_-1px_-1px_3px_rgba(255,255,255,0.1)] shadow-[0_20px_50px_-12px_rgba(244,63,94,0.18)] flex flex-col gap-5 overflow-hidden"
      >
        {/* Panel Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-rose-200/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-600 shadow-xs">
              <AlertOctagon className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold tracking-tight text-rose-950">
                  Telemetry Validation Trapped
                </h3>
                {/* Status Code Badge */}
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold tracking-wider uppercase bg-rose-500/15 text-rose-800 border border-rose-500/35">
                  HTTP {rejection.statusCode}
                </span>
              </div>
              <p className="text-xs text-rose-800/80 mt-0.5">
                Telemetry boundary validation intercepted non-compliant operational values.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <span className="px-2.5 py-1 rounded-xl bg-white/70 border border-white/90 text-[11px] font-mono font-semibold text-rose-700 shadow-2xs">
              {rejection.errorCount} {rejection.errorCount === 1 ? "Violation" : "Violations"} Trapped
            </span>
            <button
              type="button"
              onClick={onDismiss}
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-white/80 transition-colors cursor-pointer"
              aria-label="Dismiss inspector panel"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Detailed Issue Breakdown Table */}
        <div className="rounded-2xl border border-rose-200/60 bg-white/50 backdrop-blur-md overflow-hidden shadow-xs">
          <div className="grid grid-cols-12 gap-2 px-4 py-2.5 bg-rose-50/60 text-[11px] font-bold text-rose-900/80 uppercase tracking-wider border-b border-rose-200/50">
            <span className="col-span-2">Location</span>
            <span className="col-span-2">Feature</span>
            <span className="col-span-5">Validation Rule Violation</span>
            <span className="col-span-3 text-right">Received Input</span>
          </div>

          <div className="divide-y divide-rose-100/60 max-h-56 overflow-y-auto">
            {rejection.issues.map((issue, idx) => (
              <div
                key={idx}
                className="grid grid-cols-12 gap-2 px-4 py-2.5 items-center text-xs hover:bg-rose-50/30 transition-colors"
              >
                {/* Location */}
                <div className="col-span-2 flex items-center gap-1.5 font-mono text-[11px]">
                  <FileWarning className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                  <span className="font-semibold text-slate-800">
                    {issue.rowIndex !== null ? `Step ${issue.rowIndex + 1}` : "Root"}
                  </span>
                </div>

                {/* Feature */}
                <div className="col-span-2">
                  <span className="px-2 py-0.5 rounded-md text-[11px] font-mono font-semibold bg-rose-500/10 text-rose-700 border border-rose-500/20">
                    {issue.feature}
                  </span>
                </div>

                {/* Violation Message */}
                <div className="col-span-5 text-slate-700 font-medium leading-relaxed pr-2">
                  <p>{issue.message}</p>
                </div>

                {/* Received Input */}
                <div className="col-span-3 text-right font-mono text-[11px] text-rose-800 font-semibold truncate">
                  {issue.receivedValue !== undefined ? (
                    typeof issue.receivedValue === "object" && issue.receivedValue !== null ? (
                      Array.isArray(issue.receivedValue)
                        ? `[${issue.receivedValue.length} items]`
                        : Object.keys(issue.receivedValue).join(", ") || "Object"
                    ) : (
                      String(issue.receivedValue)
                    )
                  ) : (
                    <span className="text-slate-400 italic">None</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Operator Diagnostic Remediation Guide */}
        <div className="p-4 rounded-2xl bg-white/60 border border-white/80 shadow-2xs flex items-start gap-3">
          <HelpCircle className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />
          <div className="text-xs text-slate-600 leading-relaxed">
            <span className="font-semibold text-slate-800">Operator Remediation: </span>
            <span>
              Please review and adjust the highlighted telemetry values above to ensure all voltage, load, and timestamp inputs fall within valid operational boundaries.
            </span>
          </div>
        </div>

        {/* Action Controls & Retry */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-end gap-3 pt-2">
          <div className="flex items-center gap-2.5">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onDismiss}
            >
              Dismiss
            </Button>

            <Button
              type="button"
              size="sm"
              variant="danger"
              onClick={onRetry}
              disabled={isRetrying}
              isLoading={isRetrying}
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry Transmission</span>
            </Button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
