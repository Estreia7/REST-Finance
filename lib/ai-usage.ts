import { modelLabel, isPriced } from '@/lib/ai-models';
import type { ScanResult } from '@/lib/document-scanner';

/**
 * What a call read, in a few fields: enough to recognise the document in the
 * console ("Makro, FT 2026/1234, 101,80 €, 5 lines") without storing the
 * reading twice. The full reading lives with the scan.
 */
export type UsageSubject =
  | { kind: 'invoice'; vendor: string | null; invoiceNumber: string | null; date: string | null; total: number | null; lines: number }
  | { kind: 'daily'; date: string | null; total: number | null };

export function subjectOf(result: ScanResult): UsageSubject {
  if (result.type === 'cost_receipt') {
    return {
      kind: 'invoice',
      vendor: result.vendor?.trim() || null,
      invoiceNumber: result.invoiceNumber?.trim() || null,
      date: result.date || null,
      total: Number.isFinite(result.grandTotal) ? result.grandTotal : null,
      lines: result.items?.length ?? 0,
    };
  }
  const total = (result.dineInRevenue ?? 0) + (result.takeawayRevenue ?? 0);
  return { kind: 'daily', date: result.date || null, total: Number.isFinite(total) ? total : null };
}

/**
 * Turning the AI usage log into the console's answers: what it cost, on which
 * model, and who spent it.
 *
 * Pure, so it can be tested without a database; the server action reads the
 * rows and hands them here.
 */

export type UsagePeriod = '7d' | '30d' | '90d' | 'all';

export const USAGE_PERIODS: UsagePeriod[] = ['7d', '30d', '90d', 'all'];

const PERIOD_DAYS: Record<Exclude<UsagePeriod, 'all'>, number> = { '7d': 7, '30d': 30, '90d': 90 };

/** Days are Lisbon days: a scan at 00:30 belongs to the day the owner lived. */
const TIME_ZONE = 'Europe/Lisbon';

export interface UsageRow {
  restaurantId: string | null;
  userId: string | null;
  source: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  durationMs: number | null;
  succeeded: boolean;
  stopReason: string | null;
  createdAt: Date;
}

export interface Person {
  id: string;
  name: string | null;
  email: string;
}

export interface RestaurantInfo {
  id: string;
  name: string;
  owners: Person[];
}

interface Tally {
  calls: number;
  failed: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface UsageSummary {
  period: UsagePeriod;
  /** Start of the window, or of the first call on record for "all". */
  from: Date | null;
  days: number;
  totals: Tally & {
    refused: number;
    meanCostUsd: number | null;
    meanDurationMs: number | null;
    /**
     * The last seven days' pace, carried to thirty. Recent rather than the
     * period's average, so a price change shows within the week instead of
     * being averaged away by the month before it.
     */
    projected30dUsd: number;
  };
  bySource: Array<Tally & { source: string }>;
  byModel: Array<Tally & { model: string; label: string; priced: boolean }>;
  byDay: Array<{ date: string; costUsd: number; calls: number }>;
  restaurants: Array<Tally & {
    id: string;
    name: string;
    owners: Person[];
    /** Share of the period's total cost, 0..1. */
    share: number;
  }>;
  owners: Array<Tally & {
    owner: Person;
    restaurants: Array<{ id: string; name: string; costUsd: number; calls: number }>;
    share: number;
  }>;
}

/** Where a period starts. Null for "all", which runs from the first call. */
export function periodStart(period: UsagePeriod, now: Date = new Date()): Date | null {
  if (period === 'all') return null;
  const start = new Date(now);
  start.setDate(start.getDate() - (PERIOD_DAYS[period] - 1));
  start.setHours(0, 0, 0, 0);
  return start;
}

/** A calendar day as YYYY-MM-DD, in Lisbon time. */
export function dayKey(date: Date): string {
  // en-CA formats as YYYY-MM-DD; only the shape is wanted, not the locale.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
}

function emptyTally(): Tally {
  return { calls: 0, failed: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 };
}

function add(tally: Tally, row: UsageRow) {
  tally.calls += 1;
  if (!row.succeeded) tally.failed += 1;
  tally.inputTokens += row.inputTokens;
  tally.outputTokens += row.outputTokens;
  tally.costUsd += row.costUsd;
}

function byCost<T extends { costUsd: number; calls: number }>(a: T, b: T) {
  return b.costUsd - a.costUsd || b.calls - a.calls;
}

export function summariseUsage(
  rows: UsageRow[],
  restaurants: RestaurantInfo[],
  period: UsagePeriod,
  now: Date = new Date(),
): UsageSummary {
  const totals = emptyTally();
  let refused = 0;
  let durationSum = 0;
  let durationCount = 0;

  const sources = new Map<string, Tally>();
  const models = new Map<string, Tally>();
  const days = new Map<string, { costUsd: number; calls: number }>();
  const perRestaurant = new Map<string, Tally>();

  for (const row of rows) {
    add(totals, row);
    if (row.stopReason === 'refusal') refused += 1;
    if (row.durationMs !== null) {
      durationSum += row.durationMs;
      durationCount += 1;
    }

    if (!sources.has(row.source)) sources.set(row.source, emptyTally());
    add(sources.get(row.source)!, row);

    if (!models.has(row.model)) models.set(row.model, emptyTally());
    add(models.get(row.model)!, row);

    const day = dayKey(row.createdAt);
    const d = days.get(day) ?? { costUsd: 0, calls: 0 };
    d.costUsd += row.costUsd;
    d.calls += 1;
    days.set(day, d);

    if (row.restaurantId) {
      if (!perRestaurant.has(row.restaurantId)) perRestaurant.set(row.restaurantId, emptyTally());
      add(perRestaurant.get(row.restaurantId)!, row);
    }
  }

  // The window, and every day in it — a day with no scans is a zero on the
  // chart, not a gap that joins the days either side of it.
  const earliest = rows.reduce<Date | null>(
    (min, r) => (!min || r.createdAt < min ? r.createdAt : min),
    null,
  );
  const from = periodStart(period, now) ?? earliest;
  const byDay: UsageSummary['byDay'] = [];
  if (from) {
    const cursor = new Date(from);
    cursor.setHours(12, 0, 0, 0); // midday, so a clock change never skips a day
    const last = dayKey(now);
    for (let guard = 0; guard < 4000; guard++) {
      const key = dayKey(cursor);
      byDay.push({ date: key, ...(days.get(key) ?? { costUsd: 0, calls: 0 }) });
      if (key >= last) break;
      cursor.setDate(cursor.getDate() + 1);
    }
  }
  const dayCount = Math.max(1, byDay.length);
  const recent = byDay.slice(-7);
  const recentCost = recent.reduce((s, d) => s + d.costUsd, 0);

  const info = new Map(restaurants.map((r) => [r.id, r]));
  const share = (cost: number) => (totals.costUsd > 0 ? cost / totals.costUsd : 0);

  const restaurantRows = [...perRestaurant.entries()]
    .map(([id, tally]) => ({
      ...tally,
      id,
      // A restaurant deleted since keeps its spend under its id, so the
      // total still adds up.
      name: info.get(id)?.name ?? id,
      owners: info.get(id)?.owners ?? [],
      share: share(tally.costUsd),
    }))
    .sort(byCost);

  // An owner's spend is the sum of their restaurants. A restaurant with two
  // owners counts in full for each, because each of them is answerable for
  // it; shares can therefore add to more than 100% across owners.
  const perOwner = new Map<string, UsageSummary['owners'][number]>();
  for (const r of restaurantRows) {
    for (const owner of r.owners) {
      const entry = perOwner.get(owner.id) ?? { ...emptyTally(), owner, restaurants: [], share: 0 };
      entry.calls += r.calls;
      entry.failed += r.failed;
      entry.inputTokens += r.inputTokens;
      entry.outputTokens += r.outputTokens;
      entry.costUsd += r.costUsd;
      entry.restaurants.push({ id: r.id, name: r.name, costUsd: r.costUsd, calls: r.calls });
      perOwner.set(owner.id, entry);
    }
  }
  const ownerRows = [...perOwner.values()]
    .map((o) => ({ ...o, share: share(o.costUsd), restaurants: o.restaurants.sort(byCost) }))
    .sort(byCost);

  return {
    period,
    from,
    days: dayCount,
    totals: {
      ...totals,
      refused,
      meanCostUsd: totals.calls ? totals.costUsd / totals.calls : null,
      meanDurationMs: durationCount ? Math.round(durationSum / durationCount) : null,
      projected30dUsd: recent.length ? (recentCost / recent.length) * 30 : 0,
    },
    bySource: [...sources.entries()].map(([source, t]) => ({ ...t, source })).sort(byCost),
    byModel: [...models.entries()]
      .map(([model, t]) => ({ ...t, model, label: modelLabel(model), priced: isPriced(model) }))
      .sort(byCost),
    byDay,
    restaurants: restaurantRows,
    owners: ownerRows,
  };
}
