import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  // 1. Identify the requested path
  const path = request.nextUrl.pathname;

  // 2. Define route categories (Updated to your central portal)
  const isAuthPath = path === '/portal';
  const isProtectedRoute = path.startsWith('/dashboard') || path.startsWith('/admin');

  // 3. Intelligently check for the session via the HttpOnly cookie
  // The Go backend automatically sets this on login!
  const hasSession = request.cookies.has('refresh_token');

  // 4. Smart Redirect Rules
  
  // Rule A: Intruder Alert! 
  // No session, trying to access secure pages -> Kick to portal
  if (isProtectedRoute && !hasSession) {
    const loginUrl = new URL('/portal', request.url);
    // Optional: Save where they were trying to go so you can redirect them back after login
    loginUrl.searchParams.set('callbackUrl', path);
    return NextResponse.redirect(loginUrl);
  }

  // Rule B: Already Logged In! 
  // Has session, trying to view the portal -> Send to dashboard
  if (isAuthPath && hasSession) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  // 5. Everything is fine, let them pass
  return NextResponse.next();
}

// 6. Matcher Configuration
// This tells Next.js exactly which routes to run this logic on to save performance.
export const config = {
  matcher: [
    '/dashboard/:path*',
    '/admin/:path*',
    '/portal'
  ],
};