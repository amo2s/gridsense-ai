import { NextRequest } from "next/server";
import { cookies } from "next/headers";

const GATEWAY_URL = process.env.BACKEND_API_URL || "http://localhost:8080";

/**
 * ============================================================================
 * REDIS ALERTS SSE PROXY STREAM (PHASE 2 - STEP 2.3)
 * ============================================================================
 * Subscribes to the Redis stream `gridsense:alerts:stream` via the Go API Gateway
 * or provides a persistent Server-Sent Events (SSE) connection for event-driven
 * cache invalidation.
 *
 * Emits real-time alert events with { feeder_id, severity, timestamp, is_critical }.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const targetFeederId = searchParams.get("feeder_id");
  const simulateMode = searchParams.get("simulate");

  const encoder = new TextEncoder();

  // If a simulation trigger is provided in the query params (e.g. for testing)
  if (simulateMode === "critical" && targetFeederId) {
    const stream = new ReadableStream({
      start(controller) {
        const payload = JSON.stringify({
          stream_id: `alert-${Date.now()}`,
          feeder_id: targetFeederId,
          severity: "CRITICAL",
          is_critical: true,
          message: "Critical multivariate anomaly threshold breach detected by Engine C.",
          timestamp: new Date().toISOString(),
        });
        controller.enqueue(encoder.encode(`event: alert\ndata: ${payload}\n\n`));
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  }

  // Extract auth token
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
    Accept: "text/event-stream",
  };
  if (authToken) {
    forwardHeaders["Authorization"] = `Bearer ${authToken}`;
  }

  // Attempt upstream connection to Go Gateway SSE route
  try {
    const upstreamUrl = `${GATEWAY_URL}/api/v1/alerts/stream`;
    const gatewayRes = await fetch(upstreamUrl, {
      headers: forwardHeaders,
      cache: "no-store",
    });

    if (gatewayRes.ok && gatewayRes.body) {
      return new Response(gatewayRes.body, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        },
      });
    }
  } catch (err) {
    // If gateway SSE is offline, provide a managed local fallback stream
  }

  // Managed fallback stream with heartbeat to keep connection alive
  const stream = new ReadableStream({
    start(controller) {
      // Send initial connection confirmation
      controller.enqueue(
        encoder.encode(
          `: connected to gridsense:alerts:stream fallback\nevent: ping\ndata: {"status":"connected"}\n\n`
        )
      );

      // Heartbeat every 15s to prevent browser timeout
      const interval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: heartbeat\n\n`));
        } catch {
          clearInterval(interval);
        }
      }, 15000);

      req.signal.addEventListener("abort", () => {
        clearInterval(interval);
        try {
          controller.close();
        } catch {}
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
