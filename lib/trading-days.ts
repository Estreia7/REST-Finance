/**
 * How far through the month the restaurant actually is.
 *
 * A revenue figure halfway through a month means nothing on its own, and
 * dividing it by the calendar is worse than useless: a restaurant that shuts
 * Mondays has four fewer trading days than the calendar claims, so a
 * calendar-day average reads about 15% low and the month-end estimate with
 * it.
 *
 * So the days are counted from what the restaurant recorded. A day it took
 * money on traded. A day it declared closed did not. A day in the past with
 * neither is counted as a trading day it simply has not entered yet —
 * otherwise a week of unentered takings would quietly shrink the denominator
 * and inflate the daily average into a wildly optimistic estimate.
 */

export interface MonthProgress {
  /** Trading days from the 1st up to and including today. */
  elapsed: number;
  /** Trading days still to come after today, to the end of the month. */
  remaining: number;
  /** Revenue recorded so far this month. */
  revenueSoFar: number;
  /**
   * Takings per trading day elapsed. Null before there is anything to
   * average, because a zero average would project a zero month on day one.
   */
  dailyAverage: number | null;
  /**
   * What the month lands at if the rest of it trades like the start:
   * `revenueSoFar + dailyAverage * remaining`. Null when there is no
   * average to project from.
   */
  projection: number | null;
}

export interface MonthProgressInput {
  /** The month to measure, as a UTC date inside it. */
  today: Date;
  /** Days this month with recorded takings, as YYYY-MM-DD, and the amount. */
  revenueByDate: Array<{ date: string; revenue: number }>;
  /** Days this month the restaurant declared closed, as YYYY-MM-DD. */
  closedDates: string[];
}

export function monthProgress({
  today,
  revenueByDate,
  closedDates,
}: MonthProgressInput): MonthProgress {
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth();
  const dayOfMonth = today.getUTCDate();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  const closed = new Set(closedDates);
  const traded = new Set(
    // A day recorded at zero is a day that opened and took nothing, which is
    // still a trading day — it belongs in the denominator.
    revenueByDate.map((r) => r.date),
  );

  let elapsed = 0;
  for (let d = 1; d <= dayOfMonth; d++) {
    const iso = isoDay(year, month, d);
    if (closed.has(iso) && !traded.has(iso)) continue;
    elapsed++;
  }

  let remaining = 0;
  for (let d = dayOfMonth + 1; d <= daysInMonth; d++) {
    if (closed.has(isoDay(year, month, d))) continue;
    remaining++;
  }

  const revenueSoFar = round2(revenueByDate.reduce((s, r) => s + r.revenue, 0));

  const dailyAverage = elapsed > 0 && revenueSoFar > 0 ? round2(revenueSoFar / elapsed) : null;
  const projection =
    dailyAverage === null ? null : round2(revenueSoFar + dailyAverage * remaining);

  return { elapsed, remaining, revenueSoFar, dailyAverage, projection };
}

function isoDay(year: number, month: number, day: number): string {
  const m = String(month + 1).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${year}-${m}-${d}`;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
