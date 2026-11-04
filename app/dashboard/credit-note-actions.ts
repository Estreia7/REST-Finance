'use server';

import { prisma } from '@/lib/prisma';
import { requireOwner, isAuthError } from '@/lib/auth-helpers';
import { toClientError } from '@/lib/errors';
import { ensureVendor } from '@/lib/vendors-server';
import { automaticMatch, creditCandidates, type CreditStatus, type InvoiceCandidate } from '@/lib/credit-notes';
import { cancelInvoice, invoicesOfVendor, restoreInvoice } from '@/lib/credit-notes-server';

/**
 * Credit notes, as the owner sees them. See lib/credit-notes.ts for the rule.
 */

export interface CreditNoteRow {
  id: string;
  number: string;
  vendorName: string | null;
  date: string;
  amount: number;
  status: CreditStatus;
  imagePath: string | null;
  /** The invoice it cancelled. */
  matched: { invoiceNumber: string | null; date: string } | null;
  /** For one still open: the invoices of the same value. */
  candidates: InvoiceCandidate[];
}

const dayKey = (date: Date) => date.toISOString().slice(0, 10);

/**
 * Records a credit note instead of a cost, and cancels its invoice if there is
 * exactly one it can be. Otherwise it waits, and never reaches the books.
 */
export async function saveCreditNote(input: {
  vendorName: string;
  vendorTaxId?: string | null;
  number: string;
  date: string;
  amount: number;
  scanId?: string | null;
}) {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return { error: owner.error };
    const { restaurantId } = owner;

    const number = input.number?.trim();
    const amount = Math.abs(input.amount);
    const date = new Date(input.date);
    if (!number || !(amount > 0) || Number.isNaN(date.getTime())) return { error: 'credit.errors.incomplete' };

    const existing = await prisma.creditNote.findUnique({
      where: { restaurantId_number: { restaurantId, number } },
      select: { id: true },
    });
    if (existing) return { error: 'credit.errors.duplicate' };

    const vendor = await ensureVendor(restaurantId, input.vendorName, input.vendorTaxId);
    // This restaurant's own reading only; a forged id is simply not linked.
    const scan = input.scanId
      ? await prisma.receiptScan.findFirst({ where: { id: input.scanId, restaurantId }, select: { id: true } })
      : null;

    const note = await prisma.creditNote.create({
      data: { restaurantId, vendorId: vendor.id, number, date, amount, receiptScanId: scan?.id ?? null },
      select: { id: true },
    });
    if (scan) {
      await prisma.receiptScan.update({ where: { id: scan.id }, data: { reviewedAt: new Date() } });
    }

    const match = automaticMatch(
      { amount, date: dayKey(date) },
      await invoicesOfVendor(restaurantId, vendor.id),
    );
    if (match) await cancelInvoice(restaurantId, note.id, match.costEntryId);

    return { success: true as const, data: { matchedInvoice: match?.invoiceNumber ?? null, matched: !!match } };
  } catch (error: unknown) {
    return { error: toClientError('Failed to save the credit note', error, 'write') };
  }
}

export async function getCreditNotes() {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return { error: owner.error };
    const { restaurantId } = owner;

    const notes = await prisma.creditNote.findMany({
      where: { restaurantId },
      orderBy: { date: 'desc' },
      select: {
        id: true, number: true, date: true, amount: true, status: true, vendorId: true, matchedEntryId: true,
        vendor: { select: { name: true } },
        receiptScan: { select: { imageUrl: true } },
      },
      take: 200,
    });

    const matchedIds = notes.flatMap((n) => (n.matchedEntryId ? [n.matchedEntryId] : []));
    const matchedRows = await prisma.costEntry.findMany({
      where: { id: { in: matchedIds }, restaurantId },
      select: { id: true, invoiceNumber: true, date: true },
    });
    const matched = new Map(matchedRows.map((m) => [m.id, m]));

    const invoices = new Map<string, InvoiceCandidate[]>();
    for (const vendorId of new Set(notes.filter((n) => n.status === 'open' && n.vendorId).map((n) => n.vendorId!))) {
      invoices.set(vendorId, await invoicesOfVendor(restaurantId, vendorId));
    }

    const data: CreditNoteRow[] = notes.map((n) => {
      const invoice = n.matchedEntryId ? matched.get(n.matchedEntryId) : undefined;
      const credit = { amount: Number(n.amount), date: dayKey(n.date) };
      return {
        id: n.id,
        number: n.number,
        vendorName: n.vendor?.name ?? null,
        date: credit.date,
        amount: credit.amount,
        status: n.status as CreditStatus,
        imagePath: n.receiptScan?.imageUrl || null,
        matched: invoice ? { invoiceNumber: invoice.invoiceNumber, date: dayKey(invoice.date) } : null,
        candidates: n.status === 'open' && n.vendorId
          ? creditCandidates(credit, invoices.get(n.vendorId) ?? [])
          : [],
      };
    });
    return { success: true as const, data };
  } catch (error: unknown) {
    return { error: toClientError('Failed to read the credit notes', error, 'read') };
  }
}

/** The owner picks the invoice, where more than one fits. */
export async function matchCreditNote(id: string, costEntryId: string) {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return { error: owner.error };
    const { restaurantId } = owner;

    const note = await prisma.creditNote.findFirst({
      where: { id, restaurantId, status: 'open' },
      select: { id: true, vendorId: true, amount: true, date: true },
    });
    if (!note?.vendorId) return { error: 'credit.errors.notFound' };

    // Held to the same rule as the automatic match: a forged id fits nothing.
    const allowed = creditCandidates(
      { amount: Number(note.amount), date: dayKey(note.date) },
      await invoicesOfVendor(restaurantId, note.vendorId),
    );
    if (!allowed.some((c) => c.costEntryId === costEntryId)) return { error: 'credit.errors.notFound' };

    await cancelInvoice(restaurantId, note.id, costEntryId);
    return { success: true as const };
  } catch (error: unknown) {
    return { error: toClientError('Failed to match the credit note', error, 'write') };
  }
}

/** Sets aside a note whose invoice will never be here. It stays off the books. */
export async function dismissCreditNote(id: string) {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return { error: owner.error };

    const { count } = await prisma.creditNote.updateMany({
      where: { id, restaurantId: owner.restaurantId, status: 'open' },
      data: { status: 'dismissed' },
    });
    if (count === 0) return { error: 'credit.errors.notFound' };
    return { success: true as const };
  } catch (error: unknown) {
    return { error: toClientError('Failed to set the credit note aside', error, 'write') };
  }
}

/** Undoes a match or a setting aside: the invoice returns and the note waits again. */
export async function reopenCreditNote(id: string) {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return { error: owner.error };

    const note = await prisma.creditNote.findFirst({
      where: { id, restaurantId: owner.restaurantId },
      select: { id: true, matchedEntryId: true, matchedAt: true },
    });
    if (!note) return { error: 'credit.errors.notFound' };

    await restoreInvoice(owner.restaurantId, note);
    return { success: true as const };
  } catch (error: unknown) {
    return { error: toClientError('Failed to reopen the credit note', error, 'write') };
  }
}
