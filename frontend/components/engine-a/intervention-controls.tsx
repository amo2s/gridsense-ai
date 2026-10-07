"use client";

import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { graphqlClient } from "@/lib/graphql-client";
import { GET_AREA_DRILL_DOWN_METRICS } from "@/lib/graphql/queries";
import { ACKNOWLEDGE_ALERT_MUTATION, LOG_INTERVENTION_MUTATION } from "@/lib/graphql/mutations";
import { motion } from "framer-motion";
import { CheckCircle2, Wrench } from "lucide-react";

interface InterventionControlsProps {
  feederId: string;
}

export function InterventionControls({ feederId }: InterventionControlsProps) {
  const queryClient = useQueryClient();

  // Fetch anomaly timeline to get the latest alert context
  const { data: timelineData, isLoading } = useQuery({
    queryKey: ["anomaly-timeline", feederId],
    queryFn: async () => {
      const res = await graphqlClient.request<any>(GET_AREA_DRILL_DOWN_METRICS, {
        areaId: feederId,
        timeRange: "6h",
      });
      return res.anomalyTimeline;
    },
  });

  const latestAlert = timelineData && timelineData.length > 0 ? timelineData[0] : null;

  // Mutation: Acknowledge Alert (Optimistic UI)
  const acknowledgeMutation = useMutation({
    mutationFn: async (alertId: string) => {
      return graphqlClient.request(ACKNOWLEDGE_ALERT_MUTATION, { alertId, notes: "Operator Acknowledged" });
    },
    onMutate: async (alertId) => {
      // Cancel any outgoing refetches to avoid overwriting optimistic update
      await queryClient.cancelQueries({ queryKey: ["anomaly-timeline", feederId] });
      await queryClient.cancelQueries({ queryKey: ["priority-areas"] });

      // Snapshot previous state
      const previousTimeline = queryClient.getQueryData(["anomaly-timeline", feederId]);
      const previousPriority = queryClient.getQueryData(["priority-areas"]);

      // Optimistically update the timeline by mutating the specific alert's status or removing it
      // Depending on UI spec, we can mark it as 'Acknowledged' or just update UI
      // Here we optimistically modify the severity or description for visual feedback
      if (previousTimeline) {
        queryClient.setQueryData(["anomaly-timeline", feederId], (old: any) => {
          if (!old) return old;
          return old.map((alert: any) => 
            alert.id === alertId ? { ...alert, severity: 'Stable', description: 'Acknowledged by operator.' } : alert
          );
        });
      }

      // Return context for rollback
      return { previousTimeline, previousPriority };
    },
    onError: (err, alertId, context) => {
      // Rollback on error
      if (context?.previousTimeline) {
        queryClient.setQueryData(["anomaly-timeline", feederId], context.previousTimeline);
      }
      if (context?.previousPriority) {
        queryClient.setQueryData(["priority-areas"], context.previousPriority);
      }
    },
    onSettled: () => {
      // Invalidate queries to sync with server after completion
      queryClient.invalidateQueries({ queryKey: ["anomaly-timeline", feederId] });
      queryClient.invalidateQueries({ queryKey: ["priority-areas"] });
    },
  });

  // Mutation: Log Intervention (Optimistic UI)
  const interventionMutation = useMutation({
    mutationFn: async ({ alertId, feederId }: { alertId: string; feederId: string }) => {
      return graphqlClient.request(LOG_INTERVENTION_MUTATION, {
        alertId,
        feederId,
        actionTaken: "Dispatched Field Crew",
        notes: "Automated intervention request from Dashboard",
      });
    },
    onMutate: async ({ alertId, feederId }) => {
      await queryClient.cancelQueries({ queryKey: ["anomaly-timeline", feederId] });
      const previousTimeline = queryClient.getQueryData(["anomaly-timeline", feederId]);

      if (previousTimeline) {
        queryClient.setQueryData(["anomaly-timeline", feederId], (old: any) => {
          if (!old) return old;
          return old.map((alert: any) =>
            alert.id === alertId ? { ...alert, description: 'Intervention Logged: Dispatched Field Crew' } : alert
          );
        });
      }
      return { previousTimeline };
    },
    onError: (err, variables, context) => {
      if (context?.previousTimeline) {
        queryClient.setQueryData(["anomaly-timeline", feederId], context.previousTimeline);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["anomaly-timeline", feederId] });
      queryClient.invalidateQueries({ queryKey: ["priority-areas"] });
    },
  });

  if (isLoading || !latestAlert) return null; // Only show controls if there is an active alert

  const handleAcknowledge = () => {
    acknowledgeMutation.mutate(latestAlert.id);
  };

  const handleIntervention = () => {
    interventionMutation.mutate({ alertId: latestAlert.id, feederId });
  };

  return (
    <div className="liquid-panel backdrop-blur-md relative overflow-hidden p-4 bg-gradient-to-br from-white/90 to-white/60 border border-white/80 shadow-lg rounded-2xl w-full mt-4 flex flex-col sm:flex-row gap-4 items-center justify-end z-20">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white to-transparent opacity-80" />
      
      <span className="mr-auto text-sm font-semibold text-neutral-600 px-2">
        Operator Actions for {latestAlert.eventType}
      </span>

      <motion.button
        whileTap={{ scale: 0.95 }}
        transition={{ type: "spring", stiffness: 400, damping: 10 }}
        onClick={handleAcknowledge}
        disabled={acknowledgeMutation.isPending}
        className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-white/50 border border-emerald-500/30 text-emerald-600 font-bold text-sm shadow-[0_2px_8px_rgba(16,185,129,0.15)] hover:bg-emerald-50/80 hover:border-emerald-500/60 hover:shadow-[0_4px_12px_rgba(16,185,129,0.25)] transition-colors"
      >
        <CheckCircle2 className="w-4 h-4" />
        {acknowledgeMutation.isPending ? "Acknowledging..." : "Acknowledge Alert"}
      </motion.button>

      <motion.button
        whileTap={{ scale: 0.95 }}
        transition={{ type: "spring", stiffness: 400, damping: 10 }}
        onClick={handleIntervention}
        disabled={interventionMutation.isPending}
        className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-[#10b981] to-[#059669] text-white font-bold text-sm shadow-[0_4px_12px_rgba(16,185,129,0.3)] hover:shadow-[0_6px_16px_rgba(16,185,129,0.4)] border border-white/20 transition-all"
      >
        <Wrench className="w-4 h-4" />
        {interventionMutation.isPending ? "Logging..." : "Log Intervention"}
      </motion.button>
    </div>
  );
}
