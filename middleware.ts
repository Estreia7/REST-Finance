import { NextResponse, type NextRequest } from 'next/server';

/**
 * Route protection.
 *
 * Checks only for the presence of a session cookie, deliberately: the Edge
 * runtime cannot reach Postgres, so the real authorisation happens in the
 * server actions and route handlers via lib/auth-helpers.ts, which read roles
 * fresh from the database on every request.
 *
 * This is a redirect for unauthenticated visitors, not a security boundary.
 */
const PROTECTED = ['/dashboard', '/admin'];
const AUTH_PAGES = ['/login', '/register'];

function hasSessionCookie(request: NextRequest): boolean {
  // Auth.js prefixes the cookie with __Secure- when served over HTTPS.
  return (
    request.cookies.has('authjs.session-token') ||
    request.cookies.has('__Secure-authjs.session-token')
  );
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const signedIn = hasSessionCookie(request);

  if (!signedIn && PROTECTED.some((p) => pathname.startsWith(p))) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (signedIn && AUTH_PAGES.includes(pathname)) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/admin/:path*', '/login', '/register'],
};
