import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify, decodeJwt } from 'jose';

const JWT_SECRET = process.env.JWT_SECRET;
const UPSTREAM_AUTH_URL = 'http://gateway-service:8080/api/auth/refresh';

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is not set — auth middleware cannot verify sessions.');
}

const secretKey = new TextEncoder().encode(JWT_SECRET);

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/admin/:path*',
    '/portal',
    '/api/graphql',
  ],
  runtime: 'experimental-edge',
};

export async function proxy(request: NextRequest) {
  const token = request.cookies.get('accessToken')?.value;
  let payload: any = null;
  let needsRefresh = false;
  let newCookies: string[] = [];

  if (token) {
    try {
      const decoded = await jwtVerify(token, secretKey);
      payload = decoded.payload;
    } catch (err: any) {
      if (err.code === 'ERR_JWT_EXPIRED') {
        needsRefresh = true;
      }
    }
  } else {
    needsRefresh = true;
  }

  const refreshToken = request.cookies.get('refreshToken')?.value;

  if (needsRefresh && refreshToken) {
    try {
      const refreshResp = await fetch(UPSTREAM_AUTH_URL, {
        method: 'POST',
        headers: {
          'Cookie': `refreshToken=${refreshToken}`
        }
      });
      if (refreshResp.ok) {
        const setCookies = refreshResp.headers.getSetCookie();
        if (setCookies && setCookies.length > 0) {
          newCookies = setCookies;
          const newAccessTokenCookie = setCookies.find(c => c.startsWith('accessToken='));
          if (newAccessTokenCookie) {
            const newToken = newAccessTokenCookie.split(';')[0].split('=')[1];
            payload = decodeJwt(newToken);
          }
        }
      }
    } catch (e) {
      console.error('Failed to refresh token', e);
    }
  }

  const path = request.nextUrl.pathname;
  const isAuthPath = path === '/portal';
  const isAdminRoute = path.startsWith('/admin');
  const isProtectedRoute = path.startsWith('/dashboard') || isAdminRoute;

  if (isProtectedRoute && !payload) {
    const loginUrl = new URL('/portal', request.url);
    loginUrl.searchParams.set('callbackUrl', path);
    return NextResponse.redirect(loginUrl);
  }

  if (isAdminRoute && payload && payload.role !== 'Admin') {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  if (isAuthPath && payload) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  const requestHeaders = new Headers(request.headers);
  if (payload) {
    if (payload.sub) requestHeaders.set('x-user-id', payload.sub.toString());
    if (payload.role) requestHeaders.set('x-user-role', payload.role.toString());
    if (payload.email) requestHeaders.set('x-user-email', payload.email.toString());
  }

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  if (newCookies.length > 0) {
    newCookies.forEach(cookieStr => {
      response.headers.append('Set-Cookie', cookieStr);
    });
  }

  return response;
}