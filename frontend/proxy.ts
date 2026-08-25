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
 */
async function getSession(request: NextRequest): Promise<SessionClaims | null> {
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
  const hasSession = session !== null;

  if (isProtectedRoute && !hasSession) {
    const loginUrl = new URL('/portal', request.url);
    loginUrl.searchParams.set('callbackUrl', path);
    const response = NextResponse.redirect(loginUrl);
    // Clear any invalid/forged/expired cookie so it doesn't keep failing verification on every request.
    response.cookies.delete('auth_token');
    return response;
  }

  // Role gate: being authenticated is not the same as being authorized for /admin.
  // NOTE: this checks the role claim in the token. It does not replace backend
  // authorization checks — your Go services must independently verify role on every
  // admin request too, since this middleware can't protect direct API calls.
  if (isAdminRoute && hasSession && session?.role !== 'Admin') {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  if (isAuthPath && hasSession) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/admin/:path*',
    '/portal',
  ],
};