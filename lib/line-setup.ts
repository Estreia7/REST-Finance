import type { RememberedPack } from './invoice-matching';
import { lineKey } from './invoice-categories';

/**
 * Setting up an invoice line, once, after the invoice is saved.
 *
 * An invoice goes in the moment it is read: the money must not wait for anyone
 * to explain what "PAO HAMB 4UN" is. Whatever the restaurant has not answered
 * yet waits in "Precisa de ti", one card per wording and supplier, and the
 * answer reaches every invoice already saved and every one to come.
 *
 * The answer that matters most is how a purchase is counted: six bought, four
 * buns in each, is twenty-four buns; four lettuces at 500 g are two kilos.
 *
 * Pure: the server reads and writes, this decides.
 */

export const PACK_UNITS = ['un', 'kg', 'g', 'L', 'ml'] as const;
export type PackUnit = (typeof PACK_UNITS)[number];

/** What one purchased unit holds, as the owner typed it. */
export interface PackInput {
  amount: number;
  unit: PackUnit;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function cents(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * The answer as the app stores it, in kilos, litres or units.
 *
 * One unit in each is simply counting what was bought. Null when the amount
 * is not a usable quantity.
 */
export function toPack(input: PackInput): RememberedPack | null {
  const { amount, unit } = input;
  if (!Number.isFinite(amount) || amount <= 0) return null;
  if (unit === 'un') return amount === 1 ? 'packages' : { amount, unit: 'un' };
  if (unit === 'g') return { amount: round3(amount / 1000), unit: 'kg' };
  if (unit === 'ml') return { amount: round3(amount / 1000), unit: 'L' };
  return { amount, unit };
}

/** A stored answer back in the unit a person would say it in: 500 g, not 0,5 kg. */
export function toPackInput(pack: RememberedPack | null): PackInput | null {
  if (pack === null) return null;
  if (pack === 'packages') return { amount: 1, unit: 'un' };
  if (pack.unit === 'kg' && pack.amount < 1) return { amount: round3(pack.amount * 1000), unit: 'g' };
  if (pack.unit === 'L' && pack.amount < 1) return { amount: round3(pack.amount * 1000), unit: 'ml' };
  return { amount: pack.amount, unit: pack.unit };
}

/** The unit an ingredient is measured in, for what a package holds. */
export function ingredientUnitFor(unit: PackUnit): 'un' | 'kg' | 'L' {
  if (unit === 'g' || unit === 'kg') return 'kg';
  if (unit === 'ml' || unit === 'L') return 'L';
  return 'un';
}

/**
 * The unit a new ingredient is measured in: what the invoice weighs it in, or
 * failing that what one package holds. A line printed in kilos answers "how
 * does it come" with nothing, and that must not make it an ingredient by the unit.
 */
export function newIngredientUnit(lineUnits: Array<string | null>, pack: PackUnit): 'un' | 'kg' | 'L' {
  const measured = lineUnits.find((u) => isMeasured(u))?.trim().toLowerCase();
  if (measured) return measured === 'kg' ? 'kg' : 'L';
  return ingredientUnitFor(pack);
}

/** Priced or weighed already, so what a package holds does not apply. */
export function isMeasured(unit: string | null | undefined): boolean {
  const u = (unit ?? '').trim().toLowerCase();
  return u === 'kg' || u === 'l';
}

export interface StoredLine {
  quantity: number;
  unit: string | null;
  total: number;
  /** What the printed quantity was multiplied by; null when it never was. */
  packFactor: number | null;
}

/** How many were bought, as printed on the invoice. */
export function printedQuantity(line: Pick<StoredLine, 'quantity' | 'packFactor'>): number {
  return line.packFactor ? round3(line.quantity / line.packFactor) : line.quantity;
}

/**
 * A saved line restated by an answer, or null when it stays as it is.
 *
 * Always worked out from the printed quantity, through `packFactor`, so
 * correcting an answer can never multiply a line twice. A line printed by
 * weight is left alone, and so is a fractional count: 2,5 of something is a
 * weight the reader labelled badly, and multiplying it would invent goods.
 */
export function restateLine(
  line: StoredLine,
  pack: RememberedPack,
): { quantity: number; unit: string; unitPrice: number; packFactor: number | null } | null {
  if (!line.packFactor && isMeasured(line.unit)) return null;
  const printed = printedQuantity(line);
  if (!Number.isInteger(printed) || printed <= 0) return null;

  if (pack === 'packages') {
    if (!line.packFactor) return null;
    return { quantity: printed, unit: 'un', unitPrice: round4(line.total / printed), packFactor: null };
  }

  const quantity = round3(printed * pack.amount);
  if (quantity <= 0) return null;
  return { quantity, unit: pack.unit, unitPrice: round4(line.total / quantity), packFactor: pack.amount };
}

/**
 * Whether a line just read still needs the owner.
 *
 * Nothing is asked where the answer is already known: a running cost or a
 * line said not to be an ingredient, or one linked to an ingredient that its
 * quantity can price.
 */
export function lineNeedsSetup(line: {
  linked: boolean;
  notIngredient: boolean;
  runningCost: boolean;
  unit?: string | null;
  /** The owner already said how this wording is counted. */
  packAnswered: boolean;
  /** A size was found: settled by itself, or only a guess. */
  packSettled: boolean | null;
  /** The units of the ingredients it feeds. */
  ingredientUnits: Array<string | undefined>;
}): boolean {
  if (line.notIngredient || line.runningCost) return false;
  if (!line.linked) return true;
  if (line.packSettled === false) return true;
  if (isMeasured(line.unit) || line.packAnswered || line.packSettled) return false;
  // Bought by the unit and feeding something measured by weight: its price
  // means nothing until someone says what one unit holds.
  return !line.ingredientUnits.every((u) => u === 'un');
}

/**
 * The usual price, when this one looks wrong against it.
 *
 * Compared with the middle of past prices in the same unit, so one old mistake
 * does not set the bar. Null with too little history, or within 30%.
 */
export function unusualPrice(price: number, history: number[]): number | null {
  if (history.length < 2 || !(price > 0)) return null;
  const sorted = [...history].sort((a, b) => a - b);
  const middle = sorted[Math.floor(sorted.length / 2)];
  if (!(middle > 0)) return null;
  return Math.abs(price - middle) / middle > 0.3 ? middle : null;
}

/** The units a purchase can be corrected to. */
export const LINE_UNITS = ['kg', 'L', 'un'] as const;
export type LineUnit = (typeof LINE_UNITS)[number];

/**
 * The other figure, once one has been typed.
 *
 * The owner knows either what a kilo cost or what the line cost, depending on
 * the invoice. Whichever they typed last stands and the other follows it.
 */
export function followFigures(
  quantity: number,
  unitPrice: number,
  total: number,
  stands: 'unitPrice' | 'total',
): { unitPrice: number; total: number } {
  if (!(quantity > 0)) return { unitPrice, total };
  return stands === 'unitPrice'
    ? { unitPrice, total: cents(quantity * unitPrice) }
    : { unitPrice: round4(total / quantity), total };
}

/**
 * What a saved line becomes when the owner says what was really bought, or
 * null when the figures cannot be right.
 *
 * Typed by hand, so it is the purchase itself and not a print to multiply.
 */
export function correctedLine(input: {
  quantity: number;
  unit: string;
  unitPrice: number;
  total: number;
}): { quantity: number; unit: LineUnit; unitPrice: number; totalPrice: number; packFactor: null } | null {
  const unit = LINE_UNITS.find((u) => u === input.unit);
  const quantity = round3(input.quantity);
  const unitPrice = round4(input.unitPrice);
  const totalPrice = cents(input.total);
  if (!unit || !(quantity > 0) || !(unitPrice > 0) || !(totalPrice > 0)) return null;
  // A price is printed to the cent, so a big quantity drifts a little from its total.
  if (Math.abs(quantity * unitPrice - totalPrice) > 0.02 + quantity * 0.005) return null;
  return { quantity, unit, unitPrice, totalPrice, packFactor: null };
}

export interface SavedLine extends StoredLine {
  id?: string;
  productName: string;
  vendorId: string | null;
  vendorName: string | null;
  categoryId: string | null;
  /** The invoice date, newest wins as the example shown. */
  date: string;
  invoiceNumber?: string | null;
}

/** One wording from one supplier, however many invoices carry it. */
export interface WordingGroup {
  key: string;
  sourceName: string;
  vendorId: string | null;
  vendorName: string | null;
  productName: string;
  /** The latest purchase's line, which is the one a correction changes. */
  itemId: string | null;
  /** The latest invoice carrying it, to open beside the card. */
  invoiceNumber: string | null;
  /** The latest purchase, as printed. */
  quantity: number;
  unit: string | null;
  total: number;
  categoryId: string | null;
  /** Everything spent on it so far. */
  spent: number;
  lines: number;
}

/** Groups saved lines into one entry per wording, most money first. */
export function groupWordings(lines: SavedLine[]): WordingGroup[] {
  const groups = new Map<string, WordingGroup & { latest: string }>();
  for (const line of lines) {
    const sourceName = lineKey(line.productName);
    const key = `${line.vendorId ?? ''}|${sourceName}`;
    const seen = groups.get(key);
    const newer = !seen || line.date >= seen.latest;
    const example = {
      productName: line.productName,
      itemId: line.id ?? null,
      invoiceNumber: line.invoiceNumber ?? null,
      quantity: printedQuantity(line),
      unit: line.packFactor ? 'un' : line.unit,
      total: line.total,
      categoryId: line.categoryId,
      latest: line.date,
    };
    groups.set(key, {
      key,
      sourceName,
      vendorId: line.vendorId,
      vendorName: line.vendorName,
      spent: (seen?.spent ?? 0) + line.total,
      lines: (seen?.lines ?? 0) + 1,
      ...(newer ? example : {
        productName: seen.productName, itemId: seen.itemId, invoiceNumber: seen.invoiceNumber, quantity: seen.quantity, unit: seen.unit,
        total: seen.total, categoryId: seen.categoryId, latest: seen.latest,
      }),
    });
  }
  return [...groups.values()]
    .map(({ latest: _latest, ...group }) => ({ ...group, spent: Math.round(group.spent * 100) / 100 }))
    .sort((a, b) => b.spent - a.spent);
}
