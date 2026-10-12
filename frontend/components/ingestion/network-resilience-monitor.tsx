"use client";

import { Activity, ShieldCheck, Cpu, Radio, Network } from "lucide-react";

/**
 * ============================================================================
 * NETWORK RESILIENCE MONITOR (PHASE 1 PLACEHOLDER)
 * ============================================================================
 * Visually monitors upstream health and resilience to the Go API Gateway (port 8002/8080)
 * and Engine B inference microservices.
 * 
 * Enforces visual fidelity for the Command Pathway boundary enforcement.
 */
export default function NetworkResilienceMonitor() {
  return (
    <div className="flex flex-col gap-5 bg-white/40 backdrop-blur-xl border border-white/60 shadow-[0_8px_32px_rgba(0,0,0,0.04)] shadow-[inset_0_1px_1px_rgba(255,255,255,0.8)] rounded-2xl p-6">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-200/60">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600">
            <Radio className="w-4 h-4 animate-pulse" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-800">Gateway Telemetry</h2>
            <p className="text-[11px] text-slate-500">Command Pathway Resilience</p>
          </div>
        </div>

        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase bg-emerald-500/10 text-emerald-700 border border-emerald-500/30">
          OPERATIONAL
        </span>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 gap-3.5">
        {/* Circuit Breaker Status */}
        <div className="p-3.5 rounded-xl bg-white/50 border border-white/70 shadow-sm flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <div>
              <p className="text-[11px] uppercase tracking-wider font-semibold text-slate-500">
                Circuit Breaker
              </p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                </span>
                <span className="text-xs font-bold text-slate-800">
                  CLOSED (Normal)
                </span>
              </div>
            </div>
          </div>
          <span className="text-[10px] text-slate-400 font-mono">0 Trip Events</span>
        </div>

        {/* Gateway Latency */}
        <div className="p-3.5 rounded-xl bg-white/50 border border-white/70 shadow-sm flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Activity className="w-4 h-4 text-emerald-600 shrink-0" />
            <div>
              <p className="text-[11px] uppercase tracking-wider font-semibold text-slate-500">
                Gateway Latency
              </p>
              <p className="text-xs font-bold text-slate-800 mt-0.5 font-mono">
                12ms <span className="text-[10px] font-normal text-emerald-600">(p99 &lt; 25ms)</span>
              </p>
            </div>
          </div>
          <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-700 font-semibold">
            Optimal
          </span>
        </div>

        {/* Upstream Endpoint */}
        <div className="p-3.5 rounded-xl bg-white/50 border border-white/70 shadow-sm flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Network className="w-4 h-4 text-slate-600 shrink-0" />
            <div>
              <p className="text-[11px] uppercase tracking-wider font-semibold text-slate-500">
                Target Node
              </p>
              <p className="text-xs font-mono font-medium text-slate-700 mt-0.5">
                Go Gateway (Port 8002 / 8080)
              </p>
            </div>
          </div>
        </div>

        {/* Machine Learning Engine */}
        <div className="p-3.5 rounded-xl bg-white/50 border border-white/70 shadow-sm flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Cpu className="w-4 h-4 text-slate-600 shrink-0" />
            <div>
              <p className="text-[11px] uppercase tracking-wider font-semibold text-slate-500">
                Target Engine
              </p>
              <p className="text-xs font-medium text-slate-700 mt-0.5">
                Engine B: Outage Risk (ONNX v2)
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Pathway Isolation Notice */}
      <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-slate-700 text-xs">
        <p className="font-semibold text-amber-800 mb-1">
          Command Pathway Decoupling
        </p>
        <p className="text-[11px] text-slate-600 leading-relaxed">
          Ingestion traffic is processed through isolated singleflight proxy channels,
          preventing query spikes from degrading real-time inference throughput.
        </p>
      </div>

      {/* Diagnostics Footer */}
      <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between text-[11px] text-slate-400">
        <span>Protocol: HTTP/2 (TLS 1.3)</span>
        <span className="font-mono">Boundary: STRICT</span>
      </div>
    </div>
  );
}
