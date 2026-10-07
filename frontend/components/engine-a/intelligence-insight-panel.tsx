"use client";

import React from "react";
import { useQuery } from "@tanstack/react-query";
import { graphqlClient } from "@/lib/graphql-client";
import { GET_AREA_DRILL_DOWN_METRICS, GET_INTELLIGENCE_INSIGHT } from "@/lib/graphql/queries";
import { Loader2, BrainCircuit } from "lucide-react";

interface IntelligenceInsightPanelProps {
  feederId: string;
}

export function IntelligenceInsightPanel({ feederId }: IntelligenceInsightPanelProps) {
  // First, fetch the anomaly timeline to get the latest anomaly ID
  const { data: timelineData, isLoading: isLoadingTimeline } = useQuery({
    queryKey: ["anomaly-timeline", feederId],
    queryFn: async () => {
      const res = await graphqlClient.request<any>(GET_AREA_DRILL_DOWN_METRICS, {
        areaId: feederId,
        timeRange: "6h",
      });
      return res.anomalyTimeline;
    },
  });

  const latestAnomalyId = timelineData && timelineData.length > 0 ? timelineData[0].id : null;

  // Then fetch the SHAP attributions using that anomaly ID
  const { data: insightData, isLoading: isLoadingInsight, isError } = useQuery({
    queryKey: ["intelligence-insight", latestAnomalyId],
    queryFn: async () => {
      const res = await graphqlClient.request<any>(GET_INTELLIGENCE_INSIGHT, {
        anomalyId: latestAnomalyId,
      });
      return res.intelligenceInsight;
    },
    enabled: !!latestAnomalyId,
  });

  const isLoading = isLoadingTimeline || (latestAnomalyId && isLoadingInsight);

  if (isLoading) {
    return (
      <div className="liquid-panel backdrop-blur-md relative overflow-hidden p-6 bg-gradient-to-br from-white/80 to-white/30 border border-white/60 shadow-lg rounded-3xl w-full min-h-[250px] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#10b981]" />
      </div>
    );
  }

  if (isError || !insightData || !latestAnomalyId) {
    return (
      <div className="liquid-panel backdrop-blur-md relative overflow-hidden p-6 bg-gradient-to-br from-white/80 to-white/30 border border-white/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),_0_8px_16px_-4px_rgba(0,0,0,0.1)] rounded-3xl w-full min-h-[250px] flex items-center justify-center">
        <p className="text-gray-400 font-medium">No explainability data available</p>
      </div>
    );
  }

  const confidencePercentage = Math.round(insightData.confidenceScore * 100);

  return (
    <div className="liquid-panel backdrop-blur-md relative overflow-hidden p-6 bg-gradient-to-br from-white/80 to-white/30 border border-white/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),_0_8px_16px_-4px_rgba(0,0,0,0.1)] rounded-3xl w-full">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white to-transparent opacity-80" />
      
      <div className="flex items-center gap-3 mb-6 relative z-10">
        <div className="p-2 bg-[#10b981]/10 rounded-xl border border-[#10b981]/20">
          <BrainCircuit className="w-6 h-6 text-[#10b981]" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-neutral-800">Engine A Intelligence Insight</h2>
          <p className="text-sm font-medium text-neutral-600 mt-1">
            {confidencePercentage}% confidence of grid anomaly driven by {insightData.reasons.join(", ").toLowerCase()}.
          </p>
        </div>
      </div>

      <div className="space-y-5 relative z-10">
        <h3 className="text-sm font-semibold text-neutral-500 uppercase tracking-wider mb-2">SHAP Feature Deviations</h3>
        
        {insightData.featureDeviations.map((feature: any, idx: number) => {
          const isPositive = feature.shapAttribution > 0;
          const barColorClass = isPositive ? "bg-[#10b981]" : "bg-red-500";
          const bgColorClass = isPositive ? "bg-[#10b981]/10 border-[#10b981]/20" : "bg-red-500/10 border-red-500/20";
          
          // Normalize attribution for width display (mock normalization up to max expected attribution)
          const absAttribution = Math.min(Math.abs(feature.shapAttribution * 100), 100);
          
          return (
            <div key={idx} className="flex flex-col gap-1.5">
              <div className="flex justify-between items-end">
                <span className="text-sm font-semibold text-neutral-700">{feature.featureName}</span>
                <span className="text-xs font-medium text-neutral-500">{feature.deviationDescription}</span>
              </div>
              
              {/* Liquid Glass Progress Bar */}
              <div className={`h-4 w-full rounded-full border shadow-inner overflow-hidden relative ${bgColorClass}`}>
                <div 
                  className={`h-full ${barColorClass} shadow-[inset_0_2px_4px_rgba(255,255,255,0.4)] relative transition-all duration-1000 ease-out`}
                  style={{ width: `${absAttribution}%` }}
                >
                  {/* Glossy specular highlight on the bar itself */}
                  <div className="absolute top-0 left-0 right-0 h-1/2 bg-gradient-to-b from-white/40 to-transparent"></div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
