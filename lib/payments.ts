/**
 * What is paid, what is still to pay, and when it falls due.
 *
 * Pure: no database, no clock. Dates are calendar days as YYYY-MM-DD, which
 * is how costs are stored (UTC midnight) and how "today" is read in Lisbon,
 * so a cost due on the 10th is never overdue at 23:30 on the 10th.
 */

export const PAYMENT_METHODS = ['CASH', 'MULTIBANCO', 'TRANSFER', 'DIRECT_DEBIT'] as const;
export type PaymentMethodKey = (typeof PAYMENT_METHODS)[number];

/**
 * Days a supplier gives when nothing was agreed. Thirty is the Portuguese
 * legal default for payments between companies (DL 62/2013).
 */
export const DEFAULT_TERMS_DAYS = 30;
/** Longest terms accepted. Anything longer is a typo, not a deal. */
export const MAX_TERMS_DAYS = 365;

/**
 * - paid: settled, by any method.
 * - scheduled: a direct debit that has not left yet. Money about to go out,
 *   never overdue: the bank takes it on the day without anyone acting.
 * - due: still to pay, and not late yet.
 * - overdue: still to pay, past its due date.
 */
export type PaymentState = 'paid' | 'scheduled' | 'due' | 'overdue';

const KEY = /^\d{4}-\d{2}-\d{2}$/;

export function isDayKey(value: unknown): value is string {
  if (typeof value !== 'string' || !KEY.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** A stored calendar day back to its key. */
export function toDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(key: string, days: number): string {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return toDayKey(d);
}

/** Whole days from `from` to `to`; negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/**
 * When a cost falls due.
 *
 * The owner's own date wins. Otherwise a supplier's invoice is due after the
 * supplier's terms, 30 days when none were set. A cost with no supplier at
 * all — rent, wages, a bill typed by hand — falls due on its own date: the
 * date typed is the date it is owed, and there are no terms to add.
 */
export function dueDateFor(input: {
  dateKey: string;
  dueKey?: string | null;
  hasVendor: boolean;
  termsDays?: number | null;
}): string {
  if (input.dueKey) return input.dueKey;
  if (!input.hasVendor) return input.dateKey;
  return addDays(input.dateKey, input.termsDays ?? DEFAULT_TERMS_DAYS);
}

export function paymentState(
  input: { paidKey?: string | null; method?: PaymentMethodKey | null; dueKey: string },
  todayKey: string,
): PaymentState {
  if (input.paidKey) return 'paid';
  if (input.method === 'DIRECT_DEBIT') return input.dueKey <= todayKey ? 'paid' : 'scheduled';
  return input.dueKey < todayKey ? 'overdue' : 'due';
}

/**
 * The day a cost counts as paid, when it is paid. A direct debit is paid on
 * its due date, which is when the bank took it.
 */
export function paidOn(
  input: { paidKey?: string | null; method?: PaymentMethodKey | null; dueKey: string },
  todayKey: string,
): string | null {
  if (input.paidKey) return input.paidKey;
  if (input.method === 'DIRECT_DEBIT' && input.dueKey <= todayKey) return input.dueKey;
  return null;
}

/**
 * How far off a payment is, in the groups an owner plans cash by: what is
 * late, this week, the next week, the rest of the month, and later.
 */
export const BUCKETS = ['overdue', 'week', 'fortnight', 'month', 'later'] as const;
export type Bucket = (typeof BUCKETS)[number];

export function bucketOf(daysUntilDue: number): Bucket {
  if (daysUntilDue < 0) return 'overdue';
  if (daysUntilDue <= 7) return 'week';
  if (daysUntilDue <= 15) return 'fortnight';
  if (daysUntilDue <= 30) return 'month';
  return 'later';
}

export interface Tally {
  count: number;
  total: number;
}

export interface PayablesSummary {
  /** Everything not yet paid, direct debits to come included. */
  open: Tally;
  overdue: Tally;
  /** Direct debits still to leave: in the buckets, never in overdue. */
  scheduled: Tally;
  buckets: Record<Bucket, Tally>;
}

const cents = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** What is owed, grouped by how soon. Paid items are ignored. */
export function summarisePayables(
  items: Array<{ amount: number; state: PaymentState; dueKey: string }>,
  todayKey: string,
): PayablesSummary {
  const empty = (): Tally => ({ count: 0, total: 0 });
  const summary: PayablesSummary = {
    open: empty(),
    overdue: empty(),
    scheduled: empty(),
    buckets: { overdue: empty(), week: empty(), fortnight: empty(), month: empty(), later: empty() },
  };
  const add = (tally: Tally, amount: number) => {
    tally.count += 1;
    tally.total = cents(tally.total + amount);
  };

  for (const item of items) {
    if (item.state === 'paid') continue;
    add(summary.open, item.amount);
    if (item.state === 'overdue') add(summary.overdue, item.amount);
    if (item.state === 'scheduled') add(summary.scheduled, item.amount);
    // A scheduled debit is always in the future (one due today is paid), so
    // it can never land in the overdue bucket.
    add(summary.buckets[bucketOf(daysBetween(todayKey, item.dueKey))], item.amount);
  }
  return summary;
}

/** The owner's answer to "is it paid?", as the entry forms send it. */
export interface PaymentInput {
  paid: boolean;
  /** Required when paid. A direct debit counts as paid on its due date. */
  method?: PaymentMethodKey | null;
  /** The owner's own due date. Omitted, it follows the supplier's terms. */
  dueDate?: string | null;
}

export interface PaymentColumns {
  paymentMethod: PaymentMethodKey | null;
  paidKey: string | null;
  dueKey: string | null;
}

/**
 * The answer, as it is stored, or the dictionary key of what is wrong with it.
 *
 * A cost paid in cash is paid on its own date — the day of the delivery — or
 * today, when the date typed is still to come. A direct debit is not paid
 * yet: it is paid when it leaves, which is the due date.
 */
export function paymentColumns(
  input: PaymentInput | undefined,
  dateKey: string,
  todayKey: string,
): PaymentColumns | { error: string } {
  if (!input) return { paymentMethod: null, paidKey: null, dueKey: null };

  const method = input.method ?? null;
  if (method !== null && !PAYMENT_METHODS.includes(method)) return { error: 'payments.invalidMethod' };
  if (input.paid && !method) return { error: 'payments.methodRequired' };

  const dueKey = input.dueDate ? input.dueDate : null;
  if (dueKey !== null && !isDayKey(dueKey)) return { error: 'payments.invalidDueDate' };

  if (!input.paid) return { paymentMethod: null, paidKey: null, dueKey };
  if (method === 'DIRECT_DEBIT') return { paymentMethod: method, paidKey: null, dueKey };
  return { paymentMethod: method, paidKey: dateKey < todayKey ? dateKey : todayKey, dueKey };
}

/** Valid terms in days, or null to fall back to the default. */
export function parseTermsDays(value: unknown): number | null | 'invalid' {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(n) || n < 0 || n > MAX_TERMS_DAYS) return 'invalid';
  return n;
}
