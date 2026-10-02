import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Topbar from "@/components/dashboard/topbar";
import Sidebar from "@/components/dashboard/sidebar"; // Adjust path if your components are in a different folder
import GraphQLProvider from "@/components/providers/graphql-provider";
import { decodeOperatorToken } from "@/utils/jwt";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // 1. Extract the secure cookie
  // IMPORTANT: Change "auth_token" to the exact cookie name set by your Go login handler
  const cookieStore = await cookies();
  const token = cookieStore.get("auth_token")?.value;

  // 2. Initial Security Gate: No token present
  if (!token) {
    redirect("/portal");
  }

  // 3. Decode the JWT
  const payload = decodeOperatorToken(token);

  // 4. Secondary Security Gate: Invalid token format or expired token
  if (!payload || !payload.exp) {
    redirect("/portal");
  }

  const currentTimeInSeconds = Math.floor(Date.now() / 1000);
  if (payload.exp < currentTimeInSeconds) {
    redirect("/portal"); // Session expired
  }

  // 5. Extract strictly typed credentials
  const email = payload.email || "";
  const role = payload.role || "STAFF";
  const name = payload.name || "";

  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-50 text-slate-900 selection:bg-green-200">
      {/* Dynamic Sidebar Injection */}
      <Sidebar email={email} role={role} />

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col overflow-hidden relative">
        {/* Topbar */}
        <Topbar email={email} role={role} name={name} />

        {/* Page Content Viewport */}
        <main className="flex-1 overflow-y-auto p-6 md:p-8 bg-gradient-to-br from-white to-slate-50">
          <div className="mx-auto max-w-7xl">
            <GraphQLProvider token={token}>
              {children}
            </GraphQLProvider>
          </div>
        </main>
      </div>
    </div>
  );
}