import { prisma } from './prisma';
import { repriceIngredients } from './ingredient-costs-server';
import { automaticMatch, type InvoiceCandidate } from './credit-notes';

/**
 * Matching credit notes to the invoices they cancel.
 *
 * Not server actions: these trust the ids they are given, and callers check
 * them. Cancelling is a soft delete, so an invoice and its lines leave every
 * total the same way a deleted one does, and undoing puts them back.
 */

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function cents(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** A supplier's live invoices, each with its split parts added in. */
export async function invoicesOfVendor(restaurantId: string, vendorId: string): Promise<InvoiceCandidate[]> {
  const roots = await prisma.costEntry.findMany({
    where: { restaurantId, vendorId, deletedAt: null, splitFromId: null },
    select: {
      id: true, date: true, amount: true, invoiceNumber: true,
      splitParts: { where: { deletedAt: null }, select: { amount: true } },
    },
    take: 1000,
  });
  return roots.map((r) => ({
    costEntryId: r.id,
    invoiceNumber: r.invoiceNumber,
    date: dayKey(r.date),
    amount: cents(Number(r.amount) + r.splitParts.reduce((sum, p) => sum + Number(p.amount), 0)),
  }));
}

/** Takes an invoice off the books against a credit note. */
export async function cancelInvoice(restaurantId: string, creditId: string, costEntryId: string): Promise<void> {
  const when = new Date();
  await prisma.$transaction([
    prisma.costEntry.updateMany({
      where: { restaurantId, deletedAt: null, OR: [{ id: costEntryId }, { splitFromId: costEntryId }] },
      data: { deletedAt: when },
    }),
    prisma.creditNote.update({
      where: { id: creditId },
      data: { status: 'matched', matchedEntryId: costEntryId, matchedAt: when },
    }),
  ]);
  await repriceAfter(restaurantId, costEntryId);
}

/** Puts an invoice back. Only what this credit note took away: `matchedAt` says which. */
export async function restoreInvoice(
  restaurantId: string,
  credit: { id: string; matchedEntryId: string | null; matchedAt: Date | null },
): Promise<void> {
  const { matchedEntryId, matchedAt } = credit;
  await prisma.$transaction([
    ...(matchedEntryId && matchedAt
      ? [prisma.costEntry.updateMany({
          where: { restaurantId, deletedAt: matchedAt, OR: [{ id: matchedEntryId }, { splitFromId: matchedEntryId }] },
          data: { deletedAt: null },
        })]
      : []),
    prisma.creditNote.update({
      where: { id: credit.id },
      data: { status: 'open', matchedEntryId: null, matchedAt: null },
    }),
  ]);
  if (matchedEntryId) await repriceAfter(restaurantId, matchedEntryId);
}

/** An ingredient must not keep a price from a purchase that was cancelled. */
async function repriceAfter(restaurantId: string, costEntryId: string): Promise<void> {
  const parts = await prisma.costEntry.findMany({
    where: { restaurantId, OR: [{ id: costEntryId }, { splitFromId: costEntryId }] },
    select: { id: true },
  });
  const lines = await prisma.invoiceItem.findMany({
    where: { restaurantId, costEntryId: { in: parts.map((p) => p.id) } },
    select: { normalizedName: true, productName: true },
  });
  if (lines.length === 0) return;
  await repriceIngredients(restaurantId, {
    touching: {
      normalizedNames: [...new Set(lines.map((l) => l.normalizedName))],
      sourceNames: [...new Set(lines.map((l) => l.productName.trim().toLowerCase()))],
    },
    clearWhenNone: true,
  });
}

/**
 * A new invoice meeting a credit note that was waiting for it.
 *
 * Runs the same rule from the other side: a credit note can arrive first, and
 * must not wait for someone to remember it. Returns the note's number if one
 * was matched. A failure costs nothing: the invoice is saved and the note waits.
 */
export async function settleWaitingCredits(restaurantId: string, vendorId: string): Promise<string | null> {
  try {
    const waiting = await prisma.creditNote.findMany({
      where: { restaurantId, vendorId, status: 'open' },
      select: { id: true, number: true, amount: true, date: true },
      orderBy: { date: 'asc' },
    });
    if (waiting.length === 0) return null;

    const invoices = await invoicesOfVendor(restaurantId, vendorId);
    for (const note of waiting) {
      const match = automaticMatch({ amount: Number(note.amount), date: dayKey(note.date) }, invoices);
      if (match) {
        await cancelInvoice(restaurantId, note.id, match.costEntryId);
        return note.number;
      }
    }
    return null;
  } catch (error) {
    console.error('Failed to settle waiting credit notes:', error);
    return null;
  }
}
