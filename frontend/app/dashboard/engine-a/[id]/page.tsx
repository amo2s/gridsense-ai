"use client";

import React, { use, useEffect } from "react";
import { notFound } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { graphqlClient } from "@/lib/graphql-client";
import { GET_AREA_DRILL_DOWN_METRICS } from "@/lib/graphql/queries";
import { useUIStore } from "@/store/ui-store";
import { usePriorityRanking } from "@/hooks/use-priority-ranking";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import dynamic from "next/dynamic";

// Ensure chart is explicitly client-rendered to prevent Recharts SSR mismatch
const PredictiveForecast = dynamic(
  () => import("@/components/engine-a/predictive-forecast").then((mod) => mod.PredictiveForecast),
  { ssr: false }
);

const AnomalyTimeline = dynamic(
  () => import("@/components/engine-a/anomaly-timeline").then((mod) => mod.AnomalyTimeline),
  { ssr: false }
);

const IntelligenceInsightPanel = dynamic(
  () => import("@/components/engine-a/intelligence-insight-panel").then((mod) => mod.IntelligenceInsightPanel),
  { ssr: false }
);

const InterventionControls = dynamic(
  () => import("@/components/engine-a/intervention-controls").then((mod) => mod.InterventionControls),
  { ssr: false }
);

interface FeederDetailProps {
  params: Promise<{ id: string }>;
}

export default function FeederDetailRoute({ params }: FeederDetailProps) {
  // Next.js 16.3.2 App Router: unwrap dynamic route parameters asynchronously
  const unwrappedParams = use(params);
  const id = String(unwrappedParams.id);

  // Synchronize local context with global application state
  const setActiveFeederContext = useUIStore((state) => state.setActiveFeederContext);

  useEffect(() => {
    if (id) {
      setActiveFeederContext(id);
    }
    return () => setActiveFeederContext(null);
  }, [id, setActiveFeederContext]);

  // Fetch Priority Areas to get the name and status
  const { data: priorityAreas } = usePriorityRanking();
  const feederInfo = priorityAreas?.find((p) => p.id === id);

  // Derive colors based on status using exact Engine A mappings
  const status = feederInfo?.status || "Analyzing";
  let statusColorClass = "text-zinc-500 bg-zinc-100 border-zinc-200/40";
  if (status === "Stable") {
    statusColorClass = "text-[#10b981] bg-[#10b981]/10 border-[#10b981]/20";
  } else if (status === "Vulnerable" || status === "Warning") {
    statusColorClass = "text-amber-600 bg-amber-500/10 border-amber-500/20";
  } else if (status === "Critical") {
    statusColorClass = "text-red-600 bg-red-500/10 border-red-500/20";
  }

  // Fallback if PriorityArea data finished loading and the ID wasn't found at all
  // Note: For this drill-down, it's possible it's found in anomaly API even if not in priority API, 
  // but we assume priority API contains all active feeders.

  return (
    <div className="p-6 min-h-screen bg-[#FAFAFA] flex flex-col gap-6">
      {/* Navigation */}
      <div className="w-full">
        <Link
          href="/dashboard"
          className="inline-flex items-center px-4 py-2 rounded-xl bg-white/50 border border-white/80 shadow-sm hover:bg-white/80 text-sm font-medium text-zinc-600 transition-colors backdrop-blur-md"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Engine A
        </Link>
      </div>

      {/* Top Command Header */}
      <div className="liquid-panel backdrop-blur-md relative overflow-hidden p-6 bg-gradient-to-br from-white/80 to-white/30 border border-white/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),_0_8px_16px_-4px_rgba(0,0,0,0.1)] rounded-3xl">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white to-transparent opacity-80" />
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center relative z-10">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900">
              {feederInfo ? feederInfo.name : `Feeder ${id}`}
            </h1>
            <p className="text-sm text-neutral-500 mt-1">Area Investigation Workspace</p>
          </div>
          <div className="mt-4 sm:mt-0">
            <span className={`px-4 py-1.5 rounded-full text-sm font-semibold border shadow-sm ${statusColorClass}`}>
              {status}
            </span>
          </div>
        </div>
        
        {/* Step 5.2: Operator Intervention Controls */}
        <div className="relative z-10 w-full mt-2">
          <InterventionControls feederId={id} />
        </div>
      </div>

      {/* Grid for vertical timeline and wide predictive chart */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1">
        
        {/* Step 4.2: Vertical Anomaly Timeline */}
        <div className="lg:col-span-4 liquid-panel backdrop-blur-md relative overflow-hidden p-6 bg-gradient-to-br from-white/80 to-white/30 border border-white/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),_0_8px_16px_-4px_rgba(0,0,0,0.1)] rounded-3xl min-h-[600px] flex flex-col">
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white to-transparent opacity-80" />
          <h2 className="text-lg font-semibold text-neutral-800 mb-6 relative z-10">Anomaly Timeline</h2>
          <div className="flex-1 relative z-10">
            <AnomalyTimeline feederId={id} />
          </div>
        </div>

        {/* Main Column: Predictive Forecast & Explainability */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          <PredictiveForecast feederId={id} />
          <IntelligenceInsightPanel feederId={id} />
        </div>
      </div>
    </div>
  );
}
