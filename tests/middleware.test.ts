import { describe, it, expect, beforeAll } from 'vitest';
import { NextRequest } from 'next/server';
import { encode } from 'next-auth/jwt';
import { middleware } from '../middleware';

const SECRET = 'test-secret-for-middleware-only';
const COOKIE = 'authjs.session-token';

async function tokenFor(opts: { secret?: string; maxAge?: number; salt?: string } = {}) {
  return encode({
    token: { sub: 'user-1', email: 'owner@example.com' },
    secret: opts.secret ?? SECRET,
    salt: opts.salt ?? COOKIE,
    maxAge: opts.maxAge ?? 60 * 60,
  });
}

function request(path: string, cookie?: string, name = COOKIE) {
  const headers = new Headers();
  if (cookie) headers.set('cookie', `${name}=${cookie}`);
  return new NextRequest(new URL(path, 'https://app.example.com'), { headers });
}

function location(res: Response) {
  const loc = res.headers.get('location');
  return loc ? new URL(loc) : null;
}

describe('middleware session check', () => {
  beforeAll(() => {
    process.env.AUTH_SECRET = SECRET;
  });

  it('lets a valid session into the dashboard', async () => {
    const res = await middleware(request('/dashboard', await tokenFor()));
    expect(location(res)).toBeNull();
  });

  it('sends a visitor with no session to sign in, without the expired flag', async () => {
    const loc = location(await middleware(request('/dashboard')));
    expect(loc?.pathname).toBe('/login');
    expect(loc?.searchParams.get('redirect')).toBe('/dashboard');
    expect(loc?.searchParams.get('expired')).toBeNull();
  });

  it('turns away a token signed with a rotated secret and clears the cookie', async () => {
    const res = await middleware(request('/dashboard', await tokenFor({ secret: 'old-secret' })));
    const loc = location(res);
    expect(loc?.pathname).toBe('/login');
    expect(loc?.searchParams.get('expired')).toBe('1');
    expect(res.headers.get('set-cookie')).toMatch(new RegExp(`${COOKIE}=;`));
  });

  it('turns away an expired token', async () => {
    const res = await middleware(request('/dashboard', await tokenFor({ maxAge: -60 })));
    expect(location(res)?.searchParams.get('expired')).toBe('1');
  });

  it('turns away garbage in the cookie', async () => {
    const res = await middleware(request('/admin', 'not-a-jwt'));
    expect(location(res)?.pathname).toBe('/login');
  });

  it('reads the __Secure- cookie used over HTTPS', async () => {
    const name = '__Secure-authjs.session-token';
    const res = await middleware(request('/dashboard', await tokenFor({ salt: name }), name));
    expect(location(res)).toBeNull();
  });

  it('sends a signed-in owner from /login to the dashboard', async () => {
    const loc = location(await middleware(request('/login', await tokenFor())));
    expect(loc?.pathname).toBe('/dashboard');
  });

  it('leaves a dead session on /login instead of bouncing back to the dashboard', async () => {
    const res = await middleware(request('/login', 'not-a-jwt'));
    expect(location(res)).toBeNull();
    expect(res.headers.get('set-cookie')).toMatch(new RegExp(`${COOKIE}=;`));
  });
});
