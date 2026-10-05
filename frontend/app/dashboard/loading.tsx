import OperatorGreetingSkeleton from "@/components/dashboard/skeletons/operator-greeting-skeleton";
import { 
  SummaryMetricsSkeleton, 
  ReliabilityTrendChartSkeleton, 
  PriorityDecisionTableSkeleton 
} from "@/components/dashboard/dashboard-skeletons";

export default function DashboardLoading() {
  return (
    <main className="min-h-screen bg-[#fafafa] p-6 lg:p-8">
      <div className="mx-auto max-w-7xl space-y-8">
        
        {/* Foundation Layout Wrapper: Welcome Banner */}
        <OperatorGreetingSkeleton />

        {/* Phase 3 CSS Grid Architecture */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Top Section: Summary Metrics */}
          <div className="col-span-full lg:col-span-12">
            <SummaryMetricsSkeleton />
          </div>

          {/* Middle Section: Trend Chart */}
          <div className="col-span-full lg:col-span-12 min-h-[400px]">
            <ReliabilityTrendChartSkeleton />
          </div>

          {/* Bottom Section: Priority Table */}
          <div className="col-span-full lg:col-span-12 overflow-hidden rounded-3xl">
            <PriorityDecisionTableSkeleton />
          </div>

        </div>
      </div>
    </main>
  );
}
