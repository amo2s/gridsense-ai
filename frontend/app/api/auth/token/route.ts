import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

/**
 * Authentication Bridge Route
 * Server-side route that reads the HttpOnly session cookie (auth_token or gridsense_session)
 * and returns the raw JWT string in a JSON response ({ "token": "..." }) for cross-origin
 * WebSocket client authentication.
 */
export async function GET() {
  try {
    const cookieStore = await cookies();
    const token =
      cookieStore.get("auth_token")?.value ||
      cookieStore.get("gridsense_session")?.value;

    if (!token) {
      return NextResponse.json(
        { error: "Unauthorized", message: "No active session cookie found" },
        { status: 401 }
      );
    }

    return NextResponse.json({ token });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Internal Server Error", message: err?.message || "Failed to retrieve session token" },
      { status: 500 }
    );
  }
}
