"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Command, X } from "lucide-react";

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus input when palette opens
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      // Small timeout to allow framer-motion animation mount
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Escape key listener to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] px-4">
          {/* Backdrop Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
            className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-50"
            aria-hidden="true"
          />

          {/* Modal Panel */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -12 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            onClick={(e) => e.stopPropagation()}
            className="relative z-50 w-full max-w-xl bg-white rounded-2xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.1)] border border-slate-200/60 overflow-hidden"
            role="dialog"
            aria-modal="true"
            aria-label="Command Palette"
          >
            {/* Search Header */}
            <div className="flex items-center px-4 border-b border-slate-100">
              <Search className="h-5 w-5 text-slate-400 shrink-0 ml-1" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search feeders, substations, alerts, or engines..."
                className="h-14 w-full bg-transparent px-3 text-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-0"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="p-1 rounded-md text-slate-400 hover:text-slate-600 transition-colors"
                  aria-label="Clear query"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : (
                <span className="flex items-center text-[10px] font-mono font-medium text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200/60 shrink-0">
                  <Command className="h-2.5 w-2.5 mr-0.5" /> K
                </span>
              )}
            </div>

            {/* Results Area (Placeholder) */}
            <div className="p-2 min-h-[100px] max-h-[400px] overflow-y-auto">
              <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400 mb-3">
                  <Search className="h-5 w-5" />
                </div>
                <p className="text-sm font-medium text-slate-600">
                  Start typing to search feeders, areas, or anomalies...
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  Quick navigation across Engine A, Engine B, Engine C, and Engine D.
                </p>
              </div>
            </div>

            {/* Footer Keyboard Hints */}
            <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-t border-slate-100 text-[11px] text-slate-400">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 rounded bg-white border border-slate-200 font-mono text-[10px] shadow-2xs">ESC</kbd> to close
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 rounded bg-white border border-slate-200 font-mono text-[10px] shadow-2xs">↵</kbd> to select
                </span>
              </div>
              <span className="font-medium text-slate-500">GridSense Command</span>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
