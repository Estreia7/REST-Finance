/**
 * The annual budget: what the owner plans, what each "what if" does to it,
 * and how it compares with what actually happened.
 *
 * Laid out in the P&L's own bands (USAR) — revenue, cost of sales, labour,
 * operating expenses, occupancy — so a planned line sits beside the real one
 * and a variance means the same thing on both screens.
 *
 * Pure: no database, no React. The server loads rows and converts Decimals to
 * numbers; everything that decides a figure lives here, where it is tested.
 */

import { buildUsarStatement } from './kpi-extended';

export const BUDGET_SECTIONS = ['REVENUE', 'COGS', 'LABOUR', 'OPEX', 'OCCUPANCY'] as const;
export type BudgetSection = (typeof BUDGET_SECTIONS)[number];

export const SCENARIO_KINDS = ['HIRE', 'PURCHASE', 'FIXED_COST', 'REVENUE_CHANGE', 'COGS_CHANGE'] as const;
export type ScenarioKind = (typeof SCENARIO_KINDS)[number];

/** Which part of the takings a revenue line plans, as the daily summary splits it. */
export type RevenueChannel = 'total' | 'dineIn' | 'takeaway';

export interface PlanLine {
  id: string;
  section: BudgetSection;
  categoryId: string | null;
  channel: RevenueChannel | null;
  label: string;
  /** January first, twelve values. Ignored when `revenueShare` is set. */
  months: number[];
  /** Cost of sales as a share of revenue, 0.3 for 30%. */
  revenueShare: number | null;
}

export interface Scenario {
  id: string;
  kind: ScenarioKind;
  label: string;
  active: boolean;
  section: BudgetSection;
  amount: number | null;
  percent: number | null;
  mealAllowance: number | null;
  /** 1–12. */
  startMonth: number;
  spreadMonths: number | null;
}

// ─── Hiring ─────────────────────────────────────────────────────────────────

/**
 * The employer's social security contribution on wages (Taxa Social Única).
 * 23.75% for the general regime; the 11% withheld from the employee is part
 * of the gross salary and costs the restaurant nothing extra.
 */
export const EMPLOYER_TSU = 0.2375;

/**
 * A suggested meal allowance per worked month: €10.20 a day on a meal card,
 * the exempt limit since 2025, over 22 working days. Only a default — the
 * owner types what they actually pay.
 */
export const DEFAULT_MEAL_ALLOWANCE = 224.4;

/**
 * What one more person costs the restaurant each month.
 *
 * Portuguese wages are paid fourteen times a year (holiday and Christmas
 * subsidies), so a €1,000 salary is €1,166.67 a month once spread evenly, and
 * the employer's TSU is due on all fourteen. The meal allowance is paid in the
 * eleven months worked, not in the holiday month, and carries no TSU within
 * the exempt limit.
 */
export function hireMonthlyCost(grossSalary: number, mealAllowance: number): number {
  const wages = (grossSalary * 14) / 12;
  return round2(wages * (1 + EMPLOYER_TSU) + (mealAllowance * 11) / 12);
}

// ─── The plan ───────────────────────────────────────────────────────────────

export interface ComputedLine extends PlanLine {
  /** The months as planned, shares of revenue already turned into euros. */
  computed: number[];
  total: number;
}

export interface ScenarioRow {
  scenario: Scenario;
  section: BudgetSection;
  months: number[];
  total: number;
}

export interface Plan {
  lines: ComputedLine[];
  /** The switched-on "what ifs", each as the line it adds to its band. */
  scenarioRows: ScenarioRow[];
  sections: Record<BudgetSection, number[]>;
  primeCost: number[];
  controllableIncome: number[];
  netIncome: number[];
}

export function emptyMonths(): number[] {
  return Array.from({ length: 12 }, () => 0);
}

export function sum(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Zero-based month indexes from `startMonth` (1–12) to December. */
function fromMonth(startMonth: number): number[] {
  const start = Math.min(Math.max(Math.trunc(startMonth), 1), 12) - 1;
  return Array.from({ length: 12 - start }, (_, i) => start + i);
}

/**
 * Builds the year's plan.
 *
 * Order matters and follows how the figures depend on each other: revenue
 * first (with any change to sales), then cost of sales — part of which may be
 * a share of that revenue — then the costs that do not move with sales.
 *
 * A revenue change applies to the planned revenue, and the percentages are
 * added rather than compounded: "+3% from March" and "+2% from June" read as
 * +5% from June, which is what an owner expects when they wrote them.
 *
 * `withScenarios` false gives the plan as typed, before any "what if".
 */
export function computePlan(
  lines: PlanLine[],
  scenarios: Scenario[],
  { withScenarios = true }: { withScenarios?: boolean } = {}
): Plan {
  const applied = withScenarios ? scenarios.filter((s) => s.active) : [];
  const sections = Object.fromEntries(
    BUDGET_SECTIONS.map((s) => [s, emptyMonths()])
  ) as Record<BudgetSection, number[]>;
  const scenarioRows: ScenarioRow[] = [];
  const addRow = (scenario: Scenario, section: BudgetSection, months: number[]) => {
    scenarioRows.push({ scenario, section, months, total: round2(sum(months)) });
    for (let m = 0; m < 12; m += 1) sections[section][m] += months[m];
  };

  // ── Revenue
  const computed = new Map<string, number[]>();
  for (const line of lines.filter((l) => l.section === 'REVENUE')) {
    const months = normaliseMonths(line.months);
    computed.set(line.id, months);
    for (let m = 0; m < 12; m += 1) sections.REVENUE[m] += months[m];
  }
  const plannedRevenue = [...sections.REVENUE];

  for (const s of applied.filter((x) => x.kind === 'REVENUE_CHANGE')) {
    const months = emptyMonths();
    for (const m of fromMonth(s.startMonth)) {
      months[m] = round2(plannedRevenue[m] * ((s.percent ?? 0) / 100));
    }
    addRow(s, 'REVENUE', months);
  }
  const revenue = sections.REVENUE;

  // ── Cost of sales, part of which may follow revenue
  for (const line of lines.filter((l) => l.section === 'COGS')) {
    const months =
      line.revenueShare !== null
        ? revenue.map((r) => round2(r * (line.revenueShare as number)))
        : normaliseMonths(line.months);
    computed.set(line.id, months);
    for (let m = 0; m < 12; m += 1) sections.COGS[m] += months[m];
  }
  const plannedCogs = [...sections.COGS];
  for (const s of applied.filter((x) => x.kind === 'COGS_CHANGE')) {
    const months = emptyMonths();
    for (const m of fromMonth(s.startMonth)) {
      months[m] = round2(plannedCogs[m] * ((s.percent ?? 0) / 100));
    }
    addRow(s, 'COGS', months);
  }

  // ── Everything that does not move with sales
  for (const line of lines.filter((l) => l.section !== 'REVENUE' && l.section !== 'COGS')) {
    const months = normaliseMonths(line.months);
    computed.set(line.id, months);
    for (let m = 0; m < 12; m += 1) sections[line.section][m] += months[m];
  }
  for (const s of applied) {
    const months = costScenarioMonths(s);
    if (months) addRow(s, s.kind === 'HIRE' ? 'LABOUR' : s.section, months);
  }

  for (const section of BUDGET_SECTIONS) {
    sections[section] = sections[section].map(round2);
  }

  const primeCost = emptyMonths();
  const controllableIncome = emptyMonths();
  const netIncome = emptyMonths();
  for (let m = 0; m < 12; m += 1) {
    const statement = buildUsarStatement({
      revenue: sections.REVENUE[m],
      costOfSales: sections.COGS[m],
      labour: sections.LABOUR[m],
      operatingExpenses: sections.OPEX[m],
      occupancy: sections.OCCUPANCY[m],
    });
    primeCost[m] = round2(statement.primeCost);
    controllableIncome[m] = round2(statement.controllableIncome);
    netIncome[m] = round2(statement.netIncome);
  }

  return {
    lines: lines.map((line) => {
      const months = computed.get(line.id) ?? emptyMonths();
      return { ...line, computed: months, total: round2(sum(months)) };
    }),
    scenarioRows,
    sections,
    primeCost,
    controllableIncome,
    netIncome,
  };
}

/**
 * The months a cost "what if" adds. Null for the percentage kinds, which
 * depend on the rest of the plan and are worked out in `computePlan`.
 *
 * A purchase spread past December is cut at December: the rest belongs to
 * next year's budget, not this one.
 */
export function costScenarioMonths(s: Scenario): number[] | null {
  const months = emptyMonths();
  const amount = s.amount ?? 0;

  switch (s.kind) {
    case 'HIRE': {
      const monthly = hireMonthlyCost(amount, s.mealAllowance ?? 0);
      for (const m of fromMonth(s.startMonth)) months[m] = monthly;
      return months;
    }
    case 'FIXED_COST': {
      for (const m of fromMonth(s.startMonth)) months[m] = round2(amount);
      return months;
    }
    case 'PURCHASE': {
      const spread = Math.max(1, Math.trunc(s.spreadMonths ?? 1));
      const instalment = round2(amount / spread);
      for (const m of fromMonth(s.startMonth).slice(0, spread)) months[m] = instalment;
      return months;
    }
    default:
      return null;
  }
}

/**
 * What one "what if" does to the year's result, the others as they are.
 *
 * Measured by switching it on and off, so it is honest about interactions: a
 * sales increase is worth less than its own figure when food cost follows
 * revenue, and this says so. Works the same for an item not yet switched on,
 * which is the point — the owner sees the effect before committing to it.
 */
export function scenarioImpact(lines: PlanLine[], scenarios: Scenario[], id: string): number {
  const net = (on: boolean) =>
    sum(
      computePlan(
        lines,
        scenarios.map((s) => (s.id === id ? { ...s, active: on } : s))
      ).netIncome
    );
  return round2(net(true) - net(false));
}

function normaliseMonths(months: number[]): number[] {
  return Array.from({ length: 12 }, (_, i) => {
    const v = Number(months[i] ?? 0);
    return Number.isFinite(v) ? v : 0;
  });
}

/** Spreads a yearly figure evenly, cents on the last month so it adds up. */
export function spreadEvenly(total: number): number[] {
  const each = Math.floor((total / 12) * 100) / 100;
  const months = Array.from({ length: 12 }, () => each);
  months[11] = round2(total - each * 11);
  return months;
}

/**
 * A new yearly total for a line that already has months.
 *
 * Scaled in proportion, so a revenue line imported with last year's busy
 * August keeps its August when the owner raises the year's figure; a line
 * with nothing in it yet is spread evenly. Rounding is settled on the largest
 * month, where a cent is least visible.
 */
export function rescaleMonths(months: number[], total: number): number[] {
  const current = sum(normaliseMonths(months));
  if (current <= 0) return spreadEvenly(total);
  const scaled = normaliseMonths(months).map((v) => round2((v / current) * total));
  const largest = scaled.indexOf(Math.max(...scaled));
  scaled[largest] = round2(scaled[largest] + total - sum(scaled));
  return scaled;
}

// ─── Importing last year ────────────────────────────────────────────────────

/** The parts of the annual P&L an import reads. */
export interface ActualYear {
  revenue: number[];
  dineIn: number[];
  takeaway: number[];
  cogsLines: ActualLine[];
  labourLines: ActualLine[];
  opexLines: ActualLine[];
  occupancyLines: ActualLine[];
}

export interface ActualLine {
  /** Null for costs booked without a category. */
  categoryId: string | null;
  months: number[];
}

export interface ImportOptions {
  /** Percent, 5 for +5%. Applied to revenue. */
  revenueGrowth: number;
  /** Percent. Applied to the costs planned in euros. */
  costGrowth: number;
  sections: BudgetSection[];
}

export type ImportedLine = Omit<PlanLine, 'id'>;

/**
 * A plan built from a year that happened.
 *
 * Revenue keeps last year's seasonality month by month, scaled by the growth
 * the owner expects. Cost of sales is imported as a share of revenue rather
 * than in euros — the year's own ratio, category by category — so it follows
 * whatever revenue the owner plans instead of staying at last year's level
 * while sales move. Everything else is imported in euros, with the expected
 * inflation.
 *
 * Revenue is split into dine-in and takeaway only when last year had both;
 * a restaurant without takeaway gets one line, not an empty one.
 */
export function importFromActual(actual: ActualYear, options: ImportOptions): ImportedLine[] {
  const want = new Set(options.sections);
  const rev = 1 + options.revenueGrowth / 100;
  const cost = 1 + options.costGrowth / 100;
  const scale = (months: number[], factor: number) =>
    normaliseMonths(months).map((v) => round2(v * factor));
  const out: ImportedLine[] = [];

  if (want.has('REVENUE')) {
    const both = sum(actual.dineIn) > 0 && sum(actual.takeaway) > 0;
    const channels: Array<[RevenueChannel, number[]]> = both
      ? [['dineIn', actual.dineIn], ['takeaway', actual.takeaway]]
      : [['total', actual.revenue]];
    for (const [channel, months] of channels) {
      out.push({
        section: 'REVENUE', categoryId: null, channel, label: '',
        months: scale(months, rev), revenueShare: null,
      });
    }
  }

  const yearRevenue = sum(actual.revenue);
  const bySection: Array<[BudgetSection, ActualLine[]]> = [
    ['COGS', actual.cogsLines],
    ['LABOUR', actual.labourLines],
    ['OPEX', actual.opexLines],
    ['OCCUPANCY', actual.occupancyLines],
  ];

  for (const [section, actualLines] of bySection) {
    if (!want.has(section)) continue;
    for (const line of actualLines) {
      const total = sum(line.months);
      if (total === 0) continue;
      // Without revenue to divide by there is no share, and euros it is.
      const share =
        section === 'COGS' && yearRevenue > 0
          ? Math.round((total / yearRevenue) * 10000) / 10000
          : null;
      out.push({
        section,
        categoryId: line.categoryId,
        channel: null,
        label: '',
        months: share === null ? scale(line.months, cost) : emptyMonths(),
        revenueShare: share,
      });
    }
  }

  return out;
}

/**
 * Months of the source year with no takings at all — the months before the
 * restaurant opened, or before anyone started entering sales. Their planned
 * revenue comes out as zero, and the owner should be told rather than left to
 * discover a budget that expects nothing in February.
 */
export function monthsWithoutRevenue(actual: Pick<ActualYear, 'revenue'>): number[] {
  return normaliseMonths(actual.revenue)
    .map((v, i) => (v === 0 ? i : -1))
    .filter((i) => i >= 0);
}

// ─── Budget against actual ──────────────────────────────────────────────────

export type ComparisonRow = 'REVENUE' | 'COGS' | 'LABOUR' | 'OPEX' | 'OCCUPANCY' | 'NET';

export interface Variance {
  budget: number;
  actual: number;
  /** Actual minus budget. */
  difference: number;
  /** Difference as a share of the budget, in percent. Null when nothing was budgeted. */
  percent: number | null;
  /** Whether the difference is good news: more revenue, or less cost. */
  favourable: boolean;
}

/** Revenue and result are better above budget; costs are better below. */
export function variance(row: ComparisonRow, budget: number, actual: number): Variance {
  const difference = round2(actual - budget);
  const higherIsBetter = row === 'REVENUE' || row === 'NET';
  return {
    budget: round2(budget),
    actual: round2(actual),
    difference,
    percent: budget !== 0 ? Math.round((difference / Math.abs(budget)) * 1000) / 10 : null,
    favourable: higherIsBetter ? difference >= 0 : difference <= 0,
  };
}

/**
 * Which months are over and can be judged.
 *
 * A past year is all twelve; a future year none; the current year runs to the
 * month before this one, because comparing a half-finished October with a
 * whole October's budget would report every month as a shortfall until the
 * last day.
 */
export function closedMonths(year: number, today: Date): number {
  const y = today.getFullYear();
  if (year < y) return 12;
  if (year > y) return 0;
  return today.getMonth();
}

/** The sum of the first `n` months. */
export function throughMonth(months: number[], n: number): number {
  return round2(sum(months.slice(0, n)));
}
