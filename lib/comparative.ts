/**
 * The comparison page's arithmetic: a year month by month, each month against
 * the same month a year earlier, and sales accumulated through the year.
 *
 * Pure, so it is tested without a database. Dates are calendar days, stored
 * as UTC midnight, and read with the UTC getters throughout.
 *
 * One rule runs through all of it: a month still in progress is compared with
 * the same days a year earlier, never with the whole of last year's month.
 * Nine days of October against all of last October reads as a collapse every
 * month until the last day, which is what the old card showed.
 */

export interface DayAmount {
  /** A calendar day, as UTC midnight. */
  date: Date;
  amount: number;
}

export interface PeriodFigures {
  revenue: number;
  costs: number;
  profit: number;
}

export interface MonthFigures extends PeriodFigures {
  year: number;
  /** Zero-based, as `Date.getUTCMonth()` returns it. */
  month: number;
  /**
   * The same month a year earlier — only up to the same day while this month
   * is still running. Null when nothing at all was recorded in that window.
   */
  lastYear: PeriodFigures | null;
  /** Set while the month is in progress: the last day counted. */
  throughDay: number | null;
}

export interface YearComparison {
  year: number;
  /** January to December; months still to come have zeros. */
  months: MonthFigures[];
  /** The month in progress, as the two headline cards read it. */
  current: MonthFigures;
  /** Average takings of the last six months, this one included. */
  averageSixMonths: number;
}

interface Window { from: Date; to: Date }

function utcDay(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day));
}

function lastDayOf(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/** Sum and count of the entries falling inside a window, both ends included. */
function sumIn(entries: DayAmount[], w: Window): { total: number; count: number } {
  let total = 0;
  let count = 0;
  for (const e of entries) {
    const t = e.date.getTime();
    if (t >= w.from.getTime() && t <= w.to.getTime()) {
      total += e.amount;
      count += 1;
    }
  }
  return { total, count };
}

function figures(revenue: DayAmount[], costs: DayAmount[], w: Window) {
  const r = sumIn(revenue, w);
  const c = sumIn(costs, w);
  return {
    figures: { revenue: r.total, costs: c.total, profit: r.total - c.total },
    recorded: r.count + c.count > 0,
  };
}

export function buildYearComparison(
  revenue: DayAmount[],
  costs: DayAmount[],
  /** Today, as a calendar day. */
  today: Date,
): YearComparison {
  const year = today.getUTCFullYear();
  const currentMonth = today.getUTCMonth();
  const todayDay = today.getUTCDate();

  const months: MonthFigures[] = [];
  for (let month = 0; month < 12; month++) {
    const running = month === currentMonth;
    // A running month counts to today; last year is cut at the same day, or
    // at its own month end when that month was shorter (29 February).
    const end = running ? todayDay : lastDayOf(year, month);
    const lastEnd = running ? Math.min(todayDay, lastDayOf(year - 1, month)) : lastDayOf(year - 1, month);

    const now = figures(revenue, costs, { from: utcDay(year, month, 1), to: utcDay(year, month, end) });
    const before = figures(revenue, costs, { from: utcDay(year - 1, month, 1), to: utcDay(year - 1, month, lastEnd) });

    months.push({
      year,
      month,
      ...now.figures,
      lastYear: before.recorded ? before.figures : null,
      throughDay: running && end < lastDayOf(year, month) ? end : null,
    });
  }

  // The last six months, this one included, reaching back into last year
  // in the first half of the year.
  let sixTotal = 0;
  for (let back = 0; back < 6; back++) {
    const d = new Date(Date.UTC(year, currentMonth - back, 1));
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth();
    sixTotal += sumIn(revenue, { from: utcDay(y, m, 1), to: utcDay(y, m, lastDayOf(y, m)) }).total;
  }

  return {
    year,
    months,
    current: months[currentMonth],
    averageSixMonths: sixTotal / 6,
  };
}

// ── Accumulated sales ────────────────────────────────────────────────────

/** Days on the shared axis: a leap year's, so 29 February has a place. */
export const AXIS_DAYS = 366;

/**
 * A calendar day's place on the shared axis, 0 to 365.
 *
 * Every year is drawn on the same January-to-December axis so that the lines
 * can be laid over each other. A leap year's calendar is the reference; a
 * year without 29 February simply carries its total across that slot.
 */
export function axisIndex(month: number, day: number): number {
  const ref = Date.UTC(2024, month, day);
  return Math.round((ref - Date.UTC(2024, 0, 1)) / 86_400_000);
}

export interface CumulativeSales {
  /** Years with any takings, newest first. */
  years: number[];
  /** One row per axis day: the running total of each year at that day. */
  rows: Array<{ day: number } & Record<string, number | null>>;
  /** Today's place on the axis. */
  todayIndex: number;
  /** This year's total so far, and last year's at the same date. */
  toDate: { current: number; lastYear: number | null };
}

export function cumulativeSales(revenue: DayAmount[], today: Date): CumulativeSales {
  const year = today.getUTCFullYear();
  const todayIndex = axisIndex(today.getUTCMonth(), today.getUTCDate());

  const daily = new Map<number, number[]>();
  for (const e of revenue) {
    const y = e.date.getUTCFullYear();
    if (y > year) continue;
    const slots = daily.get(y) ?? new Array<number>(AXIS_DAYS).fill(0);
    slots[axisIndex(e.date.getUTCMonth(), e.date.getUTCDate())] += e.amount;
    daily.set(y, slots);
  }
  const years = [...daily.keys()]
    .filter((y) => (daily.get(y) ?? []).some((v) => v !== 0))
    .sort((a, b) => b - a);

  const running = new Map<number, number[]>();
  for (const y of years) {
    const slots = daily.get(y)!;
    const out: number[] = [];
    let total = 0;
    for (let i = 0; i < AXIS_DAYS; i++) {
      total += slots[i];
      out.push(Math.round(total * 100) / 100);
    }
    running.set(y, out);
  }

  const rows = Array.from({ length: AXIS_DAYS }, (_, day) => {
    const row: { day: number } & Record<string, number | null> = { day } as never;
    for (const y of years) {
      // This year stops at today: the line does not run on into days that
      // have not happened yet.
      row[String(y)] = y === year && day > todayIndex ? null : running.get(y)![day];
    }
    return row;
  });

  const lastYearLine = running.get(year - 1);
  return {
    years,
    rows,
    todayIndex,
    toDate: {
      current: running.get(year)?.[todayIndex] ?? 0,
      lastYear: lastYearLine ? lastYearLine[todayIndex] : null,
    },
  };
}
