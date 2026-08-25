import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Topbar from "@/components/dashboard/topbar";
import Sidebar from "@/components/dashboard/sidebar"; // Adjust path if your components are in a different folder

// Define the expected structure of your Go backend's JWT payload
interface JWTPayload {
  email: string;
  role: string;
  exp: number;
  [key: string]: any;
}

/**
 * Intelligently decodes the JWT payload without needing the secret key.
 * The secret key is only needed for signature validation, which your Go Gateway 
 * handles on API calls. We only need the payload for UI state.
 */
function decodeJwtPayload(token: string): JWTPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    
    const payloadBase64Url = parts[1];
    // Convert base64url to standard base64 and decode using Node's Buffer
    const base64 = payloadBase64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = Buffer.from(base64, "base64").toString("utf-8");
    
    return JSON.parse(jsonPayload);
  } catch (error) {
    console.error("Layout Security: Failed to parse JWT payload", error);
    return null;
  }
}

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
  const payload = decodeJwtPayload(token);

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