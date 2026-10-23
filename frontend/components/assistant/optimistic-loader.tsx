"use client";

import React, { useState, useEffect } from "react";
import { Loader2, Sparkles } from "lucide-react";

const LOADING_STAGES = [
  "Vectorizing Query...",
  "Retrieving Telemetry...",
  "Synthesizing Diagnostic Answer...",
];

export function OptimisticLoader() {
  const [stageIndex, setStageIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setStageIndex((prev) => (prev + 1) % LOADING_STAGES.length);
    }, 3500);

    return () => clearInterval(timer);
  }, []);

  const currentStage = LOADING_STAGES[stageIndex];

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-start gap-3 my-4 animate-fade-in"
    >
      {/* Bot Avatar Icon */}
      <div className="flex h-8 w-8 shrink-0 select-none items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-600 shadow-sm">
        <Sparkles className="h-4 w-4" />
      </div>

      {/* Optimistic Status Box (Liquid Glass Styling) */}
      <div className="flex flex-col gap-2 max-w-md rounded-xl border border-slate-200 bg-white/90 p-4 shadow-sm backdrop-blur-sm">
        <div className="flex items-center gap-2.5">
          <Loader2 className="h-4 w-4 animate-spin text-emerald-600 shrink-0" />
          <span className="text-sm font-medium text-slate-800 transition-opacity duration-300">
            {currentStage}
          </span>
        </div>

        {/* Progress Dots */}
        <div className="flex items-center gap-1.5 pl-6 pt-1">
          {LOADING_STAGES.map((stage, idx) => (
            <div
              key={stage}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                idx === stageIndex
                  ? "w-6 bg-emerald-500"
                  : idx < stageIndex
                  ? "w-2 bg-emerald-200"
                  : "w-2 bg-slate-200"
              }`}
            />
          ))}
        </div>

        <p className="pl-6 text-[11px] text-slate-400">
          Running hybrid pgvector & lexical RRF retrieval across grid models...
        </p>
      </div>
    </div>
  );
}
