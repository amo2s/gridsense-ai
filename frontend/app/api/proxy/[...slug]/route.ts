import { NextRequest, NextResponse } from "next/server";

// --- Backend targets ---
const AUTH_SERVICE_URL = process.env.AUTH_API_URL || "http://localhost:8081";
const GATEWAY_URL = process.env.BACKEND_API_URL || "http://localhost:8080";

// --- Request size limit ---
const MAX_REQUEST_BYTES = 10 * 1024 * 1024; // 10MB — adjust to fit your largest legitimate payload

// --- Backend fetch timeout ---
const BACKEND_TIMEOUT_MS = 15_000; // 15s — adjust per your slowest legitimate endpoint

/**
 * Path-based router: decides which upstream service owns a given request.
 * Add new prefixes here as new services come online.
 */
function resolveBackend(targetPath: string): string {
  const firstSegment = targetPath.split("/")[0];

  if (firstSegment === "auth" || firstSegment === "admin") {
    return AUTH_SERVICE_URL;
  }

  // Everything else (grid telemetry, Engine A routes, etc.) goes to the general gateway
  return GATEWAY_URL;
}

async function proxyHandler(
  req: NextRequest,
  context: { params: Promise<{ slug: string[] }> }
) {
  try {
    const { slug } = await context.params;
    const targetPath = slug.join("/");
    const searchParams = req.nextUrl.search;

    const backendBase = resolveBackend(targetPath);
    const targetUrl = `${backendBase}/api/${targetPath}${searchParams}`;

    // 1. Forward incoming headers while stripping hop-by-hop metadata
    const forwardHeaders = new Headers();
    req.headers.forEach((value, key) => {
      const lowerKey = key.toLowerCase();
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

    // 3. Dispatch forward request to the resolved backend
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

    // 4. Build response headers and correctly handle cookies
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