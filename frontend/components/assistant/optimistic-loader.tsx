"use client";

import React, { useState, useEffect } from "react";
import Image from "next/image";
import { Cpu } from "lucide-react";

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
      {/* Brand Logo Avatar Container */}
      <div className="flex h-9 w-9 shrink-0 select-none items-center justify-center rounded-full bg-white/10 p-1 border border-white/15 shadow-md backdrop-blur-md">
        <Image
          src="/gridsense-logo.png"
          alt="GridSense AI"
          width={28}
          height={28}
          className="rounded-full object-contain"
        />
      </div>

      {/* Temporary AI Message Bubble */}
      <div className="flex flex-col items-start max-w-[85%] md:max-w-[70%]">
        <div className="rounded-2xl rounded-tl-sm bg-gradient-to-br from-emerald-600 via-emerald-600 to-emerald-700 p-4 text-white shadow-lg shadow-emerald-950/20 border border-emerald-500/30 backdrop-blur-sm">
          {/* Animated 3-Dot Wave Typing Indicator */}
          <div className="flex items-center gap-1.5 py-1 mb-2.5">
            <span className="h-2.5 w-2.5 rounded-full bg-white/90 animate-bounce [animation-delay:-0.3s]" />
            <span className="h-2.5 w-2.5 rounded-full bg-white/90 animate-bounce [animation-delay:-0.15s]" />
            <span className="h-2.5 w-2.5 rounded-full bg-white/90 animate-bounce" />
          </div>

          {/* Smooth Rotating Diagnostic String */}
          <div className="flex items-center gap-2 pt-1 border-t border-emerald-500/40 text-xs text-emerald-100 font-medium">
            <Cpu className="h-3.5 w-3.5 animate-spin text-emerald-200 shrink-0" />
            <span className="animate-fade-in transition-all duration-300">
              {currentStage}
            </span>
          </div>
        </div>

        {/* Progress Tracker Pill */}
        <div className="flex items-center gap-1.5 mt-1.5 pl-2">
          {LOADING_STAGES.map((stage, idx) => (
            <div
              key={stage}
              className={`h-1 rounded-full transition-all duration-300 ${
                idx === stageIndex
                  ? "w-5 bg-emerald-400"
                  : idx < stageIndex
                  ? "w-2 bg-emerald-600/50"
                  : "w-2 bg-slate-700"
              }`}
            />
          ))}
          <span className="text-[10px] text-slate-400 font-mono ml-1">
            Hybrid RAG In-Progress
          </span>
        </div>
      </div>
    </div>
  );
}
