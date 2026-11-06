import { invoiceUnit } from './line-setup';

/**
 * What went up, and who is cheapest.
 *
 * An owner reads a price alert to decide whether to phone a supplier, so every
 * rise counts, however small and however long ago: the small ones are how a
 * product gets 20% dearer in a year without anyone noticing.
 *
 * Pure: the server reads the purchases, this decides.
 */

/** Below this it is rounding: a price worked out as value over weight wobbles. */
const NOISE_PERCENT = 0.1;

export interface Purchase {
  productName: string;
  normalizedName: string;
  vendorId: string | null;
  vendorName: string | null;
  unit: string | null;
  unitPrice: number;
  /** YYYY-MM-DD; undated purchases cannot be placed in order and are skipped. */
  date: string | null;
}

export interface PriceIncrease {
  productName: string;
  normalizedName: string;
  vendorId: string | null;
  vendorName: string | null;
  unit: string;
  /** The latest rise. */
  previousPrice: number;
  newPrice: number;
  changePercent: number;
  date: string;
  /** How many times it has gone up. */
  rises: number;
  /** From the first purchase to the latest, which can be less than the rises add up to. */
  sinceFirstPercent: number;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Every product that has ever risen, per supplier and unit, biggest latest rise first. */
export function priceIncreases(purchases: Purchase[]): PriceIncrease[] {
  const groups = new Map<string, Purchase[]>();
  for (const purchase of purchases) {
    if (!purchase.date || !(purchase.unitPrice > 0)) continue;
    // Per unit: a kilo against a box is a different thing, not a rise.
    const key = `${purchase.normalizedName}|${purchase.vendorId ?? ''}|${invoiceUnit(purchase.unit)}`;
    const group = groups.get(key);
    if (group) group.push(purchase);
    else groups.set(key, [purchase]);
  }

  const increases: PriceIncrease[] = [];
  for (const group of groups.values()) {
    const ordered = [...group].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
    let rises = 0;
    let latest: { from: number; to: number; date: string } | null = null;

    for (let i = 1; i < ordered.length; i++) {
      const from = ordered[i - 1].unitPrice;
      const to = ordered[i].unitPrice;
      if (((to - from) / from) * 100 < NOISE_PERCENT) continue;
      rises++;
      latest = { from, to, date: ordered[i].date ?? '' };
    }
    if (!latest) continue;

    const last = ordered[ordered.length - 1];
    increases.push({
      productName: last.productName,
      normalizedName: last.normalizedName,
      vendorId: last.vendorId,
      vendorName: last.vendorName,
      unit: invoiceUnit(last.unit),
      previousPrice: latest.from,
      newPrice: latest.to,
      changePercent: round1(((latest.to - latest.from) / latest.from) * 100),
      date: latest.date,
      rises,
      sinceFirstPercent: round1(((last.unitPrice - ordered[0].unitPrice) / ordered[0].unitPrice) * 100),
    });
  }
  return increases.sort((a, b) => b.changePercent - a.changePercent);
}

export interface CheapestOffer {
  vendorName: string | null;
  unitPrice: number;
  date: string;
  /** How many suppliers were compared. */
  suppliers: number;
  /** Less than the price last paid to anyone; zero when this is that price. */
  saving: number;
}

/**
 * The supplier with the lowest price as things stand: each one's latest price,
 * in the unit asked for. What they charged two years ago is not on offer.
 */
export function cheapestToDate(purchases: Purchase[], unit: string | null): CheapestOffer | null {
  const wanted = invoiceUnit(unit);
  const latest = new Map<string, Purchase>();
  let lastPaid: Purchase | null = null;

  for (const purchase of purchases) {
    if (!purchase.date || !(purchase.unitPrice > 0) || invoiceUnit(purchase.unit) !== wanted) continue;
    const key = purchase.vendorId ?? purchase.vendorName ?? '';
    const seen = latest.get(key);
    if (!seen || (purchase.date ?? '') > (seen.date ?? '')) latest.set(key, purchase);
    if (!lastPaid || purchase.date > (lastPaid.date ?? '')) lastPaid = purchase;
  }
  if (!lastPaid) return null;

  const offers = [...latest.values()].sort((a, b) => a.unitPrice - b.unitPrice);
  const best = offers[0];
  return {
    vendorName: best.vendorName,
    unitPrice: best.unitPrice,
    date: best.date ?? '',
    suppliers: offers.length,
    saving: Math.max(0, Math.round((lastPaid.unitPrice - best.unitPrice) * 10000) / 10000),
  };
}
