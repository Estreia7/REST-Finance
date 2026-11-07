/**
 * What to tell the owner after photographing an invoice.
 *
 * "Queued" and "failed" are both "not saved", but they are not the same news:
 * a queued invoice is safe and waiting in Precisa de ti, a failed one has to be
 * photographed again.
 */

export type ScanOutcome = 'reading' | 'saved' | 'already' | 'queued' | 'failed';

/** The news so far, from the invoices of this sitting in the order taken. */
export function scanOutcome(statuses: string[]): ScanOutcome | null {
  if (statuses.length === 0) return null;
  if (statuses.some((s) => s === 'waiting' || s === 'reading')) return 'reading';
  const last = statuses[statuses.length - 1];
  return last === 'saved' || last === 'already' || last === 'failed' ? last : 'queued';
}
