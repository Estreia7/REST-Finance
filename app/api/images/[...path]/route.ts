import { readFile } from 'node:fs/promises';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isAuthError } from '@/lib/auth-helpers';
import { resolveStoredPath, kindFromPath, DOC_MIME } from '@/lib/uploads';

/**
 * Serves uploaded logos, profile pictures and compliance documents.
 *
 * Uploads live outside the web root, so this is the only way to read them and
 * every request is checked: a logo is visible to members of that restaurant,
 * an avatar only to its owner. Without this, knowing a path would be enough,
 * and paths would leak through any shared screenshot.
 */
export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: { path: string[] } }
) {
  const auth = await requireAuth();
  if (isAuthError(auth)) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  const storedPath = params.path.join('/');
  const absolute = resolveStoredPath(storedPath);
  if (!absolute) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const [scope, ownerId] = params.path;

  if (scope === 'avatars') {
    // Own picture only. Another member's avatar is not theirs to fetch.
    if (ownerId !== auth.userId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
  } else if (scope === 'logos') {
    // Any active member of that restaurant may see its logo.
    const membership = await prisma.membership.findFirst({
      where: { userId: auth.userId, restaurantId: ownerId, active: true },
      select: { id: true },
    });
    if (!membership) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
  } else if (scope === 'compliance') {
    // Insurance and licences are the restaurant's legal records: owner only,
    // not every member the way a logo is.
    const membership = await prisma.membership.findFirst({
      where: {
        userId: auth.userId,
        restaurantId: ownerId,
        role: 'OWNER',
        active: true,
      },
      select: { id: true },
    });
    if (!membership) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
  } else if (scope === 'extraction-tests') {
    // Bench images are real supplier paperwork, photographed by an
    // administrator. Platform admins only — and not merely the one who
    // uploaded it, since the bench is a shared corpus.
    const admin = await prisma.membership.findFirst({
      where: { userId: auth.userId, role: 'PLATFORM_ADMIN', active: true },
      select: { id: true },
    });
    if (!admin) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
  } else {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const kind = kindFromPath(storedPath);
  if (!kind) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  try {
    const bytes = await readFile(absolute);
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        'Content-Type': DOC_MIME[kind],
        // Private: the response depends on who is asking, so a shared cache
        // must never reuse it for a different user.
        'Cache-Control': 'private, max-age=300',
        'X-Content-Type-Options': 'nosniff',
        // Forces a download rather than rendering in place. A PDF viewer is
        // a large attack surface to point at user-supplied files.
        ...(kind === 'pdf' ? { 'Content-Disposition': 'attachment' } : {}),
      },
    });
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
}
