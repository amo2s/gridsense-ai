import React from 'react';
import Link from 'next/link';
import { getGraphQLClient } from "@/lib/graphql/client";
import { GET_AREA_DRILL_DOWN_METRICS } from "@/lib/graphql/queries";
import { AnomalyTimeline, AnomalyTimelineEvent } from "@/components/areas/anomaly-timeline";
import { RiskForecastChart, PredictiveRiskData } from "@/components/areas/risk-forecast-chart";

export default async function AreaDrillDownPage(context: { params: Promise<{ id: string }> }) {
  const params = await context.params;
  const client = await getGraphQLClient();
  
  let timelineData: AnomalyTimelineEvent[] = [];
  let forecastData: PredictiveRiskData[] = [];
  
  try {
    const data: any = await client.request(GET_AREA_DRILL_DOWN_METRICS, { 
      areaId: params.id, 
      timeRange: "6h" 
    });
    
    if (data) {
      timelineData = data.anomalyTimeline || [];
      forecastData = data.predictiveRiskForecast || [];
    }
  } catch (error) {
    console.error("GraphQL Fetch Error for Area Drill Down:", error);
    // Graceful Degradation: Fallback to empty arrays safely
    timelineData = [];
    forecastData = [];
  }

  return (
    <main className="grid grid-cols-1 lg:grid-cols-12 gap-6 p-6 min-h-screen bg-[#FAFAFA]">
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
    </main>
  );
}
