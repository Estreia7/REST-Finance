import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOwner, isAuthError } from '@/lib/auth-helpers';
import { prisma } from '@/lib/prisma';
import { saveImage } from '@/lib/uploads';

/**
 * Adds a page to a saved invoice, for one that turned out to have more.
 *
 * A route rather than a server action: a photographed page is over the size a
 * server action accepts. Only stores the page. Reading it again is a separate
 * step, whose result the owner sees before anything changes.
 */

const schema = z.object({
  invoiceNumber: z.string().min(1).max(100),
  imageBase64: z.string().min(100).max(10_000_000),
});

export async function POST(request: NextRequest) {
  const owner = await requireOwner();
  if (isAuthError(owner)) return NextResponse.json({ error: owner.error }, { status: 401 });

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: 'proof.errors.badLine' }, { status: 400 });
  const { invoiceNumber, imageBase64 } = parsed.data;

  const entries = await prisma.costEntry.findMany({
    where: { restaurantId: owner.restaurantId, invoiceNumber, deletedAt: null },
    select: { id: true, splitFromId: true },
  });
  const ids = entries.flatMap((e) => [e.id, e.splitFromId].filter((id): id is string => !!id));
  const scan = await prisma.receiptScan.findFirst({
    where: { restaurantId: owner.restaurantId, linkedEntryId: { in: ids }, NOT: { imageUrl: '' } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, pageUrls: true },
  });
  if (!scan) return NextResponse.json({ error: 'proof.errors.noImage' }, { status: 404 });
  if (scan.pageUrls.length >= 5) return NextResponse.json({ error: 'proof.errors.tooManyPages' }, { status: 400 });

  const bytes = new Uint8Array(Buffer.from(imageBase64, 'base64'));
  const saved = await saveImage('invoices', owner.restaurantId, new File([bytes], 'invoice.jpg', { type: 'image/jpeg' }));
  if (!saved.ok) return NextResponse.json({ error: 'proof.errors.save' }, { status: 400 });

  await prisma.receiptScan.update({
    where: { id: scan.id },
    data: { pageUrls: [...scan.pageUrls, saved.storedPath] },
  });
  return NextResponse.json({ success: true, path: saved.storedPath });
}
