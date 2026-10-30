/**
 * Where the month's result lands if the rest of it trades like the start.
 *
 * Revenue is already projected from the trading-day average (see
 * lib/trading-days.ts). Costs are not projected the same way, because they
 * do not arrive evenly: rent lands on the 1st, the wages at the end, and a
 * big supplier invoice on whatever day it was scanned. So costs are built
 * from what is known instead:
 *
 *   what is already booked this month
 * + fixed monthly costs still to be booked before the month ends
 * + food and drink for the revenue still to come, at this month's ratio
 *
 * Everything else (a repair, an unexpected invoice) is not guessed. The
 * figure is a floor for costs, and the screen says it is an estimate.
 */

export interface ForecastInput {
  revenueSoFar: number;
  /** From monthProgress; null before there is anything to project. */
  projectedRevenue: number | null;
  costsSoFar: number;
  /** Cost of goods (food, drink) booked this month, part of costsSoFar. */
  cogsSoFar: number;
  /** Fixed monthly costs that will still be booked before the month ends. */
  fixedStillDue: number;
}

export interface MonthForecast {
  revenue: number;
  costs: number;
  result: number;
  /** Result over revenue, in percent; null when revenue is zero. */
  margin: number | null;
}

const cents = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function monthForecast(i: ForecastInput): MonthForecast | null {
  if (i.projectedRevenue === null || i.revenueSoFar <= 0) return null;
  const revenueToCome = Math.max(0, i.projectedRevenue - i.revenueSoFar);
  const cogsRatio = i.cogsSoFar / i.revenueSoFar;
  const costs = cents(i.costsSoFar + i.fixedStillDue + cogsRatio * revenueToCome);
  const revenue = cents(i.projectedRevenue);
  const result = cents(revenue - costs);
  return { revenue, costs, result, margin: revenue > 0 ? Math.round((result / revenue) * 1000) / 10 : null };
}
