"use client";

import { useState, useMemo, useEffect, useRef } from "react";

export type TelemetryRenderMode = "auto" | "svg" | "canvas";

export interface TelemetryRenderModeConfig {
  /** Point count threshold above which Canvas rendering is forced to prevent DOM inflation */
  threshold?: number;
  /** Initial mode override */
  initialMode?: TelemetryRenderMode;
}

export interface TelemetryRenderModeResult {
  /** Active effective rendering pipeline: "canvas" or "svg" */
  renderMode: "canvas" | "svg";
  /** User or algorithmic mode configuration */
  mode: TelemetryRenderMode;
  /** Whether the active render pipeline is native HTML5 Canvas */
  isCanvas: boolean;
  /** Whether the pipeline was dynamically selected by the density threshold algorithm */
  isFallbackActive: boolean;
  /** Data point count evaluated */
  dataCount: number;
  /** Threshold for canvas escalation */
  threshold: number;
  /** Current measured render FPS */
  fps: number;
  /** Manual toggle action */
  setMode: (mode: TelemetryRenderMode) => void;
}

const DEFAULT_DENSITY_THRESHOLD = 96; // Over 96 points (e.g. 15-min or sub-hourly tensor stream) escalates to Canvas

/**
 * ============================================================================
 * TELEMETRY RENDER MODE CUSTOM HOOK (BLUEPRINT STEP 3.2)
 * ============================================================================
 * Evaluates telemetry tensor point density to dynamically switch between
 * Recharts SVG rendering (for low density) and hardware-accelerated HTML5
 * Canvas rendering (for high density) to maintain a strict 60 FPS budget.
 */
export function useTelemetryRenderMode(
  dataCount: number,
  config?: TelemetryRenderModeConfig
): TelemetryRenderModeResult {
  const threshold = config?.threshold ?? DEFAULT_DENSITY_THRESHOLD;
  const [mode, setMode] = useState<TelemetryRenderMode>(config?.initialMode ?? "auto");
  const [fps, setFps] = useState<number>(60);
  const frameCountRef = useRef(0);
  const lastTimeRef = useRef(performance.now());

  // Dynamic pipeline arbitration
  const isFallbackActive = useMemo(() => {
    return dataCount > threshold;
  }, [dataCount, threshold]);

  const renderMode = useMemo<"canvas" | "svg">(() => {
    if (mode === "canvas") return "canvas";
    if (mode === "svg") return "svg";
    return isFallbackActive ? "canvas" : "svg";
  }, [mode, isFallbackActive]);

  // Real-time frame loop measurement for Canvas 60 FPS verification
  useEffect(() => {
    let animId: number;
    const loop = (now: number) => {
      frameCountRef.current++;
      const elapsed = now - lastTimeRef.current;
      if (elapsed >= 1000) {
        setFps(Math.round((frameCountRef.current * 1000) / elapsed));
        frameCountRef.current = 0;
        lastTimeRef.current = now;
      }
      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, []);

  return {
    renderMode,
    mode,
    isCanvas: renderMode === "canvas",
    isFallbackActive,
    dataCount,
    threshold,
    fps,
    setMode,
  };
}
