import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth-config';
import { LANGUAGE_COOKIE, isLanguage } from '@/lib/server-language';

/**
 * Saves the interface language.
 *
 * The cookie is set here as well as in the browser so the choice survives on
 * its own for a signed-out visitor on the landing page. For someone signed in
 * it also goes to the account, which is what carries the choice to their next
 * device.
 *
 * Writing only ever touches the caller's own row, so there is nothing to
 * authorise beyond having a session.
 */

export const dynamic = 'force-dynamic';

const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export async function POST(request: NextRequest) {
  let language: unknown;
  try {
    ({ language } = await request.json());
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  if (!isLanguage(language)) {
    return NextResponse.json({ error: 'Unsupported language' }, { status: 400 });
  }

  const session = await auth();
  if (session?.user?.id) {
    try {
      await prisma.user.update({
        where: { id: session.user.id },
        data: { language },
      });
    } catch {
      // The cookie below still carries the choice for this browser, so a
      // failed save degrades rather than breaking the switch.
      return NextResponse.json({ ok: true, saved: false });
    }
  }

  const response = NextResponse.json({ ok: true, saved: Boolean(session?.user?.id) });
  response.cookies.set(LANGUAGE_COOKIE, language, {
    path: '/',
    maxAge: COOKIE_MAX_AGE,
    sameSite: 'lax',
  });
  return response;
}
