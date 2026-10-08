import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify, errors as joseErrors } from 'jose';

// Must be the SAME secret bytes your Go backend uses to sign tokens (the `jwtSecret []byte`
// passed into login.NewService). Set this in your Next.js server environment — never
// expose it as NEXT_PUBLIC_*, since that would ship it to the browser.
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  // Fail loudly at boot rather than silently letting every request through unverified.
  throw new Error('JWT_SECRET is not set — auth middleware cannot verify sessions.');
}

const secretKey = new TextEncoder().encode(JWT_SECRET);

interface SessionClaims {
  sub?: string;
  email?: string;
  role?: string;
  status?: string;
}

/**
 * Verifies the access token's signature and expiry against the backend's signing key.
 * Returns the decoded claims on success, or null if the token is missing, expired,
 * malformed, or signed with a different key (i.e. forged).
 *
 * Cookie name confirmed from backend source:
 *   backend/services/auth/internal/auth/login/handler.go L90 → Name: "auth_token"
 *   Path: "/" (sent on every request, not scoped like refresh_token)
 *
 * NOTE: No silent refresh is attempted here. The /api/auth/refresh endpoint does NOT
 * exist in the auth service router (auth/cmd/server/main.go L115-148). The refresh_token
 * cookie (Path=/api/auth/refresh) is a browser-scoping constraint only. A dedicated
 * refresh endpoint must be implemented on the backend before that flow can be added here.
 */
async function getSession(request: NextRequest): Promise<SessionClaims | null> {
  // "auth_token" is the confirmed cookie name set by the Go login handler.
  const token = request.cookies.get('auth_token')?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, secretKey);
    return payload as SessionClaims;
  } catch (err) {
    // Covers expired tokens, bad signatures (forged/tampered cookies), and malformed JWTs.
    if (
      err instanceof joseErrors.JWTExpired ||
      err instanceof joseErrors.JWSSignatureVerificationFailed ||
      err instanceof joseErrors.JWTInvalid
    ) {
      return null;
    }
    // Unexpected verification error — treat as unauthenticated rather than throwing,
    // so a transient bug here never accidentally lets requests through.
    console.error('Session verification error:', err);
    return null;
  }
}

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;

  const isAuthPath = path === '/portal';
  const isAdminRoute = path.startsWith('/admin');
  const isProtectedRoute = path.startsWith('/dashboard') || isAdminRoute;

  const session = await getSession(request);
  const hasAuthToken = session !== null;
  const hasRefreshToken = request.cookies.has('refresh_token');
  const hasSession = hasAuthToken || hasRefreshToken;

  if (isProtectedRoute && !hasSession) {
    const loginUrl = new URL('/portal', request.url);
    loginUrl.searchParams.set('callbackUrl', path);
    const response = NextResponse.redirect(loginUrl);
    response.cookies.delete('auth_token');
    response.cookies.delete('refresh_token');
    return response;
  }

  if (isAdminRoute && hasAuthToken && session?.role !== 'Admin') {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  const requestHeaders = new Headers(request.headers);
  if (session) {
    if (session.sub)   requestHeaders.set('x-user-id',    session.sub);
    if (session.role)  requestHeaders.set('x-user-role',  session.role);
    if (session.email) requestHeaders.set('x-user-email', session.email);
  }

  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

export const config = {
  matcher: [
    '/((?!api/proxy/auth/login|_next/static|_next/image|favicon.ico|portal).*)',
  ],
};