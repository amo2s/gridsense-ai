import { cookies } from "next/headers";
import Topbar from "@/components/dashboard/topbar";
import Sidebar from "@/components/dashboard/sidebar"; // Adjust path if your components are in a different folder
import QueryProvider from "@/providers/query-provider";
import { decodeJwt, JWTPayload } from "jose";
import { AmbientEdgeGlow } from "@/components/dashboard/ambient-edge-glow";
import { PageTransition } from "@/components/dashboard/page-transition";

interface OperatorClaims extends JWTPayload {
  email?: string;
  role?: string;
  name?: string;
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // 1. Extract the secure cookie
  const cookieStore = await cookies();
  const token = cookieStore.get("gridsense_session")?.value || cookieStore.get("auth_token")?.value;

  // 2. Safe default unauthenticated values
  let email = "guest@gridsense.ai";
  let role = "Read-Only";
  let name = "Guest Operator";

  // 3. Decode the JWT and verify
  if (token) {
    try {
      const payload = decodeJwt(token) as OperatorClaims;
      
      const currentTimeInSeconds = Math.floor(Date.now() / 1000);
      if (!payload.exp || payload.exp >= currentTimeInSeconds) {
        email = payload.email || email;
        role = payload.role || role;
        name = payload.name || name;
      }
    } catch (e) {
      // Invalid token falls back to safe defaults automatically
    }
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-50 text-slate-900 selection:bg-green-200 relative">
      <AmbientEdgeGlow />
      {/* Dynamic Sidebar Injection */}
      <Sidebar email={email} role={role} />

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col overflow-hidden relative">
        {/* Topbar */}
        <Topbar email={email} role={role} name={name} />

        {/* Page Content Viewport */}
        <main className="flex-1 overflow-y-auto p-6 md:p-8 bg-gradient-to-br from-white to-slate-50 relative z-10">
          <div className="mx-auto max-w-7xl h-full">
            <QueryProvider token={token || ""}>
              <PageTransition>
                {children}
              </PageTransition>
            </QueryProvider>
          </div>
        </main>
      </div>
    </div>
  );
}