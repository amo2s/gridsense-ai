import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

const GATEWAY_URL = process.env.BACKEND_API_URL || "https://sliverboy-heal-her-backend.hf.space";
const MAX_REQUEST_BYTES = 10 * 1024 * 1024; // 10MB
const BACKEND_TIMEOUT_MS = 10_000; // 10s
const isProd = process.env.NODE_ENV === "production";

// Single-flight refresh map
const pendingRefreshes = new Map<string, Promise<{ accessToken: string; refreshToken: string } | null>>();

function decodeExp(token: string): number | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = JSON.parse(Buffer.from(parts[1], "base64").toString("utf8"));
    return payload.exp || null;
  } catch (e) {
    return null;
  }
}

function decodePayload(token: string): any {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    return JSON.parse(Buffer.from(parts[1], "base64").toString("utf8"));
  } catch (e) {
    return null;
  }
}

function setCookiesOnResponse(response: NextResponse, req: NextRequest, accessToken: string, refreshToken: string) {
  const isHttps = req.headers.get("x-forwarded-proto") === "https" || req.nextUrl.protocol === "https:";
  const secure = isProd && isHttps;
  const maxAge = 7 * 24 * 60 * 60; // 7 days

  response.cookies.set({
    name: "auth_token",
    value: accessToken,
    path: "/",
    httpOnly: true,
    secure,
    sameSite: "lax",
    maxAge,
  });

  response.cookies.set({
    name: "refresh_token",
    value: refreshToken,
    path: "/api/proxy",
    httpOnly: true,
    secure,
    sameSite: "lax",
    maxAge,
  });
}

function clearCookiesOnResponse(response: NextResponse, req: NextRequest) {
  const isHttps = req.headers.get("x-forwarded-proto") === "https" || req.nextUrl.protocol === "https:";
  const secure = isProd && isHttps;
  
  response.cookies.set({
    name: "auth_token",
    value: "",
    path: "/",
    httpOnly: true,
    secure,
    sameSite: "lax",
    maxAge: 0,
  });

  response.cookies.set({
    name: "refresh_token",
    value: "",
    path: "/api/proxy",
    httpOnly: true,
    secure,
    sameSite: "lax",
    maxAge: 0,
  });
}

async function performRefresh(refreshToken: string): Promise<{ accessToken: string; refreshToken: string } | null> {
  if (pendingRefreshes.has(refreshToken)) {
    return pendingRefreshes.get(refreshToken)!;
  }

  const refreshPromise = (async () => {
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), BACKEND_TIMEOUT_MS);
      const res = await fetch(`${GATEWAY_URL}/api/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
        cache: "no-store",
        signal: controller.signal,
      });
      clearTimeout(id);

      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.data && data.data.access_token && data.data.refresh_token) {
          return { accessToken: data.data.access_token, refreshToken: data.data.refresh_token };
        }
      }
      return null;
    } catch (err) {
      return null;
    } finally {
      pendingRefreshes.delete(refreshToken);
    }
  })();

  pendingRefreshes.set(refreshToken, refreshPromise);
  return refreshPromise;
}

async function proxyHandler(
  req: NextRequest,
  context: { params: Promise<{ slug: string[] }> }
) {
  try {
    const { slug } = await context.params;
    const targetPath = slug.join("/");
    const searchParams = req.nextUrl.search;

    const cookieStore = await cookies();
    let authToken = cookieStore.get("auth_token")?.value;
    let refreshToken = cookieStore.get("refresh_token")?.value;

    // A. Add GET /api/proxy/auth/me
    if (req.method === "GET" && targetPath === "auth/me") {
      if (!authToken) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      const payload = decodePayload(authToken);
      if (!payload) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      return NextResponse.json({
        name: payload.name,
        role: payload.role,
        status: payload.status,
      });
    }

    // A. Intercept /api/proxy/auth/logout
    if (req.method === "POST" && targetPath === "auth/logout") {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), BACKEND_TIMEOUT_MS);
      try {
        await fetch(`${GATEWAY_URL}/api/auth/logout`, {
          method: "POST",
          headers: authToken ? { "Authorization": `Bearer ${authToken}` } : {},
          signal: controller.signal,
        });
      } catch (e) {
        console.error("Failed to notify backend of logout", e);
      } finally {
        clearTimeout(id);
      }
      const response = NextResponse.json({ message: "Logged out" }, { status: 200 });
      clearCookiesOnResponse(response, req);
      return response;
    }

    let refreshPerformed = false;
    let refreshFailed = false;
    let newTokens: { accessToken: string; refreshToken: string } | null = null;

    // B. Pre-flight refresh
    const isLogin = req.method === "POST" && targetPath === "auth/login";
    if (refreshToken && !isLogin) {
      let needsRefresh = false;
      if (!authToken) {
        needsRefresh = true;
      } else {
        const exp = decodeExp(authToken);
        if (exp && exp - (Date.now() / 1000) < 60) {
          needsRefresh = true;
        }
      }

      if (needsRefresh) {
        newTokens = await performRefresh(refreshToken);
        if (newTokens) {
          authToken = newTokens.accessToken;
          refreshToken = newTokens.refreshToken;
          refreshPerformed = true;
        } else {
          refreshFailed = true;
        }
      }
    }

    if (refreshFailed && !isLogin) {
      const response = NextResponse.json({ error: "Session expired" }, { status: 401, headers: { "X-Session-Expired": "1" } });
      clearCookiesOnResponse(response, req);
      return response;
    }

    const targetUrl = targetPath === "healthz" || targetPath === "query"
      ? `${GATEWAY_URL}/${targetPath}${searchParams}`
      : `${GATEWAY_URL}/api/${targetPath}${searchParams}`;

    const forwardHeaders = new Headers();
    req.headers.forEach((value, key) => {
      const lowerKey = key.toLowerCase();
      if (!["host", "connection", "content-length", "authorization", "cookie"].includes(lowerKey)) {
        forwardHeaders.set(key, value);
      }
    });

    if (authToken && targetPath !== "healthz" && !isLogin) {
      forwardHeaders.set("Authorization", `Bearer ${authToken}`);
    }

    let requestBody: BodyInit | null = null;
    if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
      const declaredLength = req.headers.get("content-length");
      if (declaredLength && Number(declaredLength) > MAX_REQUEST_BYTES) {
        return NextResponse.json({ error: "Payload Too Large" }, { status: 413 });
      }
      
      const buffer = await req.arrayBuffer();
      if (buffer.byteLength > MAX_REQUEST_BYTES) {
        return NextResponse.json({ error: "Payload Too Large" }, { status: 413 });
      }
      if (buffer.byteLength > 0) {
        requestBody = buffer;
      }
    }

    const doRequest = async (authValue: string | undefined) => {
      const h = new Headers(forwardHeaders);
      if (authValue) h.set("Authorization", `Bearer ${authValue}`);
      
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), BACKEND_TIMEOUT_MS);
      try {
        const res = await fetch(targetUrl, {
          method: req.method,
          headers: h,
          body: requestBody,
          cache: "no-store",
          signal: controller.signal,
        });
        clearTimeout(id);
        return res;
      } catch (e) {
        clearTimeout(id);
        throw e;
      }
    };

    let backendResponse = await doRequest(authToken);

    // B. Replay logic on 401 if we haven't refreshed yet
    if (backendResponse.status === 401 && !refreshPerformed && refreshToken && !isLogin) {
      newTokens = await performRefresh(refreshToken);
      if (newTokens) {
        authToken = newTokens.accessToken;
        refreshToken = newTokens.refreshToken;
        refreshPerformed = true;
        backendResponse = await doRequest(authToken);
      } else {
        // Refresh failed during replay
        const response = NextResponse.json({ error: "Session expired" }, { status: 401, headers: { "X-Session-Expired": "1" } });
        clearCookiesOnResponse(response, req);
        return response;
      }
    }

    // A. Intercept /api/proxy/auth/login response to extract tokens
    if (isLogin) {
      if (backendResponse.ok) {
        const data = await backendResponse.json();
        if (data.data && data.data.access_token && data.data.refresh_token) {
          const userPayload = data.data.user || {};
          const safeData = { status: "success", data: { user: userPayload } };
          const response = NextResponse.json(safeData, { status: backendResponse.status });
          setCookiesOnResponse(response, req, data.data.access_token, data.data.refresh_token);
          return response;
        }
        return NextResponse.json(data, { status: backendResponse.status });
      } else {
        const responseBody = await backendResponse.arrayBuffer();
        return new NextResponse(responseBody, {
          status: backendResponse.status,
          statusText: backendResponse.statusText,
          headers: backendResponse.headers,
        });
      }
    }

    const responseHeaders = new Headers();
    backendResponse.headers.forEach((value, key) => {
      if (key.toLowerCase() !== "set-cookie") {
        responseHeaders.set(key, value);
      }
    });

    const responseBody = await backendResponse.arrayBuffer();
    const finalResponse = new NextResponse(responseBody, {
      status: backendResponse.status,
      statusText: backendResponse.statusText,
      headers: responseHeaders,
    });

    if (refreshPerformed && newTokens) {
      setCookiesOnResponse(finalResponse, req, newTokens.accessToken, newTokens.refreshToken);
    }

    return finalResponse;

  } catch (err: any) {
    if (err?.name === "AbortError") {
      return NextResponse.json({ error: "Gateway Timeout" }, { status: 504 });
    }
    return NextResponse.json({ error: "Bad Gateway" }, { status: 502 });
  }
}

export const GET = proxyHandler;
export const POST = proxyHandler;
export const PUT = proxyHandler;
export const PATCH = proxyHandler;
export const DELETE = proxyHandler;