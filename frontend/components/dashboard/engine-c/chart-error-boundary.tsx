"use client";

import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertOctagon, RefreshCw, ShieldAlert, Cpu } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface ChartErrorBoundaryProps {
  children: ReactNode;
  fallbackTitle?: string;
  fallbackDescription?: string;
  componentName?: string;
  onReset?: () => void;
  className?: string;
}

interface ChartErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * ============================================================================
 * ENGINE C ISOLATED REACT ERROR BOUNDARY (BLUEPRINT STEP 4.3)
 * ============================================================================
 * React Class Component implementing getDerivedStateFromError and componentDidCatch.
 * Traps SVG mathematical errors, tensor rendering crashes, and calculation exceptions
 * within localized visualization boundaries.
 *
 * Guarantees zero unmounting cascades: if a single Recharts component crashes,
 * adjacent operational tools remain interactive and live while rendering a clinical
 * Liquid Glass containment fallback.
 */
export class ChartErrorBoundary extends Component<
  ChartErrorBoundaryProps,
  ChartErrorBoundaryState
> {
  public state: ChartErrorBoundaryState = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): Partial<ChartErrorBoundaryState> {
    // Update state so the next render will show the fallback UI
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log exception for telemetry and debugging
    console.error(
      `[ChartErrorBoundary] Trapped isolated rendering exception in ${
        this.props.componentName || "Engine C Visualization"
      }:`,
      error,
      errorInfo
    );
    this.setState({ errorInfo });
  }

  public handleReset = () => {
    this.props.onReset?.();
    this.setState({ hasError: false, error: null, errorInfo: null });
    // Also directly update state to support non-DOM test environments
    this.state = { hasError: false, error: null, errorInfo: null };
  };

  public render() {
    if (this.state.hasError) {
      const title =
        this.props.fallbackTitle ||
        `ENGINE C VISUALIZATION FAULT CONTAINED: ${
          this.props.componentName ? this.props.componentName.toUpperCase() : "MODULE"
        }`;

      const description =
        this.props.fallbackDescription ||
        "A localized mathematical or SVG calculation exception occurred while rendering this telemetry module. The error boundary trapped the fault locally. Upstream anomaly inference and adjacent visualization modules remain fully interactive and live.";

      return (
        <div
          data-testid="chart-error-boundary-fallback"
          className={`w-full min-h-[260px] flex flex-col items-center justify-center p-6 text-center rounded-3xl border border-rose-500/35 bg-white/30 backdrop-blur-2xl bg-gradient-to-br from-rose-500/15 via-white/50 to-amber-500/10 shadow-[inset_1px_1px_2px_rgba(255,255,255,0.9),inset_-1px_-1px_3px_rgba(255,255,255,0.1)] shadow-[0_16px_40px_-8px_rgba(225,29,72,0.15)] ${
            this.props.className || ""
          }`}
        >
          {/* Containment Badge */}
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-700 text-xs font-semibold uppercase tracking-wider mb-3">
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>Isolated Fault Containment</span>
          </div>

          <div className="p-3 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-600 mb-3 shadow-xs">
            <AlertOctagon className="w-6 h-6 animate-pulse" />
          </div>

          <h3 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight mb-1.5">
            {title}
          </h3>

          <p className="text-xs text-slate-600 max-w-lg mb-4 leading-relaxed font-medium">
            {description}
          </p>

          {/* Clinical Diagnostic Trace */}
          {this.state.error && (
            <div className="max-w-xl w-full mb-4 p-3 rounded-xl bg-slate-950/90 border border-slate-800 text-[11px] font-mono text-rose-300 text-left overflow-x-auto select-all shadow-inner">
              <div className="flex items-center justify-between text-slate-400 border-b border-slate-800 pb-1 mb-1.5 font-sans font-semibold text-[10px] uppercase">
                <span className="flex items-center gap-1.5">
                  <Cpu className="w-3 h-3 text-rose-400" />
                  Trap Diagnostic
                </span>
                <span className="text-amber-400">Adjacent Panels: Live</span>
              </div>
              <div>
                <span className="text-slate-500 select-none mr-2">Exception:</span>
                {this.state.error.message || String(this.state.error)}
              </div>
            </div>
          )}

          {/* Recovery Action */}
          <Button
            onClick={this.handleReset}
            size="sm"
            variant="outline"
            className="rounded-xl font-semibold text-xs text-slate-800 bg-white/80 hover:bg-white border-slate-300/80 shadow-xs cursor-pointer inline-flex items-center gap-2"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Re-initialize Component</span>
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ChartErrorBoundary;
