import { prisma } from '@/lib/prisma';
import {
  computePlan,
  type BudgetSection,
  type PlanLine,
  type RevenueChannel,
  type Scenario,
  type ScenarioKind,
} from '@/lib/budget';

export interface LoadedBudget {
  id: string;
  year: number;
  importedFromYear: number | null;
  lines: PlanLine[];
  scenarios: Scenario[];
}

const CHANNELS: RevenueChannel[] = ['total', 'dineIn', 'takeaway'];

/**
 * One year's budget with its Decimals turned into numbers, or null when the
 * owner has not started one. Everything past this point is plain arithmetic in
 * lib/budget.ts.
 */
export async function loadBudget(restaurantId: string, year: number): Promise<LoadedBudget | null> {
  const budget = await prisma.budget.findUnique({
    where: { restaurantId_year: { restaurantId, year } },
    include: {
      lines: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] },
      scenarios: { orderBy: { createdAt: 'asc' } },
    },
  });
  if (!budget) return null;

  const num = (v: { toString(): string } | null) => (v === null ? null : Number(v));

  return {
    id: budget.id,
    year: budget.year,
    importedFromYear: budget.importedFromYear,
    lines: budget.lines.map((l) => ({
      id: l.id,
      section: l.section as BudgetSection,
      categoryId: l.categoryId,
      channel: CHANNELS.includes(l.channel as RevenueChannel) ? (l.channel as RevenueChannel) : null,
      label: l.label,
      months: Array.from({ length: 12 }, (_, i) => Number(l.months[i] ?? 0)),
      revenueShare: num(l.revenueShare),
    })),
    scenarios: budget.scenarios.map((s) => ({
      id: s.id,
      kind: s.kind as ScenarioKind,
      label: s.label,
      active: s.active,
      section: s.section as BudgetSection,
      amount: num(s.amount),
      percent: num(s.percent),
      mealAllowance: num(s.mealAllowance),
      startMonth: s.startMonth,
      spreadMonths: s.spreadMonths,
    })),
  };
}

/**
 * The revenue budgeted for the month containing `date`, switched-on "what
 * ifs" included — the target the dashboard measures the month against. Null
 * when there is no budget for that year or it plans nothing for that month.
 */
export async function plannedRevenueFor(restaurantId: string, date: Date): Promise<number | null> {
  const budget = await loadBudget(restaurantId, date.getFullYear());
  if (!budget) return null;
  const revenue = computePlan(budget.lines, budget.scenarios).sections.REVENUE[date.getMonth()];
  return revenue > 0 ? revenue : null;
}
