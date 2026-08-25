import { cookies } from "next/headers";
import Link from "next/link";
import { Users, Activity, ShieldCheck, ArrowRight, Clock, CheckCircle2, Zap } from "lucide-react";

// Server-side JWT payload decoder to fetch real user state
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
  const isAdminOrManager = ["ADMIN", "MANAGER"].includes(role.toUpperCase());
  const username = email ? email.split("@")[0] : "Operator";

  return (
    <div className="space-y-8">
      {/* Welcome Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-green-600 to-green-700 p-8 text-white shadow-xl">
        <div className="absolute -right-10 -bottom-10 h-64 w-64 rounded-full bg-white/10 blur-2xl"></div>
        <div className="relative z-10">
          <span className="inline-block rounded-full bg-white/20 px-3 py-1 text-xs font-semibold uppercase tracking-wider mb-3">
            {role} Command Center
          </span>
          <h1 className="text-3xl font-extrabold tracking-tight capitalize">
            Welcome back, {username}
          </h1>
          <p className="mt-2 text-green-100 max-w-xl text-sm leading-relaxed">
            GridSense AI intelligence and authentication nodes are fully synchronized. Monitor real-time grid reliability scores and manage administrative permissions below.
          </p>
        </div>
      </div>

      {/* Bento Grid Layout */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        
        {/* Card 1: Role-Specific Action Card */}
        {isAdminOrManager ? (
          <div className="rounded-2xl bg-white/60 backdrop-blur-xl border border-white/80 p-6 shadow-[0_8px_30px_rgba(21,128,61,0.04)] flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-green-100 text-green-700">
                  <Users className="h-6 w-6" />
                </div>
                <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
                  Action Required
                </span>
              </div>
              <h3 className="text-lg font-bold text-green-900">Staff Requests</h3>
              <p className="text-sm text-green-800/70 mt-1">
                Review and approve pending staff account registrations directly from the Supabase database.
              </p>
            </div>
            <Link 
              href="/dashboard/requests"
              className="mt-6 flex items-center justify-between rounded-xl bg-green-600 px-4 py-3 text-sm font-semibold text-white shadow-md hover:bg-green-700 transition-colors"
            >
              <span>Manage Requests</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        ) : (
          <div className="rounded-2xl bg-white/60 backdrop-blur-xl border border-white/80 p-6 shadow-[0_8px_30px_rgba(21,128,61,0.04)] flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-green-100 text-green-700">
                  <ShieldCheck className="h-6 w-6" />
                </div>
                <span className="rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-800">
                  Status: Active
                </span>
              </div>
              <h3 className="text-lg font-bold text-green-900">Account Access</h3>
              <p className="text-sm text-green-800/70 mt-1">
                Your account is authenticated with the Go security gateway. Awaiting admin privilege elevation if necessary.
              </p>
            </div>
            <div className="mt-6 rounded-xl bg-green-50 px-4 py-3 text-xs font-medium text-green-800 border border-green-200">
              Role: {role}
            </div>
          </div>
        )}

        {/* Card 2: System Telemetry Snapshot */}
        <div className="rounded-2xl bg-white/60 backdrop-blur-xl border border-white/80 p-6 shadow-[0_8px_30px_rgba(21,128,61,0.04)] flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-green-100 text-green-700">
                <Activity className="h-6 w-6" />
              </div>
              <span className="flex h-2.5 w-2.5 rounded-full bg-green-500 animate-pulse"></span>
            </div>
            <h3 className="text-lg font-bold text-green-900">Grid Engine A</h3>
            <p className="text-sm text-green-800/70 mt-1">
              Deterministic reliability scoring microservice is live and operational.
            </p>
          </div>
          <div className="mt-6 flex items-center gap-3 rounded-xl bg-white/80 px-4 py-3 border border-green-100">
            <Zap className="h-5 w-5 text-green-600 shrink-0" />
            <div className="flex flex-col truncate">
              <span className="text-xs font-bold text-green-900">FEEDER_TEST_01</span>
              <span className="text-[10px] text-green-700">Score: 90 / STABLE</span>
            </div>
          </div>
        </div>

        {/* Card 3: Security & Gateway Audit */}
        <div className="rounded-2xl bg-white/60 backdrop-blur-xl border border-white/80 p-6 shadow-[0_8px_30px_rgba(21,128,61,0.04)] flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-green-100 text-green-700">
                <Clock className="h-6 w-6" />
              </div>
              <span className="rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-800">
                Secure Session
              </span>
            </div>
            <h3 className="text-lg font-bold text-green-900">Gateway Audit</h3>
            <p className="text-sm text-green-800/70 mt-1">
              Requests routed through Go Chi router with Redis session validation.
            </p>
          </div>
          <div className="mt-6 flex items-center gap-2 text-xs text-green-700 font-medium">
            <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
            <span>Cookies encrypted & verified</span>
          </div>
        </div>

      </div>
    </div>
  );
}