"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertOctagon, CheckCircle2, Clock, XCircle, X, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { RankedAsset, InterventionAction } from "@/types/engine-d";
import { Button } from "@/components/ui/button";

interface InterventionActionDialogProps {
  asset: RankedAsset | null;
  isOpen: boolean;
  onClose: () => void;
  onActionComplete?: (action: InterventionAction, feederId: string) => void;
}

export default function InterventionActionDialog({
  asset,
  isOpen,
  onClose,
  onActionComplete,
}: InterventionActionDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notes, setNotes] = useState("");

  if (!isOpen || !asset) return null;

  const handleAction = async (action: InterventionAction) => {
    setIsSubmitting(true);
    try {
      // Ingest operator intervention telemetry for RL loop feedback
      const payload = {
        feeder_id: asset.feeder_id,
        intervention_id: asset.intervention_id,
        action_taken: action,
        notes: notes.trim(),
        timestamp: new Date().toISOString(),
      };

      // Best effort log to gateway
      await fetch("/api/proxy/v1/alerts/intervention", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).catch((e) => console.warn("Intervention logging non-blocking error:", e));

      toast.success(
        `Intervention '${action.toUpperCase()}' recorded for feeder ${asset.feeder_id}. Reinforcement loop updated.`
      );

      if (onActionComplete) {
        onActionComplete(action, asset.feeder_id);
      }
      onClose();
    } catch (err: any) {
      toast.error(`Failed to record action: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0"
        />

        {/* Modal Box */}
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 10 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 10 }}
          className="relative w-full max-w-lg rounded-3xl bg-white/90 border border-white/80 shadow-2xl backdrop-blur-2xl p-6 flex flex-col gap-5 overflow-hidden z-10"
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-4 pb-3 border-b border-slate-200/60">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-600 shrink-0">
                <AlertOctagon className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  Execute Grid Intervention
                </h3>
                <p className="text-xs text-slate-500 font-mono mt-0.5">
                  Feeder: <span className="font-semibold text-slate-700">{asset.feeder_id}</span> • Rank #{asset.rank_position}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Asset Summary Details */}
          <div className="grid grid-cols-2 gap-3 p-3.5 rounded-2xl bg-slate-50/80 border border-slate-200/60 text-xs">
            <div>
              <span className="text-slate-500 block text-[11px]">Priority Score</span>
              <span className="font-bold text-slate-800 text-sm font-mono">
                {asset.priority_score.toFixed(1)} / 100
              </span>
            </div>
            <div>
              <span className="text-slate-500 block text-[11px]">Priority Tier</span>
              <span className="font-semibold text-rose-700 uppercase tracking-wide">
                {asset.priority_tier}
              </span>
            </div>
          </div>

          {/* Notes Input */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="intervention-notes" className="text-xs font-semibold text-slate-700">
              Operator Log / Dispatch Notes (Optional)
            </label>
            <textarea
              id="intervention-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Field crew dispatched to inspect potential insulator breakdown at pole 42..."
              className="w-full rounded-xl bg-white border border-slate-200 p-2.5 text-xs text-slate-800 focus:ring-2 focus:ring-emerald-500/50 focus:outline-none"
            />
          </div>

          {/* Action Decision Buttons */}
          <div className="grid grid-cols-3 gap-2.5 pt-2">
            <Button
              type="button"
              variant="default"
              disabled={isSubmitting}
              onClick={() => handleAction("dispatched")}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs flex flex-col items-center py-3 h-auto"
            >
              <CheckCircle2 className="w-4 h-4 mb-1" />
              <span>Dispatched</span>
            </Button>

            <Button
              type="button"
              variant="secondary"
              disabled={isSubmitting}
              onClick={() => handleAction("deferred")}
              className="bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 font-medium text-xs flex flex-col items-center py-3 h-auto"
            >
              <Clock className="w-4 h-4 mb-1 text-amber-700" />
              <span>Deferred</span>
            </Button>

            <Button
              type="button"
              variant="outline"
              disabled={isSubmitting}
              onClick={() => handleAction("ignored")}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 font-medium text-xs flex flex-col items-center py-3 h-auto"
            >
              <XCircle className="w-4 h-4 mb-1 text-slate-500" />
              <span>Ignored</span>
            </Button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
