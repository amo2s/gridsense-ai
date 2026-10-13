"use client";

import React from "react";
import { AlertOctagon, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface ChartErrorFallbackProps {
  error?: Error | null;
  resetErrorBoundary?: () => void;
  title?: string;
  description?: string;
  className?: string;
}

/**
 * Phase 5: Liquid Glass Chart Error Fallback UI
 * Renders an isolated specular container tinted with critical failure optics,
 * preventing rendering exceptions in single visualization modules from unmounting the dashboard.
 */
export const ChartErrorFallback: React.FC<ChartErrorFallbackProps> = ({
  error,
  resetErrorBoundary,
  title = "Visualization Render Failure",
  description = "A localized exception occurred while rendering this telemetry module. Other dashboard modules remain fully operational.",
  className = "",
}) => {
  return (
    <div
      className={`w-full h-full min-h-[220px] flex flex-col items-center justify-center p-6 text-center rounded-3xl bg-red-500/10 backdrop-blur-2xl bg-gradient-to-br from-red-500/20 via-rose-500/10 to-amber-500/10 border border-red-500/30 shadow-[inset_1px_1px_2px_rgba(255,255,255,0.4)] shadow-[0_16px_40px_-8px_rgba(225,29,72,0.15)] ${className}`}
    >
      <div className="p-3 rounded-2xl bg-rose-500/20 border border-rose-500/40 text-rose-600 mb-3 shadow-xs">
        <AlertOctagon className="w-6 h-6 animate-pulse" />
      </div>

      <h3 className="text-sm font-bold text-slate-900 tracking-tight mb-1">
        {title}
      </h3>

      <p className="text-xs text-slate-600 max-w-sm mb-4 leading-relaxed font-medium">
        {description}
      </p>

      {error?.message && (
        <div className="max-w-md w-full mb-4 p-2.5 rounded-xl bg-slate-900/85 border border-slate-800 text-[11px] font-mono text-rose-300 text-left overflow-x-auto select-all">
          <span className="text-slate-500 select-none mr-1.5">Exception:</span>
          {error.message}
        </div>
      )}

      {resetErrorBoundary && (
        <Button
          onClick={resetErrorBoundary}
          size="sm"
          variant="outline"
          className="rounded-xl font-semibold text-xs text-slate-800 bg-white/80 hover:bg-white border-white/80 shadow-xs cursor-pointer inline-flex items-center gap-1.5"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Reload Component</span>
        </Button>
      )}
    </div>
  );
};

export interface ChartErrorBoundaryProps {
  children: React.ReactNode;
  fallbackTitle?: string;
  fallbackDescription?: string;
  fallback?: React.ReactNode;
  onReset?: () => void;
  className?: string;
}

interface ChartErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Phase 5: Isolated React Error Boundary
 * Wraps visualization panels and charts to catch localized rendering errors.
 */
export class ChartErrorBoundary extends React.Component<
  ChartErrorBoundaryProps,
  ChartErrorBoundaryState
> {
  constructor(props: ChartErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ChartErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[ChartErrorBoundary] Caught visualization failure:", error, errorInfo);
  }

  handleReset = () => {
    this.props.onReset?.();
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <ChartErrorFallback
          error={this.state.error}
          resetErrorBoundary={this.handleReset}
          title={this.props.fallbackTitle}
          description={this.props.fallbackDescription}
          className={this.props.className}
        />
      );
    }

    return this.props.children;
  }
}

export default ChartErrorBoundary;
