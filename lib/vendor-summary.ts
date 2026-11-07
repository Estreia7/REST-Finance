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

/** A line with money off in it: a negative line, or a discount taken off a product. */
export interface DiscountLine {
  productName: string;
  total: number;
  discount: number | null;
  discountLabel: string | null;
}

export interface DiscountGroup {
  /** The promotion, as printed. Null when the invoice names none. */
  label: string | null;
  /** Before VAT, as a positive amount. */
  amount: number;
  times: number;
}

export interface VendorSummary {
  discounts: DiscountGroup[];
  month: number;
  year: number;
  total: number;
  invoices: number;
  average: number;
  unpaid: number;
  lastPurchase: string | null;
}

const cents = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** "Desconto total (Leve Mais Pague Menos)" is the promotion in brackets; "Desconto total" names none. */
function promotion(text: string): string | null {
  const name = (text.match(/\(([^)]+)\)/)?.[1] ?? text)
    .replace(/^\s*(total\s+(de\s+)?)?descontos?(\s+total)?\s*/i, '')
    .trim();
  return name || null;
}

/** What a supplier has taken off, per promotion, largest first. */
export function supplierDiscounts(lines: DiscountLine[]): DiscountGroup[] {
  const groups = new Map<string, DiscountGroup>();
  for (const line of lines) {
    const amount = line.total < 0 ? -line.total : line.discount ?? 0;
    if (amount <= 0) continue;
    const label = promotion(line.total < 0 ? line.productName : line.discountLabel ?? '');
    const key = label?.toLowerCase() ?? '';
    const group = groups.get(key) ?? { label, amount: 0, times: 0 };
    group.amount = cents(group.amount + amount);
    group.times += 1;
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => b.amount - a.amount);
}

export function vendorSummary(entries: VendorEntry[], todayKey: string, discountLines: DiscountLine[] = []): VendorSummary {
  const yearKey = todayKey.slice(0, 4);
  const monthKey = todayKey.slice(0, 7);
  const roots = entries.filter((e) => e.splitFromId === null);
  const total = entries.reduce((sum, e) => sum + e.amount, 0);
  const paidRoots = new Set(roots.filter((e) => e.paid).map((e) => e.id));

  return {
    discounts: supplierDiscounts(discountLines),
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
