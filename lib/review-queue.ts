/**
 * Photographs of one invoice waiting side by side.
 *
 * An owner told a photo was not good enough takes another, and both then wait for
 * review. Which one stays is the owner's call, so copies are shown together and
 * compared; only a copy of an invoice already saved leaves by itself.
 *
 * Pure: reading and storing happen in review-queue-server.
 */

export type QueuedData = {
  vendor?: string | null;
  vendorTaxId?: string | null;
  invoiceNumber?: string | null;
  grandTotal?: number | null;
} | null;

export interface QueuedReading {
  id: string;
  proofStatus: string | null;
  data: QueuedData;
}

const RANK: Record<string, number> = { proved: 2, partial: 1 };
const rank = (scan: Pick<QueuedReading, 'proofStatus'>) => RANK[scan.proofStatus ?? ''] ?? 0;

/**
 * Who issued which number, or null when the reading does not say. Numbers repeat
 * between suppliers, so a number alone proves nothing.
 */
export function copyKey(data: QueuedData): string | null {
  const number = data?.invoiceNumber?.trim().toLowerCase();
  const supplier = (data?.vendorTaxId || data?.vendor)?.trim().toLowerCase();
  return number && supplier ? `${supplier}|${number}` : null;
}

/**
 * The same, with the total agreeing too: what it takes to act with nobody asked.
 * A misread number must not take a different invoice off the list.
 */
export function documentKey(data: QueuedData): string | null {
  const key = copyKey(data);
  return key === null || data?.grandTotal == null ? null : `${key}|${data.grandTotal.toFixed(2)}`;
}

/** The waiting readings of invoices already saved: nothing is left to decide. */
export function supersededScans(queued: QueuedReading[], saved: QueuedData[]): string[] {
  const savedKeys = new Set(saved.map(documentKey).filter((key) => key !== null));
  return queued.filter((scan) => {
    const key = documentKey(scan.data);
    return key !== null && savedKeys.has(key);
  }).map((scan) => scan.id);
}

/**
 * The queue with copies of an invoice together, the most reliable first and then
 * the newest. Expects oldest first. A reading that names no invoice stands alone.
 */
export function groupCopies<T extends QueuedReading>(queue: T[]): T[][] {
  const groups = new Map<string, T[]>();
  queue.forEach((scan) => {
    const key = copyKey(scan.data) ?? `alone|${scan.id}`;
    groups.set(key, [...(groups.get(key) ?? []), scan]);
  });
  return [...groups.values()].map((group) => (
    group.map((scan, i) => ({ scan, i }))
      .sort((a, b) => rank(b.scan) - rank(a.scan) || b.i - a.i)
      .map(({ scan }) => scan)
  ));
}

/** The copy to suggest, when one is plainly more reliable than the rest. */
export function recommendedCopy(group: QueuedReading[]): string | null {
  const best = Math.max(...group.map(rank));
  const top = group.filter((scan) => rank(scan) === best);
  return group.length > 1 && top.length === 1 ? top[0].id : null;
}
