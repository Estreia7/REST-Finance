/**
 * The parts of the statement and the ratios that go beyond the core engine.
 *
 * Split from `lib/kpi.ts` only for size; the same rules apply. Everything here
 * is pure and division-safe, and percentages are ratios (0.32) rather than
 * display numbers, converted at the render boundary with `toPercent`.
 *
 * The structure follows the Uniform System of Accounts for Restaurants (USAR,
 * 8th edition), which is what hospitality programmes teach and what a
 * Portuguese accountant will recognise. Two of its choices matter enough to
 * spell out, because both look like mistakes until you see the reasoning:
 *
 *   - There is no gross-profit line. USAR goes cost of sales, then labour,
 *     then prime cost, because prime cost is the number that predicts whether
 *     a restaurant survives and a gross margin computed before labour does not.
 *
 *   - Occupancy sits BELOW controllable income. A manager cannot renegotiate
 *     the lease this month. Mixing rent into the controllable costs makes a
 *     good operator in an expensive location look like a bad one — which
 *     matters here, since Portuguese urban rents run far above the US norms
 *     most benchmarks are drawn from.
 */

import { safeDivide } from './kpi';

// ─── The statement ──────────────────────────────────────────────────────────

export type UsarInput = {
  revenue: number;
  costOfSales: number;
  labour: number;
  /** Operating expenses excluding labour AND excluding occupancy. */
  operatingExpenses: number;
  /** Rent, property tax, building insurance. */
  occupancy: number;
};

export type UsarStatement = {
  revenue: number;
  costOfSales: number;
  costOfSalesPct: number;
  labour: number;
  labourPct: number;
  /** Cost of sales plus labour. The most predictive single figure. */
  primeCost: number;
  primeCostPct: number;
  operatingExpenses: number;
  operatingExpensesPct: number;
  /** What remains after everything a manager can influence. */
  controllableIncome: number;
  controllableIncomePct: number;
  occupancy: number;
  occupancyPct: number;
  netIncome: number;
  netIncomePct: number;
};

export function buildUsarStatement(input: UsarInput): UsarStatement {
  const { revenue, costOfSales, labour, operatingExpenses, occupancy } = input;

  const primeCost = costOfSales + labour;
  const controllableIncome = revenue - primeCost - operatingExpenses;
  const netIncome = controllableIncome - occupancy;

  return {
    revenue,
    costOfSales,
    costOfSalesPct: safeDivide(costOfSales, revenue),
    labour,
    labourPct: safeDivide(labour, revenue),
    primeCost,
    primeCostPct: safeDivide(primeCost, revenue),
    operatingExpenses,
    operatingExpensesPct: safeDivide(operatingExpenses, revenue),
    controllableIncome,
    controllableIncomePct: safeDivide(controllableIncome, revenue),
    occupancy,
    occupancyPct: safeDivide(occupancy, revenue),
    netIncome,
    netIncomePct: safeDivide(netIncome, revenue),
  };
}

// ─── Cost–volume–profit ─────────────────────────────────────────────────────

export type CvpInput = {
  revenue: number;
  /** Costs that move with sales. Cost of sales, in practice. */
  variableCosts: number;
  /** Costs that do not. Labour is treated as fixed — see the note below. */
  fixedCosts: number;
};

export type Cvp = {
  contributionMargin: number;
  /** Share of each euro of sales left after variable costs. */
  contributionMarginRatio: number;
  /**
   * Revenue at which the restaurant covers its costs exactly.
   * Null when the contribution margin is zero or negative — there is then no
   * volume at which the place breaks even, and a number would be a lie.
   */
  breakEvenRevenue: number | null;
  /**
   * How far current revenue sits above break-even, as a share of revenue.
   * Null for the same reason.
   */
  marginOfSafety: number | null;
};

/**
 * Break-even and the headroom above it.
 *
 * Labour counts as fixed here, which is a simplification worth being honest
 * about: a restaurant's rota does flex with trade, but not within the month
 * and not proportionally. Treating it as variable would understate the
 * break-even point, and understating break-even is the dangerous direction.
 */
export function calculateCvp(input: CvpInput): Cvp {
  const { revenue, variableCosts, fixedCosts } = input;

  const contributionMargin = revenue - variableCosts;
  const contributionMarginRatio = safeDivide(contributionMargin, revenue);

  if (contributionMarginRatio <= 0) {
    return {
      contributionMargin,
      contributionMarginRatio,
      breakEvenRevenue: null,
      marginOfSafety: null,
    };
  }

  const breakEvenRevenue = fixedCosts / contributionMarginRatio;

  return {
    contributionMargin,
    contributionMarginRatio,
    breakEvenRevenue,
    marginOfSafety: safeDivide(revenue - breakEvenRevenue, revenue),
  };
}

// ─── Capacity ───────────────────────────────────────────────────────────────

/**
 * How many times each seat was used.
 *
 * Dine-in covers only: a takeaway order occupies no seat, and counting it
 * would inflate the figure and make two restaurants incomparable.
 */
export function seatTurnover(
  dineInTickets: number,
  seats: number | null | undefined,
  daysInPeriod: number
): number | null {
  if (!seats || seats <= 0 || daysInPeriod <= 0) return null;
  return safeDivide(dineInTickets, seats * daysInPeriod);
}

/** Dine-in revenue per seat over the period. Site-to-site comparison. */
export function revenuePerSeat(
  dineInRevenue: number,
  seats: number | null | undefined
): number | null {
  if (!seats || seats <= 0) return null;
  return safeDivide(dineInRevenue, seats);
}

// ─── Period on period ───────────────────────────────────────────────────────

/**
 * How much of a change in revenue reached the bottom line.
 *
 * The question behind it is the one owners actually ask after a good month:
 * we sold more, so where did it go. Null when revenue did not move, since
 * dividing by nothing would invent a figure.
 *
 * Can legitimately exceed 1 (costs fell as sales rose) or go negative (profit
 * fell despite growth) — both are real and worth seeing, so neither is clamped.
 */
export function flowThrough(
  currentIncome: number,
  previousIncome: number,
  currentRevenue: number,
  previousRevenue: number
): number | null {
  const revenueChange = currentRevenue - previousRevenue;
  if (revenueChange === 0) return null;
  return (currentIncome - previousIncome) / revenueChange;
}

/**
 * How far a ratio sits from its target, in percentage points.
 *
 * Positive means over target, which for a cost is the bad direction. The
 * textbooks call this variance, and it is what turns a ratio into something
 * actionable: 34% food cost means little until you know the target was 30%.
 */
export function varianceFromTarget(actual: number, target: number): number {
  return actual - target;
}
