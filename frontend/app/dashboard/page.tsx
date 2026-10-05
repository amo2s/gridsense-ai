import { Suspense } from "react";
import { cookies } from "next/headers";

import OperatorGreeting from "@/components/dashboard/operator-greeting";
import OperatorGreetingSkeleton from "@/components/dashboard/skeletons/operator-greeting-skeleton";
import { SummaryMetrics } from "@/components/dashboard/summary-metrics";
import { ReliabilityTrendChart } from "@/components/dashboard/reliability-trend-chart";
import { PriorityDecisionTable } from "@/components/dashboard/priority-decision-table";

async function getUserRole() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("auth_token")?.value;
    if (!token) return { role: "STAFF", email: "" };
    
    const parts = token.split(".");
    if (parts.length !== 3) return { role: "STAFF", email: "" };
    
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(Buffer.from(base64, "base64").toString("utf-8"));
    
    return { 
      role: payload.role || "STAFF", 
      email: payload.email || "",
      name: payload.name || ""
    };
  } catch (error) {
    return { role: "STAFF", email: "" };
  }
}

export default async function DashboardPage() {
  const { role, email, name } = await getUserRole();
  const username = name || (email ? email.split("@")[0] : "Operator");

  return (
    <main className="min-h-screen bg-[#fafafa] p-6 lg:p-8">
      <div className="mx-auto max-w-7xl space-y-8">
        
        {/* Foundation Layout Wrapper: Welcome Banner */}
        <Suspense fallback={<OperatorGreetingSkeleton />}>
          <OperatorGreeting name={username} role={role} />
        </Suspense>

        {/* Phase 3 CSS Grid Architecture */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Top Section: Summary Metrics */}
          <div className="col-span-full lg:col-span-12">
            <SummaryMetrics />
          </div>

          {/* Middle Section: Trend Chart */}
          <div className="col-span-full lg:col-span-12 min-h-[400px]">
            <ReliabilityTrendChart />
          </div>

          {/* Bottom Section: Priority Table */}
          <div className="col-span-full lg:col-span-12 overflow-hidden rounded-3xl">
            <PriorityDecisionTable />
          </div>

        </div>
      </div>
    </main>
  );
}