import KpiStatsSkeleton from "./kpi-stats-skeleton";
import FeederStatusSkeleton from "./feeder-status-skeleton";
import AnomalyTimelineSkeleton from "./anomaly-timeline-skeleton";

export default function DashboardLayoutSkeleton() {
  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <div className="h-8 w-64 bg-gray-200/60 rounded-md animate-pulse mb-2"></div>
        <div className="h-4 w-96 bg-gray-200/60 rounded-md animate-pulse"></div>
      </div>
      
      <KpiStatsSkeleton />
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <FeederStatusSkeleton />
        </div>
        <div>
          <AnomalyTimelineSkeleton />
        </div>
      </div>
    </div>
  );
}
