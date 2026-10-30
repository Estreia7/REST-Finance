import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { isScannerAvailable } from '@/lib/document-scanner';
import { processScan } from '@/lib/scan-core';
import { checkRateLimit } from '@/lib/rate-limit';
import { tokenFromRecipients, secretMatches, pickAttachments } from '@/lib/invoice-email';

/**
 * An email sent to a restaurant's invoice address.
 *
 * Posted by the Cloudflare Email Worker (infra/email-worker), never by a
 * browser: there is no session, so the shared secret is the door, and the
 * token in the recipient address says which restaurant. An unknown token is
 * answered exactly like a known one with nothing to read, so the endpoint
 * cannot be used to discover which addresses exist.
 *
 * Each PDF or invoice-sized photo is read like a scan and left waiting for
 * the owner in Despesas › Digitalizar. Nothing is booked until they save it.
 */

export const runtime = 'nodejs';
// Several attachments, each read by the model one after another.
export const maxDuration = 300;

const PER_RESTAURANT_PER_DAY = 60;
const DAY_MS = 24 * 60 * 60 * 1000;

const bodySchema = z.object({
  to: z.string().min(3).max(2000),
  from: z.string().max(500).default(''),
  subject: z.string().max(1000).optional(),
  attachments: z.array(z.object({
    filename: z.string().max(255).default('documento'),
    contentType: z.string().max(200).default('application/octet-stream'),
    content: z.string().max(12_000_000),
  })).max(30).default([]),
});

export async function POST(request: NextRequest) {
  if (!process.env.INBOUND_EMAIL_SECRET) {
    return NextResponse.json({ error: 'not configured' }, { status: 503 });
  }
  if (!secretMatches(request.headers.get('x-inbound-secret'), process.env.INBOUND_EMAIL_SECRET)) {
    return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'bad request' }, { status: 400 });
  const { to, from, attachments } = parsed.data;

  const empty = { received: true, read: 0, skipped: attachments.length };
  const token = tokenFromRecipients(to);
  if (!token) return NextResponse.json(empty);

  const restaurant = await prisma.restaurant.findUnique({
    where: { inboxToken: token },
    select: {
      id: true,
      memberships: {
        where: { role: 'OWNER', active: true },
        orderBy: { createdAt: 'asc' },
        take: 1,
        select: { userId: true },
      },
    },
  });
  const ownerId = restaurant?.memberships[0]?.userId;
  if (!restaurant || !ownerId) return NextResponse.json(empty);

  if (!(await isScannerAvailable())) {
    // Retried by the worker's caller; nothing is lost by answering busy.
    return NextResponse.json({ error: 'scanner unavailable' }, { status: 503 });
  }

  const { accepted, skipped } = pickAttachments(attachments);
  let read = 0;
  const failed: string[] = [];
  for (const a of accepted) {
    if (!checkRateLimit(`inbound:${restaurant.id}`, PER_RESTAURANT_PER_DAY, DAY_MS)) {
      failed.push(a.filename);
      continue;
    }
    try {
      await processScan({
        restaurantId: restaurant.id,
        // Filed under the owner: the reading needs a person, and the owner is
        // who will check it.
        userId: ownerId,
        base64: a.content,
        mediaType: a.mediaType,
        scanType: 'COST_RECEIPT',
        source: 'EMAIL',
        fromEmail: from,
        fileName: a.filename,
      });
      read++;
    } catch (error) {
      console.error('[inbound invoice] could not read an attachment', error);
      failed.push(a.filename);
    }
  }

  return NextResponse.json({ received: true, read, skipped: skipped.length, failed: failed.length });
}
