/**
 * Credit notes: money coming back, never a cost.
 *
 * A credit note cancels an invoice, so it is matched to the invoice of the same
 * value from the same supplier and the two leave the books together. Booking
 * one as a cost did the opposite of what it says, adding what it takes away.
 *
 * Pure: lib/credit-notes-server.ts reads and writes.
 */

export type CreditStatus = 'open' | 'matched' | 'dismissed';

export interface InvoiceCandidate {
  costEntryId: string;
  invoiceNumber: string | null;
  /** YYYY-MM-DD. */
  date: string;
  /** With every part of a split invoice added in. */
  amount: number;
}

/** Whether a document number is a credit note's: "NC NC.2026/1". */
export function isCreditNoteNumber(number: string | null | undefined): boolean {
  return /^NC\b/i.test(number?.trim() ?? '');
}

/**
 * The invoices a credit note can cancel: the same value, never a later date.
 *
 * Newest first, since a credit note usually follows its invoice closely.
 */
export function creditCandidates(
  credit: { amount: number; date: string },
  invoices: InvoiceCandidate[],
): InvoiceCandidate[] {
  return invoices
    .filter((i) => !isCreditNoteNumber(i.invoiceNumber))
    .filter((i) => Math.abs(i.amount - credit.amount) < 0.005 && i.date <= credit.date)
    .sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * The invoice to cancel without asking, or null.
 *
 * Only when there is exactly one. Two invoices of the same value are a real
 * question, and the wrong one would take the wrong purchase off the books.
 */
export function automaticMatch(
  credit: { amount: number; date: string },
  invoices: InvoiceCandidate[],
): InvoiceCandidate | null {
  const found = creditCandidates(credit, invoices);
  return found.length === 1 ? found[0] : null;
}
