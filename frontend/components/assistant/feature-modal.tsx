"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

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
      {/* Light Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm transition-opacity animate-fade-in"
      />

      {/* Centered Dialog Box */}
      <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl text-slate-900 transition-all transform animate-scale-in">
        {/* Close Icon Trigger */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close modal"
          className="absolute top-4 right-4 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Simplified Content */}
        <div className="py-6 text-center">
          <h3 id="feature-modal-title" className="text-lg font-semibold text-slate-800">
            This feature is coming soon
          </h3>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white text-xs font-semibold tracking-wide shadow-md transition-all focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-2 focus:ring-offset-white"
          >
            Acknowledge & Close
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
