import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_API_URL || "http://localhost:8081";

async function proxyHandler(
  req: NextRequest,
  context: { params: Promise<{ slug: string[] }> }
) {
  try {
    const { slug } = await context.params;
    const targetPath = slug.join("/");
    const searchParams = req.nextUrl.search;
    
    // Maps /api/proxy/auth/login -> http://localhost:8081/api/auth/login
    const targetUrl = `${BACKEND_URL}/api/${targetPath}${searchParams}`;

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
      const contentType = req.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const json = await req.json().catch(() => null);
        if (json) requestBody = JSON.stringify(json);
      } else {
        const blob = await req.blob().catch(() => null);
        if (blob && blob.size > 0) requestBody = blob;
      }
    }

    // 3. Dispatch forward request to Go backend
    const backendResponse = await fetch(targetUrl, {
      method: req.method,
      headers: forwardHeaders,
      body: requestBody,
      cache: "no-store",
    });

    // 4. Mirror backend response headers (including Set-Cookie headers)
    const responseHeaders = new Headers();
    backendResponse.headers.forEach((value, key) => {
      responseHeaders.set(key, value);
    });

    const responseBody = await backendResponse.arrayBuffer();

    return new NextResponse(responseBody, {
      status: backendResponse.status,
      statusText: backendResponse.statusText,
      headers: responseHeaders,
    });
  } catch (err) {
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