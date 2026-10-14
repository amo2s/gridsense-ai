"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  AlertOctagon, 
  RefreshCw, 
  X, 
  HelpCircle, 
  ShieldAlert, 
  Cpu, 
  FileWarning, 
  ArrowRight
} from "lucide-react";
import { ParsedRejection } from "@/hooks/use-engine-c-fsm";

interface RejectionInspectorPanelProps {
  rejection: ParsedRejection;
  onRetry: () => void;
  onDismiss: () => void;
  isRetrying?: boolean;
}

/**
 * ============================================================================
 * REJECTION INSPECTOR PANEL (PHASE 1, STEP 1.4)
 * ============================================================================
 * Dedicated Liquid Glass diagnostic space mapping upstream Pydantic v2
 * HTTP 400 and 422 boundary rejections to human-readable operator actions.
 * Enforces strict color polarity (Rose/Crimson semantic tokens) in light mode.
 */
export default function RejectionInspectorPanel({
  rejection,
  onRetry,
  onDismiss,
  isRetrying = false,
}: RejectionInspectorPanelProps) {
  const is422 = rejection.statusCode === 422;

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
                  Upstream Boundary Rejection
                </h3>
                {/* Status Code Badge */}
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold tracking-wider uppercase bg-rose-500/15 text-rose-800 border border-rose-500/35">
                  HTTP {rejection.statusCode} {rejection.statusText}
                </span>
              </div>
              <p className="text-xs text-rose-800/80 mt-0.5">
                Python Pydantic v2 Ingress Firewall Intercepted Malformed Telemetry
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
            <span className="col-span-5">Pydantic Rule Violation</span>
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
                  {issue.ruleCode && (
                    <span className="text-[10px] text-slate-400 font-mono">
                      Type: {issue.ruleCode}
                    </span>
                  )}
                </div>

                {/* Received Input */}
                <div className="col-span-3 text-right font-mono text-[11px] text-rose-800 font-semibold truncate">
                  {issue.receivedValue !== undefined ? (
                    typeof issue.receivedValue === "object" ? (
                      JSON.stringify(issue.receivedValue)
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
            <span className="font-semibold text-slate-800">Operator Remediation Action: </span>
            {is422 ? (
              <span>
                Inspect the highlighted matrix rows indicated above. Ensure all voltage readings remain strictly between 
                <span className="font-mono font-semibold text-slate-700"> 0.0V and 500.0V</span>, load and frequency are non-negative, and timestamps form an uninterrupted ascending chronological timeline without future leakage.
              </span>
            ) : (
              <span>
                Verify that the feeder context identifier and authorization token match the boundary contract enforced by the Go API Gateway.
              </span>
            )}
          </div>
        </div>

        {/* Action Controls & Idempotent Retry */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
          <div className="flex items-center gap-2 text-xs text-slate-500 font-mono">
            <Cpu className="w-3.5 h-3.5 text-slate-400" />
            <span>Target: FastAPI (Engine C Anomaly Service)</span>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onDismiss}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-900 bg-white/70 hover:bg-white border border-white/90 shadow-2xs transition-all cursor-pointer"
            >
              Dismiss
            </button>

            {/* Idempotent Retry Button */}
            <button
              type="button"
              onClick={onRetry}
              disabled={isRetrying}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-semibold uppercase tracking-wider text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 shadow-md hover:shadow-lg transition-all duration-200 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRetrying ? "animate-spin" : ""}`} />
              <span>Retry Transmission (Idempotent)</span>
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
