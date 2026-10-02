import { NextRequest, NextResponse } from "next/server";

// --- Single upstream target ---
// All traffic (auth, admin, and data routes) goes through the Go API Gateway,
// which internally proxies to the Auth Microservice for /api/auth/* and /api/admin/*.
// Source: gateway/cmd/api/main.go L139-140:
//   mux.Handle("/api/auth/", ... authHandler.ProxyRequest)
//   mux.Handle("/api/admin/", ... authHandler.ProxyRequest)
//
// In production this points at the Hugging Face Space deployment.
// In local development it points at the local Gateway process.
const GATEWAY_URL =
  process.env.BACKEND_API_URL || "https://sliverboy-heal-her-backend.hf.space";

// --- Request size limit ---
const MAX_REQUEST_BYTES = 10 * 1024 * 1024; // 10MB

// --- Backend fetch timeout ---
const BACKEND_TIMEOUT_MS = 15_000; // 15s

async function proxyHandler(
  req: NextRequest,
  context: { params: Promise<{ slug: string[] }> }
) {
  try {
    const { slug } = await context.params;
    const targetPath = slug.join("/");
    const searchParams = req.nextUrl.search;

    const targetUrl = targetPath === "healthz"
      ? `${GATEWAY_URL}/${targetPath}${searchParams}`
      : `${GATEWAY_URL}/api/${targetPath}${searchParams}`;

    // 1. Forward incoming headers, strip hop-by-hop metadata
    const forwardHeaders = new Headers();
    req.headers.forEach((value, key) => {
      const lowerKey = key.toLowerCase();
      // Always forward Cookie — the Gateway relies on auth_token + refresh_token.
      // Strip only transport-layer headers that must not be forwarded.
      if (!["host", "connection", "content-length"].includes(lowerKey)) {
        forwardHeaders.set(key, value);
      }
    });

    // 2. Extract request body for mutation methods
    let requestBody: BodyInit | null = null;
    if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
      const declaredLength = req.headers.get("content-length");
      if (declaredLength && Number(declaredLength) > MAX_REQUEST_BYTES) {
        return NextResponse.json(
          {
            error: "Payload Too Large",
            message: `Request body exceeds the ${MAX_REQUEST_BYTES / (1024 * 1024)}MB limit.`,
          },
          { status: 413 }
        );
      }

      const contentType = req.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const json = await req.json().catch(() => null);
        if (json) {
          const serialized = JSON.stringify(json);
          if (Buffer.byteLength(serialized, "utf8") > MAX_REQUEST_BYTES) {
            return NextResponse.json(
              {
                error: "Payload Too Large",
                message: `Request body exceeds the ${MAX_REQUEST_BYTES / (1024 * 1024)}MB limit.`,
              },
              { status: 413 }
            );
          }
          requestBody = serialized;
        }
      } else {
        const blob = await req.blob().catch(() => null);
        if (blob && blob.size > 0) {
          if (blob.size > MAX_REQUEST_BYTES) {
            return NextResponse.json(
              {
                error: "Payload Too Large",
                message: `Request body exceeds the ${MAX_REQUEST_BYTES / (1024 * 1024)}MB limit.`,
              },
              { status: 413 }
            );
          }
          requestBody = blob;
        }
      }
    }

    // 3. Dispatch forward request to the Gateway
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), BACKEND_TIMEOUT_MS);

    let backendResponse: Response;
    try {
      backendResponse = await fetch(targetUrl, {
        method: req.method,
        headers: forwardHeaders,
        body: requestBody,
        cache: "no-store",
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    // 4. Build response headers with correct Set-Cookie handling.
    // The Go login handler sets TWO cookies (login/handler.go L72-98):
    //   - "auth_token"    (Path="/",               SameSite=Lax,    15 min)
    //   - "refresh_token" (Path="/api/auth/refresh", SameSite=Strict, 7 days)
    // getSetCookie() is required (not headers.get('set-cookie')) to preserve
    // multiple Set-Cookie entries which would otherwise be collapsed into one.
    const responseHeaders = new Headers();

    if (typeof backendResponse.headers.getSetCookie === "function") {
      const cookies = backendResponse.headers.getSetCookie();
      cookies.forEach((cookie) => {
        responseHeaders.append("set-cookie", cookie);
      });
    }

    backendResponse.headers.forEach((value, key) => {
      if (key.toLowerCase() !== "set-cookie") {
        responseHeaders.set(key, value);
      }
    });

    const responseBody = await backendResponse.arrayBuffer();

    return new NextResponse(responseBody, {
      status: backendResponse.status,
      statusText: backendResponse.statusText,
      headers: responseHeaders,
    });
  } catch (err: any) {
    if (err?.name === "AbortError") {
      console.error("Gateway proxy error: backend timed out");
      return NextResponse.json(
        {
          error: "Gateway Timeout",
          message: "The backend microservice took too long to respond.",
        },
        { status: 504 }
      );
    }

    console.error("Gateway proxy error:", err);
    return NextResponse.json(
      {
        error: "Bad Gateway",
        message: "Unable to establish connection to the backend microservice.",
      },
      { status: 502 }
    );
  }
}

// Export supported HTTP methods
export const GET = proxyHandler;
export const POST = proxyHandler;
export const PUT = proxyHandler;
export const PATCH = proxyHandler;
export const DELETE = proxyHandler;