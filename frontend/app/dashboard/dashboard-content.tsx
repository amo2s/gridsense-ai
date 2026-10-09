"use client";

import { useQuery } from "@tanstack/react-query";
import { SummaryMetrics } from "@/components/dashboard/summary-metrics";
import { ReliabilityTrendChart } from "@/components/dashboard/reliability-trend-chart";
import { PriorityDecisionTable } from "@/components/dashboard/priority-decision-table";
import { graphqlClient } from "@/lib/graphql-client";
import { GET_DASHBOARD_METRICS } from "@/lib/graphql/queries";
import { Loader2, AlertCircle } from "lucide-react";

export function DashboardContent() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["dashboard-metrics"],
    queryFn: async () => {
      return graphqlClient.request<any>(GET_DASHBOARD_METRICS, {
        timeRange: "24h",
        areaId: "global"
      });
    }
  });

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-4 text-red-600">
        <AlertCircle className="h-8 w-8" />
        <p>Failed to load dashboard data.</p>
        <p className="text-sm text-red-500">{error instanceof Error ? error.message : "Unknown error"}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <div className="col-span-full lg:col-span-12">
        <SummaryMetrics summaryData={data?.dashboardSummary} />
      </div>
      <div className="col-span-full lg:col-span-12 min-h-[400px]">
        <ReliabilityTrendChart trendData={data?.reliabilityTrend} />
      </div>
      <div className="col-span-full lg:col-span-12 overflow-hidden rounded-3xl">
        <PriorityDecisionTable priorityData={data?.priorityAreas} />
      </div>
    </div>
  );
}
