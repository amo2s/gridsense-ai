import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Topbar from "@/components/dashboard/topbar";
import Sidebar from "@/components/dashboard/sidebar"; // Adjust path if your components are in a different folder

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const headersList = await headers();
  
  const userId = headersList.get("x-user-id");
  const email = headersList.get("x-user-email") || "";
  const role = headersList.get("x-user-role") || "STAFF";

  // Immediate Authorization Gate backed by Edge Middleware
  if (!userId) {
    redirect("/portal");
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-50 text-slate-900 selection:bg-green-200">
      {/* Dynamic Sidebar Injection */}
      <Sidebar email={email} role={role} />
      
      {/* Main Content Area */}
      <div className="flex flex-1 flex-col overflow-hidden relative">
        {/* Topbar */}
        <Topbar email={email} role={role} />
        
        {/* Page Content Viewport */}
        <main className="flex-1 overflow-y-auto p-6 md:p-8 bg-gradient-to-br from-white to-slate-50">
          <div className="mx-auto max-w-7xl">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}