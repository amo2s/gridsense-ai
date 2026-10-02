import { cookies } from "next/headers";
import Link from "next/link";
import { Users, Activity, ShieldCheck, ArrowRight, Clock, CheckCircle2, Zap, AlertTriangle, CheckCircle } from "lucide-react";
import { getGraphQLClient } from "@/lib/graphql/client";
import { GET_DASHBOARD_METRICS } from "@/lib/graphql/queries";

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
      email: payload.email || "" 
    };
  } catch (error) {
    return { role: "STAFF", email: "" };
  }
}

export default async function DashboardPage() {
  const { role, email } = await getUserRole();
  const username = email ? email.split("@")[0] : "Operator";

  // Fetch Live Data
  const client = await getGraphQLClient();
  let data: any = null;
  try {
    data = await client.request(GET_DASHBOARD_METRICS, {
      timeRange: "24h",
      areaId: "global"
    });
  } catch (error) {
    console.error("GraphQL Fetch Error:", error);
  }

  const summary = data?.dashboardSummary || { overallReliabilityScore: 0, activeHighRiskAreas: 0, totalActiveAlerts: 0 };
  const priorityAreas = data?.priorityAreas || [];
  const anomalies = data?.anomalyTimeline || [];

  return (
    <div className="space-y-8 max-w-7xl mx-auto p-8">
      {/* Welcome Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-emerald-600 to-emerald-700 p-8 text-white shadow-xl">
        <div className="absolute -right-10 -bottom-10 h-64 w-64 rounded-full bg-white/10 blur-2xl"></div>
        <div className="relative z-10">
          <span className="inline-block rounded-full bg-white/20 px-3 py-1 text-xs font-semibold uppercase tracking-wider mb-3">
            {role} Command Center
          </span>
          <h1 className="text-3xl font-extrabold tracking-tight capitalize">
            Welcome back, {username}
          </h1>
          <p className="mt-2 text-emerald-100 max-w-xl text-sm leading-relaxed">
            Live telemetry data synchronized via Dashboard BFF. Monitor real-time grid reliability scores and priority areas below.
          </p>
        </div>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="liquid-panel p-6 border border-gray-100">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-sm font-semibold text-gray-500">Overall Reliability</h3>
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <Activity className="h-5 w-5" />
            </div>
          </div>
          <div className="text-3xl font-bold text-gray-900">{summary.overallReliabilityScore.toFixed(1)}</div>
          <p className="text-xs text-gray-500 mt-2">Aggregate score across all feeders</p>
        </div>
        
        <div className="liquid-panel p-6 border border-gray-100">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-sm font-semibold text-gray-500">High Risk Areas</h3>
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-amber-600">
              <AlertTriangle className="h-5 w-5" />
            </div>
          </div>
          <div className="text-3xl font-bold text-gray-900">{summary.activeHighRiskAreas}</div>
          <p className="text-xs text-gray-500 mt-2">Areas requiring immediate attention</p>
        </div>

        <div className="liquid-panel p-6 border border-gray-100">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-sm font-semibold text-gray-500">Active Alerts</h3>
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-blue-600">
              <Zap className="h-5 w-5" />
            </div>
          </div>
          <div className="text-3xl font-bold text-gray-900">{summary.totalActiveAlerts}</div>
          <p className="text-xs text-gray-500 mt-2">Unacknowledged events detected</p>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Feeder Status Overview */}
        <div className="lg:col-span-2 liquid-panel p-6 border border-gray-100">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-gray-900">Priority Areas</h2>
          </div>
          
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm whitespace-nowrap">
              <thead className="uppercase tracking-wider border-b border-gray-100 text-gray-500">
                <tr>
                  <th className="pb-3 px-4 font-semibold">Area / Feeder</th>
                  <th className="pb-3 px-4 font-semibold">Urgency Rank</th>
                  <th className="pb-3 px-4 font-semibold">Risk Score</th>
                  <th className="pb-3 px-4 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {priorityAreas.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-gray-500">
                      No priority areas flagged.
                    </td>
                  </tr>
                ) : (
                  priorityAreas.map((area: any) => (
                    <tr key={area.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                      <td className="py-4 px-4 font-medium text-gray-900">{area.name}</td>
                      <td className="py-4 px-4 text-gray-600">#{area.urgencyRank}</td>
                      <td className="py-4 px-4 font-bold text-gray-700">{area.riskScore.toFixed(1)}</td>
                      <td className="py-4 px-4">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                          area.status === 'CRITICAL' ? 'bg-red-100 text-red-700' :
                          area.status === 'WARNING' ? 'bg-amber-100 text-amber-700' :
                          'bg-emerald-100 text-emerald-700'
                        }`}>
                          {area.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Anomaly Timeline */}
        <div className="liquid-panel p-6 border border-gray-100">
          <h2 className="text-xl font-bold text-gray-900 mb-6">Anomaly Events</h2>
          
          {anomalies.length === 0 ? (
            <div className="py-8 text-center text-gray-500 flex flex-col items-center">
              <CheckCircle className="h-10 w-10 text-emerald-400 mb-2" />
              <p>No recent anomalies detected.</p>
            </div>
          ) : (
            <div className="relative border-l border-emerald-200 ml-3 space-y-6">
              {anomalies.map((anomaly: any) => (
                <div key={anomaly.id} className="pl-6 relative">
                  <div className={`absolute w-3 h-3 rounded-full -left-[6.5px] top-1.5 border-2 border-white ${
                    anomaly.severity === 'HIGH' ? 'bg-red-500' :
                    anomaly.severity === 'MEDIUM' ? 'bg-amber-500' :
                    'bg-blue-500'
                  }`}></div>
                  
                  <div className="flex justify-between items-start mb-1">
                    <h4 className="font-semibold text-gray-900 text-sm">{anomaly.eventType}</h4>
                    <span className="text-xs text-gray-500">
                      {new Date(anomaly.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  
                  <p className="text-xs font-medium text-gray-600 mb-1 border border-gray-100 inline-block px-2 py-0.5 rounded-md bg-gray-50">
                    {anomaly.areaId}
                  </p>
                  <p className="text-sm text-gray-600 line-clamp-2">
                    {anomaly.description}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}