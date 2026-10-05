"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { graphQLClient } from "@/lib/graphql/client";
import { GET_INTELLIGENCE_INSIGHT } from "@/lib/graphql/queries";
import { ACKNOWLEDGE_ALERT_MUTATION, LOG_INTERVENTION_MUTATION } from "@/lib/graphql/mutations";
import { IntelligenceInsight, AcknowledgeAlertResult, LogInterventionResult } from "@/lib/graphql/generated";
import { Button } from "@/components/ui/button";

export interface IntelligenceInsightPanelProps {
  anomalyId: string;
  feederId: string;
  initialData?: IntelligenceInsight | null;
}

export function IntelligenceInsightPanel({ anomalyId, feederId, initialData }: IntelligenceInsightPanelProps) {
  const queryClient = useQueryClient();
  const [selectedAction, setSelectedAction] = useState("Reroute Feeder Load");
  const [operatorNotes, setOperatorNotes] = useState("");

  const { data, isLoading, isError } = useQuery<{ intelligenceInsight: IntelligenceInsight }>({
    queryKey: ["intelligenceInsight", anomalyId],
    queryFn: async () => {
      if (!anomalyId) return { intelligenceInsight: null as any };
      return graphQLClient.request(GET_INTELLIGENCE_INSIGHT, { anomalyId });
    },
    initialData: initialData ? { intelligenceInsight: initialData } : undefined,
    enabled: !!anomalyId,
  });

  const acknowledgeMutation = useMutation<{ acknowledgeAlert: AcknowledgeAlertResult }, Error, void, { previousData: any }>({
    mutationFn: () => graphQLClient.request(ACKNOWLEDGE_ALERT_MUTATION, { alertId: anomalyId, notes: operatorNotes }),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["intelligenceInsight", anomalyId] });
      const previousData = queryClient.getQueryData(["intelligenceInsight", anomalyId]);
      // Optimistic update logic if needed
      return { previousData };
    },
    onError: (err, variables, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(["intelligenceInsight", anomalyId], context.previousData);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["anomalyTimeline"] });
      queryClient.invalidateQueries({ queryKey: ["intelligenceInsight"] });
      queryClient.invalidateQueries({ queryKey: ["dashboardSummary"] });
    },
  });

  const logInterventionMutation = useMutation<{ logIntervention: LogInterventionResult }, Error, void, { previousData: any }>({
    mutationFn: () => graphQLClient.request(LOG_INTERVENTION_MUTATION, { alertId: anomalyId, feederId, actionTaken: selectedAction, notes: operatorNotes }),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["intelligenceInsight", anomalyId] });
      const previousData = queryClient.getQueryData(["intelligenceInsight", anomalyId]);
      return { previousData };
    },
    onError: (err, variables, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(["intelligenceInsight", anomalyId], context.previousData);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["anomalyTimeline"] });
      queryClient.invalidateQueries({ queryKey: ["intelligenceInsight"] });
      queryClient.invalidateQueries({ queryKey: ["dashboardSummary"] });
    },
  });

  if (!anomalyId) {
    return (
      <div className="bg-white/5 border border-white/10 rounded-xl p-6 shadow-sm flex items-center justify-center text-white h-full">
        <p className="text-neutral-400">No active anomaly attributions for this feeder</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="bg-white/5 border border-white/10 rounded-xl p-6 shadow-sm flex items-center justify-center text-white h-full animate-pulse">
        <p className="text-neutral-400">Analyzing causal metrics...</p>
      </div>
    );
  }

  if (isError || !data?.intelligenceInsight) {
    return (
      <div className="bg-white/5 border border-white/10 rounded-xl p-6 shadow-sm flex items-center justify-center text-white h-full">
        <p className="text-neutral-400">No active anomaly attributions for this feeder</p>
      </div>
    );
  }

  const insight = data.intelligenceInsight;
  const isHighConfidence = insight.confidenceScore > 0.8;
  const badgeClass = isHighConfidence
    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
    : "bg-amber-500/10 text-amber-400 border-amber-500/20";

  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-6 shadow-sm text-white space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Engine C Attribution & Causal Insight</h3>
        <span className={`px-2 py-1 text-xs font-semibold rounded-md border ${badgeClass}`}>
          {(insight.confidenceScore * 100).toFixed(0)}% Confidence
        </span>
      </div>

      <div className="space-y-2">
        {insight.reasons.map((reason, idx) => (
          <blockquote key={idx} className="bg-white/[0.03] border-l-2 border-emerald-500/80 p-3 rounded-r-md text-sm text-neutral-300 leading-relaxed">
            {reason}
          </blockquote>
        ))}
      </div>

      <div>
        <h4 className="text-sm font-semibold mb-3">SHAP Anomaly Attributions</h4>
        <div className="space-y-4">
          {insight.featureDeviations.map((dev, idx) => {
            const ratio = Math.min(Math.abs(dev.shapAttribution) * 100, 100);
            const isHighRisk = dev.shapAttribution > 0.5 || dev.shapAttribution < -0.5;
            return (
              <div key={idx}>
                <div className="flex justify-between items-baseline mb-1">
                  <div>
                    <span className="font-medium text-sm block">{dev.featureName}</span>
                    <span className="text-xs text-neutral-400 block">{dev.deviationDescription}</span>
                  </div>
                  <span className="text-xs font-mono">{(dev.shapAttribution > 0 ? "+" : "") + dev.shapAttribution.toFixed(2)}</span>
                </div>
                <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden mt-1.5">
                  <div 
                    className={`h-full ${isHighRisk ? "bg-amber-500" : "bg-emerald-500"}`} 
                    style={{ width: `${ratio}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="pt-4 border-t border-white/10 space-y-4">
        {acknowledgeMutation.isError && <div className="text-sm text-red-400">Failed to acknowledge alert.</div>}
        {logInterventionMutation.isError && <div className="text-sm text-red-400">Failed to log intervention.</div>}
        {(acknowledgeMutation.isSuccess || logInterventionMutation.isSuccess) && (
          <div className="text-sm text-emerald-400 bg-emerald-500/10 p-2 rounded-md border border-emerald-500/20 text-center font-medium">
            Intervention Dispatched & Logged
          </div>
        )}
        <div className="flex items-center gap-3">
          <select 
            value={selectedAction}
            onChange={(e) => setSelectedAction(e.target.value)}
            className="bg-black/20 border border-white/10 text-white text-sm rounded-lg px-3 py-3 w-1/2 outline-none focus:border-white/20 transition-colors"
          >
            <option value="Reroute Feeder Load">Reroute Feeder Load</option>
            <option value="Trigger Tap Changer">Trigger Tap Changer</option>
            <option value="Dispatch Maintenance Crew">Dispatch Maintenance Crew</option>
          </select>
          <Button 
            onClick={() => logInterventionMutation.mutate()} 
            isLoading={logInterventionMutation.isPending}
            className="w-1/2 bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/30"
          >
            Dispatch Action
          </Button>
        </div>
        <Button 
          onClick={() => acknowledgeMutation.mutate()} 
          isLoading={acknowledgeMutation.isPending}
          className="w-full bg-white/5 hover:bg-white/10 border border-white/10 text-neutral-300"
        >
          Acknowledge Alert
        </Button>
      </div>
    </div>
  );
}
