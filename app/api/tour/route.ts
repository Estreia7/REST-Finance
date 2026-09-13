import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth-config';
import { TOUR_VERSION } from '@/lib/tour';

/**
 * Records that the walkthrough has been finished or skipped.
 *
 * Skipping is stored exactly like finishing: someone who dismissed it does not
 * want it again on their next login, and treating "skip" as "not yet seen"
 * would make the app nag. The demo account replays it on demand instead, which
 * is the deliberate way back in.
 */

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  }

  // `replay: true` puts the account back to never-seen, which is what the
  // demo account's "run it again" button uses.
  let replay = false;
  try {
    ({ replay = false } = await request.json());
  } catch {
    // An empty body means "mark as seen", the common case.
  }

  try {
    await prisma.user.update({
      where: { id: session.user.id },
      data: { tourVersion: replay ? null : TOUR_VERSION },
    });
  } catch {
    return NextResponse.json({ error: 'Could not save' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
