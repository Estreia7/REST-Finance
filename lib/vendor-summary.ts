/**
 * One supplier at a glance. Pure: the server reads the cost entries.
 *
 * Works on the entries, not the lines: what was spent is what the invoices came
 * to with VAT, and an invoice split across categories is still one invoice.
 */

export interface VendorEntry {
  id: string;
  splitFromId: string | null;
  /** YYYY-MM-DD. */
  date: string;
  amount: number;
  paid: boolean;
}

export interface VendorSummary {
  month: number;
  year: number;
  total: number;
  invoices: number;
  average: number;
  unpaid: number;
  lastPurchase: string | null;
}

const cents = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function vendorSummary(entries: VendorEntry[], todayKey: string): VendorSummary {
  const yearKey = todayKey.slice(0, 4);
  const monthKey = todayKey.slice(0, 7);
  const roots = entries.filter((e) => e.splitFromId === null);
  const total = entries.reduce((sum, e) => sum + e.amount, 0);
  const paidRoots = new Set(roots.filter((e) => e.paid).map((e) => e.id));

  return {
    month: cents(entries.filter((e) => e.date.startsWith(monthKey)).reduce((sum, e) => sum + e.amount, 0)),
    year: cents(entries.filter((e) => e.date.startsWith(yearKey)).reduce((sum, e) => sum + e.amount, 0)),
    total: cents(total),
    invoices: roots.length,
    average: roots.length > 0 ? cents(total / roots.length) : 0,
    // Payment sits on the original; its parts follow it.
    unpaid: cents(entries
      .filter((e) => !paidRoots.has(e.splitFromId ?? e.id))
      .reduce((sum, e) => sum + e.amount, 0)),
    lastPurchase: roots.reduce<string | null>((latest, e) => (!latest || e.date > latest ? e.date : latest), null),
  };
}
