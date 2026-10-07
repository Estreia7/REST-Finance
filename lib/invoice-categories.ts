import { significantWords } from './invoice-matching';

/**
 * Which kind of cost each invoice line is, and how an invoice's money is
 * shared out between them.
 *
 * One delivery can hold meat, beer and bleach. Booked whole under one
 * category, the bleach inflates food cost and the beer disappears into it —
 * so the category belongs to the line, and an invoice of several categories
 * becomes several costs.
 *
 * Asking the owner the category of every line of every invoice would stop
 * them scanning by the second week. So each restaurant keeps a memory of the
 * answers it has given, and a line is decided by the cheapest thing that
 * knows: the memory first, then wordings that are nearly the same, then the
 * supplier's habit, and only then the reader's guess. Everything but an exact
 * memory is shown as a suggestion; saving it as it stands is an answer too,
 * and is remembered.
 *
 * Pure: the database work lives in the server actions that call this.
 */

export type CostCategoryType = 'COGS' | 'OPEX';

export interface CostCategory {
  id: string;
  name: string;
  type: CostCategoryType;
}

/** One remembered answer: a supplier's wording and what it turned out to be. */
export interface LineMemory {
  sourceName: string;
  vendorId: string | null;
  categoryId: string | null;
  notIngredient: boolean;
  confirmations: number;
}

/**
 * Where a guess came from, most trustworthy first.
 *
 * Only `memory` is treated as known. The rest are offered, and become known
 * once the owner saves them.
 */
export type CategoryOrigin = 'memory' | 'similar' | 'vendor' | 'reader' | 'none';

export interface CategoryGuess {
  categoryId: string | null;
  origin: CategoryOrigin;
  /**
   * Whether the owner said this wording is not a kitchen ingredient. Null
   * when nothing is remembered either way.
   */
  notIngredient: boolean | null;
}

/** The memory's key for a wording — the same one InvoiceItemLink uses. */
export function lineKey(productName: string): string {
  return productName.trim().toLowerCase();
}

/**
 * How many answers about one supplier before its habit is worth suggesting.
 *
 * Three: one invoice from the electricity company says little, three that
 * all went to "Luz" say the next one will too.
 */
const VENDOR_HABIT_MIN = 3;

/** Share of a supplier's answers one category must hold to count as its habit. */
const VENDOR_HABIT_SHARE = 0.9;

/**
 * Whether two wordings name the same kind of thing.
 *
 * Stricter than ingredient matching in one way: a single shared word is not
 * enough. "GAS" (the bottle, Gás) shares its only word with "AGUA COM GAS"
 * (sparkling water, Bebidas), and calling that a match would book drinks as
 * energy. Two words in common, or the same words altogether, is.
 */
function closeWording(a: string, b: string): boolean {
  const wa = new Set(significantWords(a));
  const wb = new Set(significantWords(b));
  if (wa.size === 0 || wb.size === 0) return false;

  let shared = 0;
  for (const w of wa) if (wb.has(w)) shared++;

  if (shared === wa.size && shared === wb.size) return true;
  if (shared < 2) return false;
  // Most of the shorter wording must be there: "SUPER BOCK MINI" and
  // "SUPER BOCK STOUT" are both beer; "CARNE PICADA" and "PICADA DE GELO"
  // share one word and are not.
  return shared / Math.min(wa.size, wb.size) >= 0.75;
}

/**
 * The category a line most likely belongs to.
 *
 * `active` holds the categories that may still be used: a memory pointing at
 * a category the owner has since switched off is no answer at all.
 */
export function guessLineCategory(
  productName: string,
  context: {
    vendorId: string | null;
    memories: LineMemory[];
    active: Set<string>;
    /** What the reader thought, already turned into one of our ids. */
    readerCategoryId?: string | null;
  },
): CategoryGuess {
  const { vendorId, memories, active } = context;
  const key = lineKey(productName);
  const usable = (m: LineMemory) => m.categoryId !== null && active.has(m.categoryId);

  // 1. Remembered: this exact wording. This supplier's answer first; another
  //    supplier's counts too, since "COCA COLA 33CL" is the same drink from
  //    whichever wholesaler, and asking again would be asking for nothing.
  const exact = memories.filter((m) => m.sourceName === key);
  const sameVendor = exact.find((m) => m.vendorId === vendorId);
  const notIngredient = sameVendor
    ? sameVendor.notIngredient
    : exact.length > 0
      ? exact.some((m) => m.notIngredient)
      : null;

  const remembered =
    (sameVendor && usable(sameVendor) ? sameVendor : null) ??
    exact.filter(usable).sort((a, b) => b.confirmations - a.confirmations)[0];
  if (remembered) {
    return { categoryId: remembered.categoryId, origin: 'memory', notIngredient };
  }

  // 2. A wording that is nearly the same. Votes weighted by how often each
  //    answer was confirmed, and doubled for the same supplier, whose
  //    wordings are the likeliest to mean the same thing.
  const votes = new Map<string, number>();
  for (const m of memories) {
    if (!usable(m) || !closeWording(productName, m.sourceName)) continue;
    const weight = m.confirmations * (m.vendorId === vendorId ? 2 : 1);
    votes.set(m.categoryId!, (votes.get(m.categoryId!) ?? 0) + weight);
  }
  const similar = topOf(votes);
  if (similar) return { categoryId: similar, origin: 'similar', notIngredient };

  // 3. The supplier's habit. The electricity company only ever sells
  //    electricity; a cash-and-carry sells everything, and never gets here.
  if (vendorId) {
    const habit = new Map<string, number>();
    let total = 0;
    for (const m of memories) {
      if (m.vendorId !== vendorId || !usable(m)) continue;
      habit.set(m.categoryId!, (habit.get(m.categoryId!) ?? 0) + m.confirmations);
      total += m.confirmations;
    }
    const top = topOf(habit);
    if (top && total >= VENDOR_HABIT_MIN && habit.get(top)! / total >= VENDOR_HABIT_SHARE) {
      return { categoryId: top, origin: 'vendor', notIngredient };
    }
  }

  // 4. The reader's guess, made from the restaurant's own list of categories.
  if (context.readerCategoryId && active.has(context.readerCategoryId)) {
    return { categoryId: context.readerCategoryId, origin: 'reader', notIngredient };
  }

  return { categoryId: null, origin: 'none', notIngredient };
}

/** The key with the most weight; ties go to the first seen. */
function topOf(weights: Map<string, number>): string | null {
  let best: string | null = null;
  let bestWeight = 0;
  for (const [key, weight] of weights) {
    if (weight > bestWeight) {
      best = key;
      bestWeight = weight;
    }
  }
  return best;
}

/**
 * What an answer does to what was remembered.
 *
 * The same answer again makes it surer; a different one replaces it and
 * starts again from one, since a correction says the old answer was wrong,
 * not that it was nearly right.
 */
export function nextConfirmations(
  previous: { categoryId: string | null; confirmations: number } | null,
  categoryId: string | null,
): number {
  if (!previous || previous.categoryId !== categoryId) return 1;
  return previous.confirmations + 1;
}

/** One cost an invoice becomes. */
export interface InvoicePart {
  categoryId: string | null;
  amount: number;
  /** Positions, in the lines given, of the lines this part holds. */
  lines: number[];
}

/**
 * Shares an invoice's total out between its categories.
 *
 * In proportion to what the lines of each category add up to. The lines are
 * usually before VAT and the total after, and food (6%) and drink (23%) carry
 * different rates, so the split is an estimate of each category's VAT — but
 * the parts always add up to the total to the cent, which is the figure the
 * P&L and the accountant reconcile against.
 *
 * Largest first, so the cost entry the invoice was saved as can keep the
 * biggest part and the others hang off it.
 *
 * A category whose lines come to nothing or less — a discount line in a
 * category of its own — has no share to carry, and joins the largest part.
 */
export function splitInvoiceTotal(
  lines: Array<{ categoryId: string | null; total: number }>,
  grandTotal: number,
): InvoicePart[] {
  const groups = new Map<string | null, { sum: number; lines: number[] }>();
  lines.forEach((line, i) => {
    const group = groups.get(line.categoryId) ?? { sum: 0, lines: [] };
    group.sum += line.total;
    group.lines.push(i);
    groups.set(line.categoryId, group);
  });

  const all = [...groups.entries()].map(([categoryId, g]) => ({ categoryId, ...g }));
  const positive = all.filter((g) => g.sum > 0).sort((a, b) => b.sum - a.sum);

  // Nothing to apportion by — a credit note, or lines without totals. The
  // invoice stays one cost, under its largest category.
  if (positive.length <= 1) {
    const main = positive[0] ?? [...all].sort((a, b) => b.lines.length - a.lines.length)[0];
    return [{
      categoryId: main ? main.categoryId : null,
      amount: round2(grandTotal),
      lines: lines.map((_, i) => i),
    }];
  }

  for (const g of all) {
    if (g.sum <= 0) positive[0].lines.push(...g.lines);
  }

  // Shared in cents by largest remainder, so nothing is lost or invented
  // to rounding.
  // Worked on the size of the total and signed at the end, so a negative one
  // (a credit note read with positive lines) still adds up to the cent.
  const sign = grandTotal < 0 ? -1 : 1;
  const totalCents = Math.round(Math.abs(grandTotal) * 100);
  const base = positive.reduce((s, g) => s + g.sum, 0);
  const shares = positive.map((g) => {
    const exact = (totalCents * g.sum) / base;
    return { g, cents: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });
  let left = totalCents - shares.reduce((s, x) => s + x.cents, 0);
  for (const share of [...shares].sort((a, b) => b.remainder - a.remainder)) {
    if (left <= 0) break;
    share.cents++;
    left--;
  }

  return shares
    .map(({ g, cents }) => ({
      categoryId: g.categoryId,
      amount: (sign * cents) / 100,
      lines: [...g.lines].sort((a, b) => a - b),
    }))
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
