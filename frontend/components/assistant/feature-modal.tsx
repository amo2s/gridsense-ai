"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Sparkles, X, Layers, Cpu } from "lucide-react";

interface FeatureModalProps {
  isOpen: boolean;
  onClose: () => void;
  featureName?: string;
}

export function FeatureModal({ isOpen, onClose, featureName }: FeatureModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!mounted || !isOpen) {
    return null;
  }

  const modalContent = (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="feature-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      {/* Heavy Backdrop Blur */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/75 backdrop-blur-md transition-opacity animate-fade-in"
      />

      {/* Centered Dialog Box */}
      <div className="relative w-full max-w-md rounded-2xl border border-slate-700/80 bg-slate-900/95 p-6 shadow-2xl backdrop-blur-xl text-white transition-all transform animate-scale-in">
        {/* Ambient Top Emerald Glow */}
        <div className="absolute -top-12 left-1/2 -translate-x-1/2 w-48 h-24 bg-emerald-500/20 blur-3xl pointer-events-none rounded-full" />

        {/* Close Icon Trigger */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close modal"
          className="absolute top-4 right-4 rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Modal Header Icon */}
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 shadow-inner">
            <Sparkles className="h-5 w-5 animate-pulse" />
          </div>
          <div>
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400 uppercase tracking-wider">
              <Cpu className="h-3 w-3" />
              Sovereign Grid Intelligence
            </span>
            <h3
              id="feature-modal-title"
              className="text-lg font-semibold text-white tracking-tight"
            >
              Premium Feature in Development
            </h3>
          </div>
        </div>

        {/* Subtext and Feature Context */}
        <div className="space-y-3 mb-6 text-sm text-slate-300 leading-relaxed">
          {featureName && (
            <div className="inline-flex items-center gap-1.5 rounded-md bg-slate-800/80 px-2.5 py-1 text-xs font-mono text-emerald-300 border border-slate-700">
              <Layers className="h-3 w-3" />
              Target: {featureName}
            </div>
          )}
          <p>
            Voice inputs, multimodal telemetry attachments, and neural audio synthesis
            are scheduled for deployment in the next release cycle.
          </p>
          <p className="text-xs text-slate-400">
            GridSense AI operations remain fully grounded via synchronous vector retrieval
            and deterministic SQL execution.
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white text-xs font-semibold tracking-wide shadow-lg shadow-emerald-900/30 transition-all focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-2 focus:ring-offset-slate-900"
          >
            Acknowledge & Close
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
