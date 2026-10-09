"use client";

import React from 'react';
import Link from 'next/link';
import { useQuery } from "@tanstack/react-query";
import { GET_AREA_DRILL_DOWN_METRICS } from "@/lib/graphql/queries";
import { AnomalyTimeline, AnomalyTimelineEvent } from "@/components/areas/anomaly-timeline";
import { RiskForecastChart, PredictiveRiskData } from "@/components/areas/risk-forecast-chart";
import { IntelligenceInsightPanel } from "@/components/areas/intelligence-insight-panel";
import { MotionMain } from "@/components/areas/motion-wrapper";
import { graphqlClient } from "@/lib/graphql-client";
import { Loader2, AlertCircle } from "lucide-react";

export function AreaContent({ areaId }: { areaId: string }) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["area-metrics", areaId],
    queryFn: async () => {
      return graphqlClient.request<any>(GET_AREA_DRILL_DOWN_METRICS, { 
        areaId: areaId, 
        timeRange: "6h" 
      });
    }
  });

  if (isLoading) {
    return (
      <MotionMain layoutId={`area-${areaId}`} className="flex flex-col p-6 min-h-screen bg-[#FAFAFA] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </MotionMain>
    );
  }

  if (isError) {
    return (
      <MotionMain layoutId={`area-${areaId}`} className="flex flex-col p-6 min-h-screen bg-[#FAFAFA] items-center justify-center text-red-600">
        <AlertCircle className="h-8 w-8 mb-4" />
        <p>Failed to load area data.</p>
        <p className="text-sm text-red-500">{error instanceof Error ? error.message : "Unknown error"}</p>
      </MotionMain>
    );
  }

  const timelineData: AnomalyTimelineEvent[] = data?.anomalyTimeline || [];
  const forecastData: PredictiveRiskData[] = data?.predictiveRiskForecast || [];
  const latestAnomalyId = timelineData.length > 0 ? timelineData[0].id : "";

  return (
    <MotionMain layoutId={`area-${areaId}`} className="grid grid-cols-1 lg:grid-cols-12 gap-6 p-6 min-h-screen bg-[#FAFAFA]">
      <div className="col-span-full lg:col-span-12 mb-4">
        <Link 
          href="/dashboard"
          className="inline-flex items-center px-4 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-sm font-medium text-zinc-600 transition-colors"
        >
          &larr; Back to Global Overview
        </Link>
      </div>

      <div className="col-span-full lg:col-span-4 rounded-3xl bg-white/60 shadow-xl shadow-emerald-900/5 border border-white/80 p-6">
        <h2 className="text-lg font-semibold text-zinc-700 mb-6">Anomaly Timeline</h2>
        <AnomalyTimeline data={timelineData} />
      </div>

      <div className="col-span-full lg:col-span-8 rounded-3xl bg-white/60 shadow-xl shadow-emerald-900/5 border border-white/80 p-6 flex flex-col min-h-[500px]">
        <h2 className="text-lg font-semibold text-zinc-700 mb-6">Predictive Risk Forecast (Engine B)</h2>
        <div className="flex-1">
          <RiskForecastChart data={forecastData} />
        </div>
      </div>

      <div className="col-span-full lg:col-span-12 rounded-3xl bg-zinc-950 shadow-xl border border-zinc-900 p-2">
        <IntelligenceInsightPanel anomalyId={latestAnomalyId} feederId={areaId} />
      </div>
    </MotionMain>
  );
}
