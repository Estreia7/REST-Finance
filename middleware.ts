import { NextResponse, type NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

/**
 * Route protection.
 *
 * Verifies the session token's signature and expiry, but not the user behind
 * it: the Edge runtime cannot reach Postgres, so the real authorisation
 * happens in the server actions and route handlers via lib/auth-helpers.ts,
 * which read roles fresh from the database on every request.
 *
 * Checking only that a cookie existed let a dead session through — one past
 * its expiry, or signed with a secret that has since been rotated — and the
 * dashboard then rendered as an empty shell with no name, no restaurant and no
 * way to tell the owner why. A dead cookie is now cleared here and the visitor
 * sent to sign in.
 *
 * This is a redirect for unauthenticated visitors, not a security boundary.
 */
const PROTECTED = ['/dashboard', '/admin'];
const AUTH_PAGES = ['/login', '/register'];

// Auth.js prefixes the cookie with __Secure- when served over HTTPS, and
// splits a large token into `.0`, `.1`, … chunks.
const COOKIE_NAMES = ['__Secure-authjs.session-token', 'authjs.session-token'] as const;

type SessionState = 'none' | 'valid' | 'invalid';

function sessionCookieName(request: NextRequest): (typeof COOKIE_NAMES)[number] | null {
  const names = request.cookies.getAll().map((c) => c.name);
  return COOKIE_NAMES.find((base) => names.some((n) => n === base || n.startsWith(`${base}.`))) ?? null;
}

async function readSession(request: NextRequest): Promise<SessionState> {
  const cookieName = sessionCookieName(request);
  if (!cookieName) return 'none';

  const secret = process.env.AUTH_SECRET;
  // Without the secret the token cannot be checked. Fall back to trusting its
  // presence rather than signing every owner out.
  if (!secret) return 'valid';

  const token = await getToken({
    req: request,
    secret,
    cookieName,
    salt: cookieName,
    secureCookie: cookieName.startsWith('__Secure-'),
  });

  return token?.sub ? 'valid' : 'invalid';
}

function clearSessionCookies(request: NextRequest, response: NextResponse): NextResponse {
  for (const { name } of request.cookies.getAll()) {
    if (COOKIE_NAMES.some((base) => name === base || name.startsWith(`${base}.`))) {
      response.cookies.delete(name);
    }
  }
  return response;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const session = await readSession(request);

  if (session !== 'valid' && PROTECTED.some((p) => pathname.startsWith(p))) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    if (session === 'invalid') loginUrl.searchParams.set('expired', '1');
    return clearSessionCookies(request, NextResponse.redirect(loginUrl));
  }

  if (session === 'valid' && AUTH_PAGES.includes(pathname)) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  // A dead cookie on the sign-in page is dropped so it cannot bounce the
  // visitor back to the dashboard once they have signed in again.
  if (session === 'invalid') return clearSessionCookies(request, NextResponse.next());

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/admin/:path*', '/login', '/register'],
};
