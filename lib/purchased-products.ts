/**
 * What the restaurant buys, product by product.
 *
 * A product is every invoice line carrying the same name, whoever printed it:
 * the same wine bought from the usual wholesaler and, the week they ran out,
 * from the cash-and-carry, is one product with two suppliers — which is the
 * comparison an owner wants to make.
 *
 * Prices are only compared within one unit. A box and a kilo of the same
 * thing are different purchases, and a range spanning both would be a number
 * nobody can use, so the range and the chart follow the unit the most money
 * went on, and the purchases in any other unit are counted and said.
 *
 * Pure, and tested in tests/purchased-products.test.ts.
 */

export interface PurchaseLine {
  id: string;
  normalizedName: string;
  productName: string;
  unit: string | null;
  quantity: number;
  unitPrice: number;
  total: number;
  /** YYYY-MM-DD, or null when the invoice had no date. */
  date: string | null;
  invoiceNumber: string | null;
  vendorId: string | null;
  vendorName: string | null;
}

export interface PurchasedProduct {
  normalizedName: string;
  /** The wording on the most recent invoice. */
  name: string;
  spend: number;
  purchases: number;
  suppliers: string[];
  /** The unit the most money went on. */
  unit: string | null;
  lastUnitPrice: number | null;
  lastDate: string | null;
}

export interface SupplierShare {
  vendorId: string | null;
  vendorName: string | null;
  spend: number;
  purchases: number;
  lastUnitPrice: number | null;
  lastDate: string | null;
}

export interface ProductDetail {
  normalizedName: string;
  name: string;
  spend: number;
  purchases: number;
  unit: string | null;
  /** Cheapest and dearest price paid, in `unit`. Null with no dated price. */
  minPrice: number | null;
  maxPrice: number | null;
  /** Oldest first, in `unit` only: what the chart draws. */
  points: Array<{ date: string; unitPrice: number; vendorName: string | null }>;
  /** Purchases in another unit, left out of the range and the chart. */
  otherUnitPurchases: number;
  suppliers: SupplierShare[];
  /** Every purchase, newest first. */
  history: PurchaseLine[];
}

const cents = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const unitOf = (l: PurchaseLine) => (l.unit ?? '').trim().toLowerCase();

/** Newest first; undated lines last, since they cannot be placed. */
function byDateDesc(a: PurchaseLine, b: PurchaseLine): number {
  if (a.date === b.date) return 0;
  if (a.date === null) return 1;
  if (b.date === null) return -1;
  return a.date < b.date ? 1 : -1;
}

/** The unit carrying the most spend, as written on the lines. */
function mainUnit(lines: PurchaseLine[]): string | null {
  const spend = new Map<string, { total: number; label: string | null }>();
  for (const l of lines) {
    const key = unitOf(l);
    const row = spend.get(key) ?? { total: 0, label: l.unit?.trim() || null };
    row.total += l.total;
    spend.set(key, row);
  }
  const top = [...spend.values()].sort((a, b) => b.total - a.total)[0];
  return top?.label ?? null;
}

/** Every product bought, biggest spend first. */
export function summarizePurchases(lines: PurchaseLine[]): PurchasedProduct[] {
  const groups = new Map<string, PurchaseLine[]>();
  for (const l of lines) {
    const group = groups.get(l.normalizedName) ?? [];
    group.push(l);
    groups.set(l.normalizedName, group);
  }

  return [...groups.entries()]
    .map(([normalizedName, group]) => {
      const sorted = [...group].sort(byDateDesc);
      const unit = mainUnit(group);
      const lastInUnit = sorted.find((l) => unitOf(l) === (unit ?? '').toLowerCase());
      const suppliers = [...new Set(group.map((l) => l.vendorName).filter((n): n is string => Boolean(n)))];
      return {
        normalizedName,
        name: sorted[0].productName,
        spend: cents(group.reduce((s, l) => s + l.total, 0)),
        purchases: group.length,
        suppliers,
        unit,
        lastUnitPrice: lastInUnit?.unitPrice ?? null,
        lastDate: sorted[0].date,
      };
    })
    .sort((a, b) => b.spend - a.spend);
}

/** One product's spend, price range, price over time and purchases. */
export function productDetail(lines: PurchaseLine[]): ProductDetail | null {
  if (lines.length === 0) return null;

  const history = [...lines].sort(byDateDesc);
  const unit = mainUnit(lines);
  const unitKey = (unit ?? '').toLowerCase();
  const inUnit = lines.filter((l) => unitOf(l) === unitKey);
  const priced = inUnit.filter((l) => l.unitPrice > 0);

  const points = priced
    .filter((l): l is PurchaseLine & { date: string } => l.date !== null)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .map((l) => ({ date: l.date, unitPrice: l.unitPrice, vendorName: l.vendorName }));

  const prices = priced.map((l) => l.unitPrice);

  const bySupplier = new Map<string, PurchaseLine[]>();
  for (const l of history) {
    const key = l.vendorId ?? `name:${l.vendorName ?? ''}`;
    const group = bySupplier.get(key) ?? [];
    group.push(l);
    bySupplier.set(key, group);
  }
  const suppliers: SupplierShare[] = [...bySupplier.values()]
    .map((group) => {
      // `history` is newest first, so each group is too.
      const last = group.find((l) => unitOf(l) === unitKey && l.unitPrice > 0);
      return {
        vendorId: group[0].vendorId,
        vendorName: group[0].vendorName,
        spend: cents(group.reduce((s, l) => s + l.total, 0)),
        purchases: group.length,
        lastUnitPrice: last?.unitPrice ?? null,
        lastDate: group[0].date,
      };
    })
    .sort((a, b) => b.spend - a.spend);

  return {
    normalizedName: lines[0].normalizedName,
    name: history[0].productName,
    spend: cents(lines.reduce((s, l) => s + l.total, 0)),
    purchases: lines.length,
    unit,
    minPrice: prices.length ? Math.min(...prices) : null,
    maxPrice: prices.length ? Math.max(...prices) : null,
    points,
    otherUnitPurchases: lines.length - inUnit.length,
    suppliers,
    history,
  };
}
