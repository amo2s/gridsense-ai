import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

const GATEWAY_URL = process.env.BACKEND_API_URL || "http://localhost:8080";
const BACKEND_TIMEOUT_MS = 10_000;

/**
 * ============================================================================
 * ENGINE B PREDICTION SUMMARY PROXY ROUTE (QUERY PATHWAY)
 * ============================================================================
 * Provides read-only access to the latest materialized risk prediction record
 * from the Go API Gateway (PostgreSQL `risk_predictions` table).
 * 
 * Enforces strict CQRS isolation: Completely decoupled from the Command Pathway
 * manual ingestion route. Injects secure httpOnly session credentials.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const feederId = searchParams.get("feeder_id");

    if (!feederId) {
      return NextResponse.json(
        {
          error: "Bad Request",
          message: "Query parameter 'feeder_id' is required.",
        },
        { status: 400 }
      );
    }

    // Extract authorization credentials from httpOnly cookies or headers
    const cookieStore = await cookies();
    let authToken = cookieStore.get("auth_token")?.value;

    if (!authToken) {
      const rawCookie = req.headers.get("cookie") || "";
      const match = rawCookie.match(/(?:^|;\s*)auth_token=([^;]+)/);
      if (match) {
        authToken = decodeURIComponent(match[1]);
      }
    }

    const forwardHeaders: Record<string, string> = {
      Accept: "application/json",
    };

    if (authToken) {
      forwardHeaders["Authorization"] = `Bearer ${authToken}`;
    } else if (req.headers.get("authorization")) {
      forwardHeaders["Authorization"] = req.headers.get("authorization")!;
    }

    const controller = new AbortController();
    const timeoutTimer = setTimeout(() => controller.abort(), BACKEND_TIMEOUT_MS);

    try {
      const upstreamUrl = `${GATEWAY_URL}/api/v1/prediction/summary?feeder_id=${encodeURIComponent(feederId)}`;
      const gatewayResponse = await fetch(upstreamUrl, {
        method: "GET",
        headers: forwardHeaders,
        cache: "no-store",
        signal: controller.signal,
      });

      clearTimeout(timeoutTimer);

      const contentType = gatewayResponse.headers.get("content-type") || "";

      // Return exact status and body from Gateway, preserving 404s
      if (contentType.includes("application/json")) {
        const responseData = await gatewayResponse.json();
        return NextResponse.json(responseData, {
          status: gatewayResponse.status,
        });
      }

      const responseText = await gatewayResponse.text();
      return new NextResponse(responseText, {
        status: gatewayResponse.status,
        headers: {
          "Content-Type": contentType || "text/plain",
        },
      });
    } catch (networkError: any) {
      clearTimeout(timeoutTimer);

      if (networkError.name === "AbortError") {
        return NextResponse.json(
          {
            error: "Gateway Timeout",
            message: "The Go Gateway timed out while querying materialized predictions.",
            status: 504,
          },
          { status: 504 }
        );
      }

      return NextResponse.json(
        {
          error: "Bad Gateway",
          message: "Failed to establish network connection with Go Gateway.",
          detail: networkError.message,
          status: 502,
        },
        { status: 502 }
      );
    }
  } catch (err: any) {
    return NextResponse.json(
      {
        error: "Internal Server Error",
        message: "An unexpected error occurred in the Next.js prediction summary proxy.",
        detail: err.message,
      },
      { status: 500 }
    );
  }
}
