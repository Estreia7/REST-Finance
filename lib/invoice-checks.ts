import type { InvoiceQrData } from './pt-invoice-qr';

/**
 * Proving a reading right, instead of hoping it is.
 *
 * A reader that shifts a column gives numbers that look fine: the mushrooms
 * came back as "1 at 0,905, total 3,69" when the invoice said 0,905 kg at 3,69
 * the kilo, 3,34 before VAT. Nothing looked wrong, and nothing was checked.
 *
 * An invoice checks itself. Each line multiplies out, and the lines of each
 * VAT rate add up to the base on the document. A certified invoice also states
 * those bases in its QR code, written by the till and not read off paper, so a
 * reading can be proved to the cent.
 *
 * Pure: reading and storing happen elsewhere.
 */

export interface CheckedLine {
  quantity: number;
  unitPrice: number;
  /** The line's value before VAT. */
  total: number;
  /** Percentage, as printed: 6, 13, 23. */
  vatRate?: number | null;
  grossTotal?: number | null;
}

export interface CheckedReading {
  items: CheckedLine[];
  grandTotal: number;
  /** The VAT table printed on the document, when the reader found one. */
  vatSummary?: Array<{ rate: number; base: number; tax: number }> | null;
}

/** What the document says the lines must add up to, per VAT rate. */
export interface TaxTruth {
  rate: number;
  base: number;
  tax: number;
}

export type ProofStatus = 'proved' | 'partial' | 'failed';

export type ProofProblem =
  | { kind: 'line'; index: number; expected: number; found: number }
  | { kind: 'lineVat'; index: number; expected: number; found: number }
  | { kind: 'noRate'; index: number }
  | { kind: 'band'; rate: number; expected: number; found: number }
  | { kind: 'total'; expected: number; found: number };

export interface Proof {
  status: ProofStatus;
  /** Where the bases came from: the QR is the record, print is a reading. */
  source: 'qr' | 'printed' | 'none';
  truth: TaxTruth[];
  problems: ProofProblem[];
  /** Before VAT: what the document says, and what the lines add up to. */
  expectedNet: number | null;
  linesNet: number;
  /** What is still missing from the lines; negative when there is too much. */
  gap: number;
}

function cents(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * The room a line has to be off by rounding alone.
 *
 * A unit price is printed to the cent, so a large quantity can drift from its
 * own total by half a cent per unit without anything being wrong.
 */
function lineTolerance(quantity: number): number {
  return 0.02 + Math.abs(quantity) * 0.005;
}

/** Each line is rounded on its own, so a sum drifts by up to a cent a line. */
function sumTolerance(lines: number): number {
  return 0.02 + lines * 0.01;
}

/** The bases to prove against: the QR if there is one, or what was printed. */
export function taxTruth(
  reading: Pick<CheckedReading, 'vatSummary'>,
  qr: Pick<InvoiceQrData, 'taxes'> | null,
): { source: Proof['source']; truth: TaxTruth[] } {
  if (qr?.taxes?.length) return { source: 'qr', truth: qr.taxes };
  if (reading.vatSummary?.length) return { source: 'printed', truth: reading.vatSummary };
  return { source: 'none', truth: [] };
}

/**
 * Checks a reading against itself and against the document's own figures.
 *
 * `proved` needs the QR. Print alone can only reach `partial`, because a reader
 * that misread the table would be checked against its own mistake.
 */
export function checkReading(reading: CheckedReading, qr: Pick<InvoiceQrData, 'taxes'> | null): Proof {
  const { source, truth } = taxTruth(reading, qr);
  const problems: ProofProblem[] = [];

  reading.items.forEach((line, index) => {
    const expected = line.quantity * line.unitPrice;
    if (Math.abs(expected - line.total) > lineTolerance(line.quantity)) {
      problems.push({ kind: 'line', index, expected: cents(expected), found: line.total });
    }
    if (line.vatRate != null && line.grossTotal != null) {
      const gross = line.total * (1 + line.vatRate / 100);
      if (Math.abs(gross - line.grossTotal) > 0.03) {
        problems.push({ kind: 'lineVat', index, expected: cents(gross), found: line.grossTotal });
      }
    }
    if (line.vatRate == null && truth.length > 1) problems.push({ kind: 'noRate', index });
  });

  const linesNet = cents(reading.items.reduce((sum, l) => sum + l.total, 0));
  const expectedNet = truth.length ? cents(truth.reduce((sum, b) => sum + b.base, 0)) : null;
  const allowed = sumTolerance(reading.items.length);

  for (const band of truth) {
    const found = cents(
      reading.items.filter((l) => l.vatRate === band.rate).reduce((sum, l) => sum + l.total, 0),
    );
    if (Math.abs(found - band.base) > allowed) {
      problems.push({ kind: 'band', rate: band.rate, expected: band.base, found });
    }
  }

  // Without any table, the VAT on the lines must still reach what was paid.
  if (truth.length === 0 && reading.items.every((l) => l.vatRate != null)) {
    const gross = cents(reading.items.reduce((sum, l) => sum + l.total * (1 + (l.vatRate ?? 0) / 100), 0));
    if (Math.abs(gross - reading.grandTotal) > allowed) {
      problems.push({ kind: 'total', expected: reading.grandTotal, found: gross });
    }
  }

  const status: ProofStatus = problems.length > 0 ? 'failed' : source === 'qr' ? 'proved' : 'partial';
  return {
    status,
    source,
    truth,
    problems,
    expectedNet,
    linesNet,
    gap: expectedNet === null ? 0 : cents(expectedNet - linesNet),
  };
}

/**
 * Whether a line is the invoice's discount note rather than something bought.
 *
 * "Desconto total 0,25" in the totals block tells the customer what they saved:
 * the line values already include it, so as a line it counts it twice. Only ever
 * dropped when the figures come out better without it, because a discount
 * printed among the products can be a real line.
 */
export function isDiscountNote(productName: string): boolean {
  return /^\s*(total\s+(de\s+)?)?descontos?\b/i.test(productName);
}

/** Largest number of partial answers kept per line, so a long invoice stays quick. */
const MAX_STATES = 6_000;

interface SettleState {
  changes: number;
  from: string;
  rate: number;
}

/** The rates that bring the lines to the bases within `tolerance`, changing as few as possible. */
function settleWithin(
  lines: Array<Pick<CheckedLine, 'total' | 'vatRate'>>,
  truth: TaxTruth[],
  tolerance: number,
): number[] | null {
  const toCents = (n: number) => Math.round(n * 100);
  const totals = lines.map((l) => toCents(l.total));
  const bases = truth.map((b) => toCents(b.base));
  const slack = toCents(tolerance);

  // What the lines still to come can add or take away, for ruling out dead ends.
  const addable = new Array<number>(lines.length + 1).fill(0);
  const removable = new Array<number>(lines.length + 1).fill(0);
  for (let i = lines.length - 1; i >= 0; i--) {
    addable[i] = addable[i + 1] + Math.max(0, totals[i]);
    removable[i] = removable[i + 1] + Math.max(0, -totals[i]);
  }

  const start = truth.map(() => 0).join(',');
  const layers: Array<Map<string, SettleState>> = [new Map([[start, { changes: 0, from: '', rate: 0 }]])];

  for (let i = 0; i < lines.length; i++) {
    const next = new Map<string, SettleState>();
    for (const [key, state] of layers[i]) {
      const sums = key.split(',').map(Number);
      truth.forEach((band, b) => {
        const moved = [...sums];
        moved[b] += totals[i];
        const reachable = moved.every((sum, k) =>
          sum - removable[i + 1] <= bases[k] + slack && sum + addable[i + 1] >= bases[k] - slack);
        if (!reachable) return;
        const nextKey = moved.join(',');
        const changes = state.changes + (lines[i].vatRate === band.rate ? 0 : 1);
        const seen = next.get(nextKey);
        if (!seen || changes < seen.changes) next.set(nextKey, { changes, from: key, rate: band.rate });
      });
    }
    if (next.size === 0) return null;
    layers.push(next.size <= MAX_STATES
      ? next
      : new Map([...next.entries()].sort((a, b) => a[1].changes - b[1].changes).slice(0, MAX_STATES)));
  }

  let best: [string, SettleState] | null = null;
  for (const entry of layers[lines.length]) {
    const fits = entry[0].split(',').every((sum, b) => Math.abs(Number(sum) - bases[b]) <= slack);
    if (fits && (!best || entry[1].changes < best[1].changes)) best = entry;
  }
  if (!best) return null;

  const rates = new Array<number>(lines.length);
  let key = best[0];
  for (let i = lines.length; i > 0; i--) {
    const state = layers[i].get(key);
    if (!state) return null;
    rates[i - 1] = state.rate;
    key = state.from;
  }
  return rates;
}

/**
 * Which VAT rate each line must have for the invoice to add up.
 *
 * The document states what each rate adds up to, and every line's value is
 * known, so the rates are a sum that can be worked out instead of guessed line
 * by line: a Makro invoice prints a code, not a percentage. Changes as few lines
 * as it can, tightest fit first. Two lines of the same value can still swap, so
 * this proposes and the owner looks.
 *
 * Null when no choice of rates fits, which means a value is wrong or a line is
 * missing. A discount note is left out if that is what it takes.
 */
export function settleVat(
  lines: Array<CheckedLine & { productName: string }>,
  truth: TaxTruth[],
): { rates: number[]; changed: number; drop: number[] } | null {
  if (truth.length === 0 || lines.length === 0) return null;

  const attempt = (kept: number[]) => {
    const chosen = kept.map((i) => lines[i]);
    for (const tolerance of [0.01, 0.05, sumTolerance(chosen.length)]) {
      const rates = settleWithin(chosen, truth, tolerance);
      if (rates) return rates;
    }
    return null;
  };

  const all = lines.map((_, i) => i);
  const notes = all.filter((i) => isDiscountNote(lines[i].productName));
  const kept = all.filter((i) => !notes.includes(i));
  const plans = notes.length > 0 ? [all, kept] : [all];

  for (const plan of plans) {
    const rates = attempt(plan);
    if (!rates) continue;
    const full = lines.map((l) => l.vatRate ?? 0);
    plan.forEach((lineIndex, k) => { full[lineIndex] = rates[k]; });
    return {
      rates: full,
      changed: plan.filter((i) => lines[i].vatRate !== full[i]).length,
      drop: all.filter((i) => !plan.includes(i)),
    };
  }
  return null;
}

/**
 * Whether an invoice can go in without anyone looking at it.
 *
 * Only one proved against its QR: the till's own figures, not a reading of
 * paper. Anything else in doubt (who the supplier is, money coming back) still
 * goes past the owner first.
 */
export function canSaveUnseen(input: {
  vendor: string;
  lines: number;
  checks?: {
    proof?: Pick<Proof, 'status'>;
    doubt?: string | null;
    creditNote?: boolean;
    knownVendorIsCustomer?: boolean;
  };
}): boolean {
  const { vendor, lines, checks } = input;
  return checks?.proof?.status === 'proved'
    && !checks.doubt
    && !checks.creditNote
    && !checks.knownVendorIsCustomer
    && vendor.trim().length > 0
    && lines > 0;
}

const RANK: Record<ProofStatus, number> = { proved: 0, partial: 1, failed: 2 };

/** The better of two readings of one document. Ties keep the first. */
export function betterProof(first: Proof, second: Proof): 'first' | 'second' {
  if (RANK[second.status] !== RANK[first.status]) {
    return RANK[second.status] < RANK[first.status] ? 'second' : 'first';
  }
  if (second.problems.length !== first.problems.length) {
    return second.problems.length < first.problems.length ? 'second' : 'first';
  }
  return Math.abs(second.gap) < Math.abs(first.gap) ? 'second' : 'first';
}

/** The figures a second reader is told, so it knows what must add up. */
export function rereadHint(proof: Proof, reading: CheckedReading): string {
  const bands = proof.truth
    .map((b) => `${b.rate}% VAT: base ${b.base.toFixed(2)}, tax ${b.tax.toFixed(2)}`)
    .join('; ');
  const lines = proof.problems
    .flatMap((p) => (p.kind === 'line' ? [p.index] : []))
    .map((i) => {
      const l = reading.items[i];
      return `line ${i + 1} read as ${l.quantity} x ${l.unitPrice} = ${l.total}`;
    })
    .join('; ');
  return [
    '\n\nA first reading of this page did not add up, so read every column again with care.',
    bands ? `The document's own tax record states: ${bands}, total payable ${reading.grandTotal.toFixed(2)}.` : '',
    lines ? `These lines do not multiply out: ${lines}.` : '',
    proof.gap ? `The lines read so far are ${Math.abs(proof.gap).toFixed(2)} ${proof.gap > 0 ? 'short of' : 'over'} the total before VAT, so a line may be missing or misread.` : '',
    'Report only what is printed. Never adjust a figure to make the sum work: if it still does not add up, report what you see.',
  ].filter(Boolean).join(' ');
}
