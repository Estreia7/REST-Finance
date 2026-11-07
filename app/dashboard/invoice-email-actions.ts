'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { retireSupersededScans } from '@/lib/review-queue-server';
import { groupCopies, type QueuedData } from '@/lib/review-queue';
import { requireOwner, requireMember, isAuthError } from '@/lib/auth-helpers';
import { toClientError } from '@/lib/errors';
import { newInboxToken, invoiceAddress } from '@/lib/invoice-email';

/**
 * The restaurant's invoice email address, and the invoices that came in
 * through it. Errors are dictionary keys.
 */

function fail(error: string) {
  return { success: false as const, error };
}

const domain = () => process.env.INBOUND_EMAIL_DOMAIN?.trim() || null;

/** The address, or null when there is none yet. `enabled` is false until the server is set up. */
export async function getInvoiceEmail() {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return fail(owner.error);
    const d = domain();
    const r = await prisma.restaurant.findUnique({ where: { id: owner.restaurantId }, select: { inboxToken: true } });
    return {
      success: true as const,
      data: { enabled: !!d, address: d && r?.inboxToken ? invoiceAddress(r.inboxToken, d) : null },
    };
  } catch (error: unknown) {
    return fail(toClientError('Failed to read the invoice address', error, 'read'));
  }
}

/**
 * Gives the restaurant an address, or a new one. The old one stops working at
 * once: that is the point of asking for a new one, when the address has
 * reached someone it should not have.
 */
export async function createInvoiceEmail() {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return fail(owner.error);
    const d = domain();
    if (!d) return fail('invoiceEmail.notEnabled');
    const token = newInboxToken();
    await prisma.restaurant.update({ where: { id: owner.restaurantId }, data: { inboxToken: token } });
    return { success: true as const, data: { address: invoiceAddress(token, d) } };
  } catch (error: unknown) {
    return fail(toClientError('Failed to create the invoice address', error, 'write'));
  }
}

export interface EmailedInvoice {
  id: string;
  receivedAt: string;
  fromEmail: string | null;
  fileName: string | null;
  filePath: string | null;
  vendor: string | null;
  total: number | null;
  date: string | null;
  invoiceNumber: string | null;
  /** The whole reading, to open in the review screen. */
  data: unknown;
}

/** Emailed invoices still waiting: not saved, not set aside. */
export interface InvoiceToReview {
  id: string;
  /** Every page, in order. */
  pages: string[];
  data: QueuedData;
  proofStatus: string | null;
  /** Every photograph of this invoice waiting, this one included, best first. */
  copies?: InvoiceToReview[];
}

/** What is waiting, with the photographs of one invoice together. */
async function queuedInvoices(restaurantId: string): Promise<InvoiceToReview[][]> {
  await retireSupersededScans(restaurantId);
  const scans = await prisma.receiptScan.findMany({
    where: { restaurantId, queued: true, reviewedAt: null, linkedEntryId: null },
    orderBy: { createdAt: 'asc' },
    take: 50,
    select: { id: true, imageUrl: true, pageUrls: true, extractedData: true, proofStatus: true },
  });
  return groupCopies(scans.map((s): InvoiceToReview => ({
    id: s.id,
    pages: [s.imageUrl, ...s.pageUrls].filter((path) => path && !path.endsWith('.pdf')),
    data: s.extractedData as QueuedData,
    proofStatus: s.proofStatus,
  })));
}

/** Invoices photographed to deal with later that the app would not vouch for. */
export async function getInvoicesToReview() {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return fail(owner.error);
    const groups = await queuedInvoices(owner.restaurantId);
    return {
      success: true as const,
      data: groups.map(([lead, ...rest]): InvoiceToReview => ({ ...lead, copies: rest.length > 0 ? [lead, ...rest] : undefined })),
    };
  } catch (error: unknown) {
    return fail(toClientError('Failed to list the invoices to review', error, 'read'));
  }
}

/** Every photograph waiting of the invoice this one shows, itself included. */
export async function getQueuedCopies(scanId: string) {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return fail(owner.error);
    const groups = await queuedInvoices(owner.restaurantId);
    return { success: true as const, data: groups.find((group) => group.some((s) => s.id === scanId)) ?? [] };
  } catch (error: unknown) {
    return fail(toClientError('Failed to look for copies of the invoice', error, 'read'));
  }
}

/** The owner chose this photograph: the others of the same invoice leave the list. */
export async function keepQueuedCopy(scanId: string) {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return fail(owner.error);
    const groups = await queuedInvoices(owner.restaurantId);
    const others = (groups.find((group) => group.some((s) => s.id === scanId)) ?? [])
      .map((s) => s.id)
      .filter((id) => id !== scanId);
    await prisma.receiptScan.updateMany({
      where: { id: { in: others }, restaurantId: owner.restaurantId, queued: true, linkedEntryId: null },
      data: { reviewedAt: new Date() },
    });
    return { success: true as const };
  } catch (error: unknown) {
    return fail(toClientError('Failed to keep the chosen photo', error, 'write'));
  }
}

/** Sets a photographed invoice aside, because a better photo is taking its place. */
export async function dismissQueuedScan(scanId: string) {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return fail(owner.error);
    await prisma.receiptScan.updateMany({
      where: { id: scanId, restaurantId: owner.restaurantId, queued: true, linkedEntryId: null },
      data: { reviewedAt: new Date() },
    });
    return { success: true as const };
  } catch (error: unknown) {
    return fail(toClientError('Failed to set the invoice aside', error, 'write'));
  }
}

export async function getEmailedInvoices() {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return fail(owner.error);
    const scans = await prisma.receiptScan.findMany({
      where: { restaurantId: owner.restaurantId, source: 'EMAIL', reviewedAt: null, linkedEntryId: null },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, createdAt: true, fromEmail: true, fileName: true, imageUrl: true, extractedData: true },
    });
    return {
      success: true as const,
      data: scans.map((s): EmailedInvoice => {
        const d = (s.extractedData ?? {}) as Record<string, unknown>;
        return {
          id: s.id,
          receivedAt: s.createdAt.toISOString(),
          fromEmail: s.fromEmail,
          fileName: s.fileName,
          filePath: s.imageUrl || null,
          vendor: typeof d.vendor === 'string' ? d.vendor : null,
          total: typeof d.grandTotal === 'number' ? d.grandTotal : null,
          date: typeof d.date === 'string' ? d.date : null,
          invoiceNumber: typeof d.invoiceNumber === 'string' ? d.invoiceNumber : null,
          data: s.extractedData,
        };
      }),
    };
  } catch (error: unknown) {
    return fail(toClientError('Failed to list emailed invoices', error, 'read'));
  }
}

/** Not an invoice to book (a duplicate, a quote, an advert): set aside. */
export async function dismissEmailedInvoice(scanId: string) {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return fail(owner.error);
    const updated = await prisma.receiptScan.updateMany({
      where: { id: scanId, restaurantId: owner.restaurantId, source: 'EMAIL', reviewedAt: null },
      data: { reviewedAt: new Date() },
    });
    if (updated.count === 0) return fail('invoiceEmail.notFound');
    revalidatePath('/dashboard');
    return { success: true as const };
  } catch (error: unknown) {
    return fail(toClientError('Failed to set the invoice aside', error, 'write'));
  }
}

/**
 * A reading was saved as a cost: filed against it. Called by the scanner after
 * every save, so an emailed invoice leaves the waiting list the moment it is
 * booked. reviewedAt is left to the line-by-line confirmation, which is what
 * it records.
 */
export async function linkScanToCost(input: { scanId: string; costEntryId: string }) {
  try {
    const member = await requireMember();
    if (isAuthError(member)) return fail(member.error);
    await prisma.receiptScan.updateMany({
      where: { id: input.scanId, restaurantId: member.restaurantId, linkedEntryId: null },
      data: { linkedEntryId: input.costEntryId },
    });
    return { success: true as const };
  } catch (error: unknown) {
    return fail(toClientError('Failed to link the reading', error, 'write'));
  }
}
