/**
 * Canonical restaurant financial KPI engine.
 *
 * This is the ONLY place financial formulas live. Every caller — dashboard
 * actions, P&L, PDF export, comparative panels — must compute through these
 * functions rather than reimplementing the arithmetic inline.
 *
 * All functions are pure and division-safe: a zero or missing denominator
 * yields 0 (or null where "unknown" is meaningfully different from "zero"),
 * never NaN or Infinity.
 *
 * Percentages are returned as RATIOS (0.32), not display percentages (32).
 * Use `toPercent()` at the render boundary.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type KpiInput = {
  revenueTotal: number;
  cogsTotal: number;
  /** Wages + employer contributions for the period. */
  labourTotal: number;
  /** Operating expenses EXCLUDING labour (rent, utilities, marketing…). */
  opexTotal: number;
  dineInRevenue: number;
  takeawayRevenue: number;
  dineInTickets: number;
  takeawayTickets: number;
  /** Seats in the dining room. Required for RevPASH. */
  seats?: number | null;
  /** Hours of service per day. Required for RevPASH. */
  serviceHoursPerDay?: number | null;
  /** Days covered by this period. Required for RevPASH. */
  daysInPeriod?: number | null;
};

export type Kpis = {
  totalRevenue: number;
  totalCogs: number;
  labourTotal: number;
  operatingExpenses: number;

  grossProfit: number;
  grossProfitPct: number;

  netIncome: number;
  netIncomePct: number;

  /** Food cost as a share of revenue. Healthy: 0.28–0.32. */
  foodCostPct: number;
  /** Labour cost as a share of revenue. Healthy: 0.28–0.32. */
  labourCostPct: number;

  /** COGS + labour. The single most important restaurant health metric. */
  primeCost: number;
  /** Prime cost as a share of revenue. Healthy: 0.58–0.62. */
  primeCostPct: number;

  avgTicketDineIn: number;
  avgTicketTakeaway: number;
  avgTicketOverall: number;

  /**
   * Revenue per available seat-hour. Null when seats/hours/days are unknown —
   * callers must hide the metric rather than render a fabricated number.
   */
  revPASH: number | null;
};

// ─── Primitives ─────────────────────────────────────────────────────────────

/** Division that returns 0 instead of NaN/Infinity when the divisor is 0. */
export function safeDivide(numerator: number, denominator: number): number {
  if (!denominator || !Number.isFinite(denominator)) return 0;
  const result = numerator / denominator;
  return Number.isFinite(result) ? result : 0;
}

/** Ratio (0.32) → display percentage (32). */
export function toPercent(ratio: number, decimals = 1): number {
  const pct = ratio * 100;
  const factor = 10 ** decimals;
  return Math.round(pct * factor) / factor;
}

/** Percentage change between two periods, as a ratio. 0 when the base is 0. */
export function percentChange(current: number, previous: number): number {
  return safeDivide(current - previous, Math.abs(previous));
}

// ─── Benchmarks ─────────────────────────────────────────────────────────────

/**
 * Industry-standard healthy ranges for full-service restaurants, as ratios.
 * Used to colour KPI tiles; not thresholds for alerts.
 */
export const BENCHMARKS = {
  foodCostPct: { min: 0.28, max: 0.32 },
  labourCostPct: { min: 0.28, max: 0.32 },
  primeCostPct: { min: 0.55, max: 0.62 },
  netIncomePct: { min: 0.1, max: 0.15 },
} as const;

export type BenchmarkKey = keyof typeof BENCHMARKS;
export type HealthStatus = 'good' | 'warning' | 'bad';

/**
 * Rates a cost ratio against its healthy band.
 * Lower is better for cost metrics; `higherIsBetter` inverts that for margins.
 */
export function rateAgainstBenchmark(
  key: BenchmarkKey,
  value: number,
  { higherIsBetter = false }: { higherIsBetter?: boolean } = {}
): HealthStatus {
  const { min, max } = BENCHMARKS[key];

  if (higherIsBetter) {
    if (value >= min) return 'good';
    if (value >= min * 0.6) return 'warning';
    return 'bad';
  }

  if (value <= max) return 'good';
  if (value <= max * 1.1) return 'warning';
  return 'bad';
}

// ─── Main calculation ───────────────────────────────────────────────────────

export function calculateKpis(input: KpiInput): Kpis {
  const totalRevenue = input.revenueTotal;
  const totalCogs = input.cogsTotal;
  const labourTotal = input.labourTotal;
  const operatingExpenses = input.opexTotal;

  const grossProfit = totalRevenue - totalCogs;
  const grossProfitPct = safeDivide(grossProfit, totalRevenue);

  // Net income subtracts every cost: goods, labour and other opex.
  const netIncome = totalRevenue - totalCogs - labourTotal - operatingExpenses;
  const netIncomePct = safeDivide(netIncome, totalRevenue);

  const foodCostPct = safeDivide(totalCogs, totalRevenue);
  const labourCostPct = safeDivide(labourTotal, totalRevenue);

  const primeCost = totalCogs + labourTotal;
  const primeCostPct = safeDivide(primeCost, totalRevenue);

  const avgTicketDineIn = safeDivide(input.dineInRevenue, input.dineInTickets);
  const avgTicketTakeaway = safeDivide(input.takeawayRevenue, input.takeawayTickets);
  const avgTicketOverall = safeDivide(
    input.dineInRevenue + input.takeawayRevenue,
    input.dineInTickets + input.takeawayTickets
  );

  return {
    totalRevenue,
    totalCogs,
    labourTotal,
    operatingExpenses,
    grossProfit,
    grossProfitPct,
    netIncome,
    netIncomePct,
    foodCostPct,
    labourCostPct,
    primeCost,
    primeCostPct,
    avgTicketDineIn,
    avgTicketTakeaway,
    avgTicketOverall,
    revPASH: calculateRevPASH(input),
  };
}

/**
 * Revenue per available seat-hour: dine-in revenue divided by the total
 * seat-hours offered in the period.
 *
 * Returns null when seats, service hours or period length are unknown, so the
 * UI can hide the metric instead of showing a number derived from guesses.
 * Uses dine-in revenue only — takeaway does not occupy a seat.
 */
export function calculateRevPASH(input: KpiInput): number | null {
  const { seats, serviceHoursPerDay, daysInPeriod, dineInRevenue } = input;

  if (!seats || !serviceHoursPerDay || !daysInPeriod) return null;
  if (seats <= 0 || serviceHoursPerDay <= 0 || daysInPeriod <= 0) return null;

  const seatHours = seats * serviceHoursPerDay * daysInPeriod;
  return safeDivide(dineInRevenue, seatHours);
}
