import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

const GATEWAY_URL = process.env.BACKEND_API_URL || "http://localhost:8080";

/**
 * Standard SSE response headers preventing intermediate buffering, compression,
 * or premature connection timeouts in Next.js, Nginx, or client browsers.
 */
const SSE_HEADERS: Record<string, string> = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform, no-store",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
  "Content-Encoding": "none",
};

// Global in-memory broadcast registry for persistent local SSE subscribers
type ClientController = ReadableStreamDefaultController<Uint8Array>;
const activeSubscribers = new Set<ClientController>();

function broadcastToSubscribers(data: any, eventType?: string) {
  const encoder = new TextEncoder();
  const payloadStr = typeof data === "string" ? data : JSON.stringify(data);
  const formatted = eventType
    ? `event: ${eventType}\ndata: ${payloadStr}\n\n`
    : `data: ${payloadStr}\n\n`;

  const encoded = encoder.encode(formatted);
  for (const controller of activeSubscribers) {
    try {
      controller.enqueue(encoded);
    } catch {
      activeSubscribers.delete(controller);
    }
  }
}

/**
 * ============================================================================
 * REDIS ALERTS SSE PROXY STREAM (PHASE 4 - PART 2)
 * ============================================================================
 * Sustains a long-lived, continuous Server-Sent Events stream from the Go Gateway
 * or local Redis subscriber. Fixes the 1000ms disconnect/re-poll bug by maintaining
 * open controllers, 15-second heartbeat pings, and non-buffering response headers.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const targetFeederId = searchParams.get("feeder_id");
  const simulateMode = searchParams.get("simulate");

  const encoder = new TextEncoder();

  // Extract auth token safely
  let authToken = req.cookies?.get("auth_token")?.value;

  if (!authToken) {
    try {
      const cookieStore = await cookies();
      authToken = cookieStore.get("auth_token")?.value;
    } catch {
      // Direct caller context without Next.js async storage
    }
  }

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
  if (!simulateMode) {
    try {
      const upstreamUrl = `${GATEWAY_URL}/api/v1/alerts/stream`;
      const gatewayRes = await fetch(upstreamUrl, {
        headers: forwardHeaders,
        cache: "no-store",
      });

      if (gatewayRes.ok && gatewayRes.body) {
        return new Response(gatewayRes.body, {
          headers: SSE_HEADERS,
        });
      }
    } catch (err) {
      // If gateway SSE is offline, provide the managed local fallback stream
    }
  }

  // Managed fallback stream with persistent heartbeats to keep connection alive indefinitely
  let clientController: ClientController | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      clientController = controller;
      activeSubscribers.add(controller);

      // Send initial connection handshake confirmation
      controller.enqueue(
        encoder.encode(
          `: connected to gridsense:alerts:stream\nevent: ping\ndata: {"status":"connected","timestamp":"${new Date().toISOString()}"}\n\n`
        )
      );

      // If a simulation trigger is requested, enqueue the alert immediately WITHOUT closing
      if (simulateMode === "critical" && targetFeederId) {
        const payload = JSON.stringify({
          stream_id: `alert-${Date.now()}`,
          id: `alert-${Date.now()}`,
          feeder_id: targetFeederId,
          severity: "CRITICAL",
          is_critical: true,
          message: `Critical multivariate anomaly threshold breach detected on Feeder ${targetFeederId}.`,
          timestamp: new Date().toISOString(),
        });
        controller.enqueue(encoder.encode(`event: alert\ndata: ${payload}\n\n`));
      }

      // Heartbeat comment every 15s to prevent browser/proxy connection timeouts
      const interval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: heartbeat ${new Date().toISOString()}\n\n`));
        } catch {
          clearInterval(interval);
          activeSubscribers.delete(controller);
        }
      }, 15000);

      // Cleanly teardown when client terminates EventSource connection
      req.signal.addEventListener("abort", () => {
        clearInterval(interval);
        activeSubscribers.delete(controller);
        try {
          controller.close();
        } catch {}
      });
    },
    cancel() {
      if (clientController) {
        activeSubscribers.delete(clientController);
      }
    },
  });

  return new Response(stream, {
    headers: SSE_HEADERS,
  });
}

/**
 * POST endpoint allowing simulated alert injection or test event dispatching
 * directly into the persistent SSE stream for live operator testing.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const alertPayload = {
      stream_id: body.stream_id || body.id || `alert-${Date.now()}`,
      id: body.id || body.stream_id || `alert-${Date.now()}`,
      feeder_id: body.feeder_id || "f47ac10b-58cc-4372-a567-0e02b2c3d479",
      substation_id: body.substation_id || "sub-central-01",
      severity: body.severity || "CRITICAL",
      is_critical: body.is_critical ?? (body.severity === "CRITICAL" || body.severity === "HIGH"),
      message: body.message || "Simulated grid anomaly threshold breach.",
      timestamp: body.timestamp || new Date().toISOString(),
    };

    // Broadcast both as named 'alert' event and standard data event for maximal compatibility
    broadcastToSubscribers(alertPayload, "alert");

    return NextResponse.json({
      success: true,
      broadcastedTo: activeSubscribers.size,
      alert: alertPayload,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Failed to broadcast alert event", details: err?.message },
      { status: 400 }
    );
  }
}
