/**
 * Stock: what is in the house, what it is worth, and what to order.
 *
 * Built on the invoices the restaurant already records. An item is tied to a
 * product name as it appears on invoice lines, so purchases arrive in stock
 * by themselves; the owner only counts. Between counts the app estimates what
 * is in the house (last count + what was bought since), and from two counts
 * it knows what was really used: the actual food cost, not the theoretical
 * one from recipes.
 *
 * Pure, and tested in tests/stock.test.ts.
 */

export interface PurchaseLine {
  normalizedName: string;
  productName: string;
  unit: string | null;
  quantity: number;
  unitPrice: number;
  total: number;
  /** YYYY-MM-DD. */
  date: string;
  vendorId: string | null;
  vendorName: string | null;
}

const round = (n: number, places = 3) => Math.round(n * 10 ** places) / 10 ** places;
const cents = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function lineKey(normalizedName: string, unit: string | null): string {
  return `${normalizedName}|${(unit ?? '').toLowerCase()}`;
}

/** Average price paid per unit, weighted by quantity. Null with nothing bought. */
export function averageUnitCost(lines: PurchaseLine[]): number | null {
  const qty = lines.reduce((s, l) => s + l.quantity, 0);
  if (qty <= 0) return null;
  return round(lines.reduce((s, l) => s + l.total, 0) / qty, 4);
}

export interface ItemSuggestion {
  normalizedName: string;
  name: string;
  unit: string | null;
  vendorId: string | null;
  vendorName: string | null;
  spend: number;
  purchases: number;
}

/**
 * Products bought recently that are not stock items yet, biggest spend first:
 * the shortlist an owner turns into a stock list in one go.
 */
export function suggestItems(lines: PurchaseLine[], existingKeys: Set<string>, limit = 60): ItemSuggestion[] {
  const by = new Map<string, ItemSuggestion & { vendors: Map<string, number> }>();
  for (const l of lines) {
    const key = lineKey(l.normalizedName, l.unit);
    if (existingKeys.has(key)) continue;
    const row = by.get(key) ?? {
      normalizedName: l.normalizedName, name: l.productName, unit: l.unit,
      vendorId: null, vendorName: null, spend: 0, purchases: 0, vendors: new Map(),
    };
    row.spend += l.total;
    row.purchases++;
    if (l.vendorId) row.vendors.set(`${l.vendorId}|${l.vendorName ?? ''}`, (row.vendors.get(`${l.vendorId}|${l.vendorName ?? ''}`) ?? 0) + 1);
    by.set(key, row);
  }
  return [...by.values()]
    .map(({ vendors, ...r }) => {
      // The supplier it is bought from most often.
      const top = [...vendors.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      const [vendorId, vendorName] = top ? top.split('|') : [null, null];
      return { ...r, spend: cents(r.spend), vendorId: vendorId || null, vendorName: vendorName || null };
    })
    .sort((a, b) => b.spend - a.spend)
    .slice(0, limit);
}

/**
 * The items behind most of the spending: counting these every week catches
 * nearly all the money for a fraction of the work of a full count.
 */
export function essentialItemIds(spendById: Map<string, number>, share = 0.8): Set<string> {
  const ranked = [...spendById.entries()].filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1]);
  const total = ranked.reduce((s, [, v]) => s + v, 0);
  const out = new Set<string>();
  let running = 0;
  for (const [id, spend] of ranked) {
    if (total > 0 && running / total >= share) break;
    out.add(id);
    running += spend;
  }
  return out;
}

/** In the house now: the last count plus what was bought after it. Null if never counted. */
export function estimatedOnHand(lastCount: { quantity: number; date: string } | null, purchasesSince: number): number | null {
  if (!lastCount) return null;
  return round(lastCount.quantity + purchasesSince);
}

/**
 * How much to order: up to twice the minimum, which leaves room until the
 * next delivery. Nothing when the item is at or above its minimum, or when it
 * has none.
 */
export function orderQuantity(onHand: number | null, minimum: number | null): number {
  if (minimum === null || minimum <= 0 || onHand === null || onHand >= minimum) return 0;
  return round(Math.max(0, minimum * 2 - onHand));
}

/**
 * What was really used between two counts: what was there, plus what came
 * in, minus what is left. Negative usage means a count or a purchase is
 * missing, and is reported as such rather than hidden.
 */
export function usage(previous: number, purchased: number, current: number): number {
  return round(previous + purchased - current);
}
