import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

const GATEWAY_URL = process.env.BACKEND_API_URL || "http://localhost:8080";
const BACKEND_TIMEOUT_MS = 15_000;

/**
 * ============================================================================
 * ENGINE B INGESTION PROXY ROUTE (COMMAND PATHWAY)
 * ============================================================================
 * Receives validated manual 24-hour telemetry payloads from the frontend
 * and securely forwards them to the internal Go API Gateway on /api/v1/prediction/ingest.
 * 
 * Ensures the browser never talks directly to internal backend microservices.
 * Injects authenticated JWT session credentials from httpOnly cookies.
 */
export async function POST(req: NextRequest) {
  try {
    let payload: unknown;
    try {
      payload = await req.json();
    } catch {
      return NextResponse.json(
        {
          error: "Invalid JSON",
          message: "The request body could not be parsed as valid JSON.",
        },
        { status: 400 }
      );
    }

    // Extract authorization credentials from httpOnly cookies or headers
    const cookieStore = await cookies();
    let authToken = cookieStore.get("auth_token")?.value;

    if (!authToken) {
      // Fallback extraction from raw cookie header
      const rawCookie = req.headers.get("cookie") || "";
      const match = rawCookie.match(/(?:^|;\s*)auth_token=([^;]+)/);
      if (match) {
        authToken = decodeURIComponent(match[1]);
      }
    }

    // Build strictly enforced headers for upstream Go Gateway
    const forwardHeaders: Record<string, string> = {
      "Content-Type": "application/json",
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
      const upstreamUrl = `${GATEWAY_URL}/api/v1/prediction/ingest`;
      const gatewayResponse = await fetch(upstreamUrl, {
        method: "POST",
        headers: forwardHeaders,
        body: JSON.stringify(payload),
        cache: "no-store",
        signal: controller.signal,
      });

      clearTimeout(timeoutTimer);

      const contentType = gatewayResponse.headers.get("content-type") || "";

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
            message: "The upstream Go Gateway timed out while processing manual telemetry ingestion.",
            status: 504,
          },
          { status: 504 }
        );
      }

      return NextResponse.json(
        {
          error: "Bad Gateway",
          message: "Failed to establish network connection with upstream Go Gateway.",
          detail: networkError.message,
          status: 502,
        },
        { status: 502 }
      );
    }
  } catch (unexpectedError: any) {
    return NextResponse.json(
      {
        error: "Internal Server Error",
        message: "An unexpected error occurred in the Next.js ingestion proxy.",
        detail: unexpectedError.message,
      },
      { status: 500 }
    );
  }
}
