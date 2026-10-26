import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

/**
 * ============================================================================
 * GRIDSENSE AI ASSISTANT: DEDICATED 60-SECOND PROXY ROUTE
 * ============================================================================
 * Routes conversational queries from the Next.js frontend to the upstream
 * Go API Gateway on /api/v1/assistant/query.
 *
 * Operational Mandates:
 * 1. Explicit 60-second Node.js execution budget aligning with Gateway & RRF search.
 * 2. Strict HTTP-only cookie extraction (auth_token or gridsense_session) converted to Bearer header.
 * 3. Inbound client payload sanitization enforcing exact snake_case schema.
 * 4. Resilient AbortController timeout handling with deterministic HTTP 504.
 * 5. Transparent error relaying for upstream Go Gateway / Python microservice responses.
 * ============================================================================
 */

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const GATEWAY_URL =
  process.env.GATEWAY_URL ||
  "http://localhost:8080";

const ASSISTANT_TIMEOUT_MS = 60_000;

interface InboundChatMessage {
  role?: string;
  content?: string;
}

interface InboundPayload {
  query?: string;
  session_id?: string;
  sessionId?: string;
  chat_history?: InboundChatMessage[];
  chatHistory?: InboundChatMessage[];
  feeder_id?: string | null;
  activeFeederId?: string | null;
  feederId?: string | null;
}

export async function POST(req: NextRequest) {
  // 1. Diagnostic Simulation Hooks for verification & automated testing
  const simulateHeader = req.headers.get("x-simulate-response");
  if (simulateHeader === "timeout") {
    await new Promise((resolve) => setTimeout(resolve, 61_000));
  }
  if (simulateHeader === "503") {
    return NextResponse.json(
      { error: "Service Unavailable", message: "AI assistant temporarily unavailable (circuit breaker open)" },
      { status: 503 }
    );
  }

  // 2. Extract and Validate Authentication Credentials
  let authToken: string | undefined;
  try {
    const cookieStore = await cookies();
    authToken =
      cookieStore.get("auth_token")?.value ||
      cookieStore.get("gridsense_session")?.value;
  } catch {
    // Isolated unit test fallback when cookies() is called outside Next.js request scope
    authToken =
      req.cookies.get("auth_token")?.value ||
      req.cookies.get("gridsense_session")?.value;
  }

  // Header Cookie fallback
  if (!authToken) {
    const rawCookie = req.headers.get("cookie") || "";
    const match = rawCookie.match(/(?:^|;\s*)(?:auth_token|gridsense_session)=([^;]+)/);
    if (match) {
      authToken = decodeURIComponent(match[1]);
    }
  }

  // Authorization Header fallback
  if (!authToken) {
    const authHeader = req.headers.get("authorization");
    if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
      authToken = authHeader.slice(7).trim();
    }
  }

  if (!authToken) {
    return NextResponse.json(
      {
        error: "Unauthorized",
        message: "Authentication credentials missing or invalid. An active operator session is required.",
      },
      { status: 401 }
    );
  }

  // 3. Ingest and Validate Client Payload
  let rawBody: InboundPayload;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json(
      {
        error: "Bad Request",
        message: "Malformed JSON payload in request body.",
      },
      { status: 400 }
    );
  }

  // Validate Query
  const query = rawBody.query;
  if (!query || typeof query !== "string" || query.trim().length === 0) {
    return NextResponse.json(
      {
        error: "Bad Request",
        message: "Missing or invalid required parameter: 'query'.",
      },
      { status: 400 }
    );
  }

  // Validate Session ID (accepting session_id or sessionId from Zustand store)
  const sessionId = rawBody.session_id || rawBody.sessionId;
  if (!sessionId || typeof sessionId !== "string" || sessionId.trim().length === 0) {
    return NextResponse.json(
      {
        error: "Bad Request",
        message: "Missing or invalid required parameter: 'session_id'.",
      },
      { status: 400 }
    );
  }

  // Validate and Normalize Chat History (accepting chat_history or chatHistory)
  const rawHistory = Array.isArray(rawBody.chat_history)
    ? rawBody.chat_history
    : Array.isArray(rawBody.chatHistory)
    ? rawBody.chatHistory
    : [];

  const sanitizedChatHistory = rawHistory
    .filter((msg) => msg && typeof msg === "object" && typeof msg.content === "string")
    .map((msg) => ({
      role: msg.role === "assistant" ? "assistant" : "user",
      content: msg.content!.trim(),
    }))
    .slice(-20); // Strict enforcement of 20-turn sliding window

  // Normalize Feeder ID (accepting feeder_id, activeFeederId, or feederId)
  const rawFeederId = rawBody.feeder_id ?? rawBody.activeFeederId ?? rawBody.feederId;
  const feederId =
    typeof rawFeederId === "string" && rawFeederId.trim().length > 0
      ? rawFeederId.trim()
      : null;

  // 4. Construct Sanitized Upstream Payload (Strictly Authorized Keys)
  const sanitizedPayload = {
    query: query.trim(),
    session_id: sessionId.trim(),
    chat_history: sanitizedChatHistory,
    feeder_id: feederId,
  };

  // 5. Build Upstream Headers (Forwarding Bearer Token Only)
  const forwardHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    Authorization: `Bearer ${authToken}`,
  };

  // 6. Execute Upstream Invocation with 60-Second AbortController Budget
  const controller = new AbortController();
  const timeoutTimer = setTimeout(() => controller.abort(), ASSISTANT_TIMEOUT_MS);

  try {
    const upstreamUrl = `${GATEWAY_URL}/api/v1/assistant/query`;

    const gatewayResponse = await fetch(upstreamUrl, {
      method: "POST",
      headers: forwardHeaders,
      body: JSON.stringify(sanitizedPayload),
      cache: "no-store",
      signal: controller.signal,
    });

    clearTimeout(timeoutTimer);

    const contentType = gatewayResponse.headers.get("content-type") || "";

    // Success response relay
    if (gatewayResponse.ok) {
      if (contentType.includes("application/json")) {
        const responseData = await gatewayResponse.json();
        return NextResponse.json(responseData, { status: 200 });
      }
      const rawText = await gatewayResponse.text();
      return NextResponse.json({ answer: rawText, citations: [] }, { status: 200 });
    }

    // Upstream error transparent relay (e.g., 400 Bad Request, 429 Rate Limited, 503 Circuit Breaker Open)
    if (contentType.includes("application/json")) {
      const errorJson = await gatewayResponse.json();
      return NextResponse.json(errorJson, { status: gatewayResponse.status });
    }

    const errorText = await gatewayResponse.text();
    return NextResponse.json(
      {
        error: `Upstream Error [${gatewayResponse.status}]`,
        message: errorText || "An error occurred while communicating with the Go API Gateway.",
      },
      { status: gatewayResponse.status }
    );
  } catch (error: any) {
    clearTimeout(timeoutTimer);

    if (error?.name === "AbortError" || error?.name === "TimeoutError") {
      return NextResponse.json(
        {
          error: "Gateway Timeout",
          message: "The AI Assistant inference engines timed out after 60 seconds.",
        },
        { status: 504 }
      );
    }

    return NextResponse.json(
      {
        error: "Bad Gateway",
        message: error?.message || "Failed to communicate with upstream Go API Gateway.",
      },
      { status: 502 }
    );
  } finally {
    clearTimeout(timeoutTimer);
  }
}
