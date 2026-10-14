"use client";

import React from "react";
import { motion } from "framer-motion";
import { 
  Activity, 
  ShieldCheck, 
  ShieldAlert,
  ShieldX,
  Radio, 
  Network, 
  Cpu, 
  KeyRound,
  CheckCircle2,
  AlertTriangle,
  XCircle
} from "lucide-react";

export interface EngineCResilienceProps {
  /** Circuit breaker status (true = closed/healthy, false = open/tripped) */
  circuitBreakerClosed?: boolean;
  /** Whether the user JWT session token was securely validated and injected */
  jwtInjected?: boolean;
  /** Current round-trip latency to the Go Gateway in milliseconds */
  gatewayLatencyMs?: number;
  /** Upstream target URL or service definition */
  upstreamEndpoint?: string;
  /** AI Inference Engine definition */
  targetEngine?: string;
  /** Number of circuit breaker trip events recorded */
  tripCount?: number;
}

/**
 * ============================================================================
 * ENGINE C NETWORK RESILIENCE MONITOR (COMMAND PATHWAY)
 * ============================================================================
 * Live telemetry readout of upstream Go Gateway and Engine C microservice health.
 * Employs hardware-accelerated Framer Motion pulses and strict Liquid Glass styling.
 * Color Polarity:
 *  - Stable: Emerald Green
 *  - Warning: Amber
 *  - Critical: Crimson / Rose
 */
export default function EngineCResilienceMonitor({
  circuitBreakerClosed = true,
  jwtInjected = true,
  gatewayLatencyMs = 14,
  upstreamEndpoint = "Go Gateway (Port 8002 / 8080)",
  targetEngine = "Engine C: Multivariate Ensemble",
  tripCount = 0,
}: EngineCResilienceProps) {
  // Latency evaluation tiers
  const isLatencyOptimal = gatewayLatencyMs < 50;
  const isLatencyWarning = gatewayLatencyMs >= 50 && gatewayLatencyMs < 150;
  const isLatencyCritical = gatewayLatencyMs >= 150;

  return (
    <motion.aside
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="flex flex-col gap-5 bg-white/25 backdrop-blur-2xl bg-gradient-to-br from-white/60 via-white/20 to-white/5 shadow-[inset_1px_1px_2px_rgba(255,255,255,0.8),inset_-1px_-1px_3px_rgba(255,255,255,0.1)] shadow-[0_16px_40px_-8px_rgba(15,23,42,0.12)] rounded-3xl border border-white/40 p-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-200/60">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600">
            <Radio className="w-4 h-4 animate-pulse" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-800">
              Gateway Resilience
            </h2>
            <p className="text-[11px] text-slate-500">
              Engine C Command Channel
            </p>
          </div>
        </div>

        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase bg-emerald-500/10 text-emerald-700 border border-emerald-500/30">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          ACTIVE
        </span>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 gap-3.5">
        {/* Metric 1: Circuit Breaker Status */}
        <div className="p-3.5 rounded-2xl bg-white/50 border border-white/70 shadow-sm flex items-center justify-between backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className={`p-1.5 rounded-lg border ${
              circuitBreakerClosed 
                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-600" 
                : "bg-rose-500/10 border-rose-500/20 text-rose-600"
            }`}>
              {circuitBreakerClosed ? (
                <ShieldCheck className="w-4 h-4" />
              ) : (
                <ShieldX className="w-4 h-4" />
              )}
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider font-semibold text-slate-500">
                Circuit Breaker
              </p>
              <div className="flex items-center gap-2 mt-0.5">
                {/* Rhythmic Pulsing Status Dot using Framer Motion */}
                <span className="relative flex h-2.5 w-2.5">
                  <motion.span
                    animate={{
                      scale: [1, 1.8, 1],
                      opacity: [0.75, 0, 0.75],
                    }}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                      ease: "easeInOut",
                    }}
                    className={`absolute inline-flex h-full w-full rounded-full ${
                      circuitBreakerClosed ? "bg-emerald-400" : "bg-rose-400"
                    }`}
                  />
                  <span
                    className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                      circuitBreakerClosed ? "bg-emerald-500" : "bg-rose-500"
                    }`}
                  />
                </span>
                <span className="text-xs font-bold text-slate-800">
                  {circuitBreakerClosed ? "CLOSED (Healthy)" : "OPEN (Tripped)"}
                </span>
              </div>
            </div>
          </div>

          <span className={`text-[10px] font-mono px-2 py-0.5 rounded-md border ${
            tripCount === 0
              ? "bg-slate-100 text-slate-500 border-slate-200"
              : "bg-rose-50 text-rose-600 border-rose-200"
          }`}>
            {tripCount} Trips
          </span>
        </div>

        {/* Metric 2: JWT Injection Success */}
        <div className="p-3.5 rounded-2xl bg-white/50 border border-white/70 shadow-sm flex items-center justify-between backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className={`p-1.5 rounded-lg border ${
              jwtInjected 
                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-600" 
                : "bg-rose-500/10 border-rose-500/20 text-rose-600"
            }`}>
              <KeyRound className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider font-semibold text-slate-500">
                JWT Auth Injection
              </p>
              <div className="flex items-center gap-1.5 mt-0.5">
                {jwtInjected ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                ) : (
                  <XCircle className="w-3.5 h-3.5 text-rose-600" />
                )}
                <span className="text-xs font-bold text-slate-800">
                  {jwtInjected ? "VERIFIED (Bearer)" : "FAILED (Unauthenticated)"}
                </span>
              </div>
            </div>
          </div>

          <span className={`px-2 py-0.5 rounded text-[10px] font-semibold tracking-wider uppercase border ${
            jwtInjected 
              ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/20" 
              : "bg-rose-500/10 text-rose-700 border-rose-500/20"
          }`}>
            {jwtInjected ? "Valid" : "Rejected"}
          </span>
        </div>

        {/* Metric 3: Gateway Latency */}
        <div className="p-3.5 rounded-2xl bg-white/50 border border-white/70 shadow-sm flex items-center justify-between backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className={`p-1.5 rounded-lg border ${
              isLatencyOptimal
                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-600"
                : isLatencyWarning
                ? "bg-amber-500/10 border-amber-500/20 text-amber-600"
                : "bg-rose-500/10 border-rose-500/20 text-rose-600"
            }`}>
              <Activity className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider font-semibold text-slate-500">
                Gateway Latency
              </p>
              <p className="text-xs font-bold text-slate-800 mt-0.5 font-mono">
                {gatewayLatencyMs}ms{" "}
                <span className="text-[10px] font-normal text-slate-500">
                  (p99 &lt; 35ms)
                </span>
              </p>
            </div>
          </div>

          <span
            className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold uppercase border ${
              isLatencyOptimal
                ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/20"
                : isLatencyWarning
                ? "bg-amber-500/10 text-amber-700 border-amber-500/20"
                : "bg-rose-500/10 text-rose-700 border-rose-500/20"
            }`}
          >
            {isLatencyOptimal ? "Optimal" : isLatencyWarning ? "Elevated" : "Critical"}
          </span>
        </div>

        {/* Upstream Endpoint */}
        <div className="p-3.5 rounded-2xl bg-white/50 border border-white/70 shadow-sm flex items-center justify-between backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="p-1.5 rounded-lg bg-slate-100 border border-slate-200 text-slate-600">
              <Network className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider font-semibold text-slate-500">
                Target Node
              </p>
              <p className="text-xs font-mono font-medium text-slate-700 mt-0.5">
                {upstreamEndpoint}
              </p>
            </div>
          </div>
        </div>

        {/* Machine Learning Engine */}
        <div className="p-3.5 rounded-2xl bg-white/50 border border-white/70 shadow-sm flex items-center justify-between backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="p-1.5 rounded-lg bg-slate-100 border border-slate-200 text-slate-600">
              <Cpu className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider font-semibold text-slate-500">
                Target Engine
              </p>
              <p className="text-xs font-medium text-slate-700 mt-0.5">
                {targetEngine}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Pathway Isolation Notice */}
      <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-slate-700 text-xs backdrop-blur-md">
        <div className="flex items-center gap-2 mb-1.5">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
          <p className="font-semibold text-amber-900">
            CQRS Command Boundary
          </p>
        </div>
        <p className="text-[11px] text-slate-600 leading-relaxed">
          Ingestion payloads dispatch directly to the Go Gateway command proxy. Live analytics queries are decoupled to prevent computation locks.
        </p>
      </div>

      {/* Diagnostics Footer */}
      <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between text-[11px] text-slate-400">
        <span>Protocol: HTTP/2 (TLS 1.3)</span>
        <span className="font-mono">Boundary: STRICT</span>
      </div>
    </motion.aside>
  );
}
