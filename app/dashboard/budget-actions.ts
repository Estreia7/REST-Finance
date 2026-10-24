'use server';

import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireMember, requireOwner, isAuthError } from '@/lib/auth-helpers';
import { toClientError } from '@/lib/errors';
import { loadBudget, type LoadedBudget } from '@/lib/budget-server';
import {
  BUDGET_SECTIONS,
  SCENARIO_KINDS,
  importFromActual,
  monthsWithoutRevenue,
  type ActualLine,
  type ActualYear,
  type BudgetSection,
} from '@/lib/budget';
import { getAnnualPnL } from './pnl-actions';

/**
 * The annual budget: read it, import last year into it, edit its lines and
 * its "what ifs".
 *
 * Anyone on the team may read the plan; only an owner changes it, as with the
 * revenue target it replaces. Errors come back as dictionary keys.
 */

export interface BudgetCategory {
  id: string;
  name: string;
  section: BudgetSection;
}

/** What actually happened, in the budget's bands, for the comparison. */
export interface BudgetActual {
  sections: Record<BudgetSection, number[]>;
  netIncome: number[];
  /** Real months per cost category, to set beside a planned line. */
  byCategory: Record<string, number[]>;
  dineIn: number[];
  takeaway: number[];
}

export interface BudgetView {
  year: number;
  budget: LoadedBudget | null;
  categories: BudgetCategory[];
  actual: BudgetActual | null;
  /** Whether the year before has any takings to import from. */
  previousYearHasData: boolean;
  canEdit: boolean;
}

function yearOk(year: number) {
  return Number.isInteger(year) && year >= 2000 && year <= 2100;
}

/** The band a cost category's real figures land in on the P&L. */
function sectionOf(c: { type: string; isLabour: boolean; isOccupancy: boolean }): BudgetSection | null {
  if (c.type === 'COGS') return 'COGS';
  if (c.type !== 'OPEX') return null;
  if (c.isLabour) return 'LABOUR';
  if (c.isOccupancy) return 'OCCUPANCY';
  return 'OPEX';
}

type AnnualData = {
  revenue: { months: number[] };
  dineIn: { months: number[] };
  takeaway: { months: number[] };
  cogs: { months: number[] };
  labour: { months: number[] };
  opex: { months: number[] };
  occupancy: { months: number[] };
  netIncome: { months: number[] };
  cogsLines: Array<{ months: number[]; drill: { categoryId?: string } | null }>;
  labourLines: Array<{ months: number[]; drill: { categoryId?: string } | null }>;
  opexLines: Array<{ months: number[]; drill: { categoryId?: string } | null }>;
  occupancyLines: Array<{ months: number[]; drill: { categoryId?: string } | null }>;
};

/** The annual P&L for a year, or null when it cannot be read. */
async function actualYear(year: number): Promise<AnnualData | null> {
  const result = await getAnnualPnL(year);
  return 'data' in result && result.data ? (result.data as AnnualData) : null;
}

const toActualLines = (lines: AnnualData['cogsLines']): ActualLine[] =>
  lines.map((l) => ({ categoryId: l.drill?.categoryId ?? null, months: l.months }));

export async function getBudget(year: number): Promise<{ success: true; data: BudgetView } | { error: string }> {
  try {
    const member = await requireMember();
    if (isAuthError(member)) return { error: member.error };
    if (!yearOk(year)) return { error: 'budget.error.invalid' };

    const [budget, categories, previousYearDays] = await Promise.all([
      loadBudget(member.restaurantId, year),
      prisma.category.findMany({
        where: { restaurantId: member.restaurantId, isActive: true },
        select: { id: true, name: true, type: true, isLabour: true, isOccupancy: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      }),
      prisma.dailySummary.count({
        where: {
          restaurantId: member.restaurantId,
          deletedAt: null,
          revenueTotal: { gt: 0 },
          date: { gte: new Date(year - 1, 0, 1), lte: new Date(year - 1, 11, 31, 23, 59, 59) },
        },
      }),
    ]);

    // A year that has not started has nothing to compare yet.
    const annual = year <= new Date().getFullYear() ? await actualYear(year) : null;
    let actual: BudgetActual | null = null;
    if (annual) {
      const byCategory: Record<string, number[]> = {};
      for (const l of [...annual.cogsLines, ...annual.labourLines, ...annual.opexLines, ...annual.occupancyLines]) {
        if (l.drill?.categoryId) byCategory[l.drill.categoryId] = l.months;
      }
      actual = {
        sections: {
          REVENUE: annual.revenue.months,
          COGS: annual.cogs.months,
          LABOUR: annual.labour.months,
          OPEX: annual.opex.months,
          OCCUPANCY: annual.occupancy.months,
        },
        netIncome: annual.netIncome.months,
        byCategory,
        dineIn: annual.dineIn.months,
        takeaway: annual.takeaway.months,
      };
    }

    return {
      success: true,
      data: {
        year,
        budget,
        categories: categories.flatMap((c) => {
          const section = sectionOf(c);
          return section ? [{ id: c.id, name: c.name, section }] : [];
        }),
        actual,
        previousYearHasData: previousYearDays > 0,
        canEdit: member.role === 'OWNER',
      },
    };
  } catch (error: unknown) {
    return { error: toClientError('getBudget', error, 'read') };
  }
}

async function ensureBudget(restaurantId: string, year: number) {
  return prisma.budget.upsert({
    where: { restaurantId_year: { restaurantId, year } },
    create: { restaurantId, year },
    update: {},
    select: { id: true },
  });
}

const sectionSchema = z.enum(BUDGET_SECTIONS);
const money = z.number().finite().min(-10_000_000).max(10_000_000);

const importSchema = z.object({
  year: z.number().int(),
  revenueGrowth: z.number().finite().min(-90).max(500),
  costGrowth: z.number().finite().min(-90).max(500),
  sections: z.array(sectionSchema).min(1),
});

/**
 * Fills the chosen bands from the year before, replacing what those bands
 * held. The "what ifs" are kept: they are the owner's own decisions, not
 * figures last year can supply.
 *
 * Returns the months of the source year with no takings, so the screen can
 * say which planned months came out empty and why.
 */
export async function importBudgetFromPreviousYear(input: z.infer<typeof importSchema>) {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return { error: owner.error };
    const parsed = importSchema.safeParse(input);
    if (!parsed.success || !yearOk(parsed.data.year)) return { error: 'budget.error.invalid' };
    const { year, revenueGrowth, costGrowth, sections } = parsed.data;

    const annual = await actualYear(year - 1);
    if (!annual) return { error: 'budget.error.noSource' };

    const source: ActualYear = {
      revenue: annual.revenue.months,
      dineIn: annual.dineIn.months,
      takeaway: annual.takeaway.months,
      cogsLines: toActualLines(annual.cogsLines),
      labourLines: toActualLines(annual.labourLines),
      opexLines: toActualLines(annual.opexLines),
      occupancyLines: toActualLines(annual.occupancyLines),
    };
    const lines = importFromActual(source, { revenueGrowth, costGrowth, sections });

    const budget = await ensureBudget(owner.restaurantId, year);
    await prisma.$transaction([
      prisma.budgetLine.deleteMany({ where: { budgetId: budget.id, section: { in: sections } } }),
      prisma.budgetLine.createMany({
        data: lines.map((l, i) => ({
          budgetId: budget.id,
          section: l.section,
          categoryId: l.categoryId,
          channel: l.channel,
          label: l.label,
          months: l.months,
          revenueShare: l.revenueShare,
          sortOrder: i,
        })),
      }),
      prisma.budget.update({ where: { id: budget.id }, data: { importedFromYear: year - 1 } }),
    ]);

    return {
      success: true,
      data: {
        imported: lines.length,
        emptyMonths: sections.includes('REVENUE') ? monthsWithoutRevenue(source) : [],
      },
    };
  } catch (error: unknown) {
    return { error: toClientError('importBudgetFromPreviousYear', error, 'write') };
  }
}

const lineSchema = z.object({
  year: z.number().int(),
  id: z.string().uuid().optional(),
  section: sectionSchema,
  categoryId: z.string().uuid().nullable(),
  label: z.string().trim().max(120),
  months: z.array(money).length(12),
  revenueShare: z.number().finite().min(0).max(5).nullable(),
});

/**
 * Creates or updates one planned line.
 *
 * A line must say what it is: a category, a channel already on it, or the
 * owner's own name. A share of revenue only makes sense for cost of sales.
 */
export async function saveBudgetLine(input: z.infer<typeof lineSchema>) {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return { error: owner.error };
    const parsed = lineSchema.safeParse(input);
    if (!parsed.success || !yearOk(parsed.data.year)) return { error: 'budget.error.invalid' };
    const { year, id, section, categoryId, label, months, revenueShare } = parsed.data;
    if (revenueShare !== null && section !== 'COGS') return { error: 'budget.error.invalid' };

    if (categoryId) {
      const category = await prisma.category.findFirst({
        where: { id: categoryId, restaurantId: owner.restaurantId },
        select: { id: true },
      });
      if (!category) return { error: 'budget.error.invalid' };
    }

    const data = {
      section,
      categoryId,
      label,
      months: months.map((v) => Math.round(v * 100) / 100),
      revenueShare,
    };

    if (id) {
      const existing = await prisma.budgetLine.findFirst({
        where: { id, budget: { restaurantId: owner.restaurantId, year } },
        select: { id: true, channel: true },
      });
      if (!existing) return { error: 'budget.error.notFound' };
      if (!label && !categoryId && !existing.channel) return { error: 'budget.error.nameRequired' };
      await prisma.budgetLine.update({ where: { id }, data });
      return { success: true, data: { id } };
    }

    if (!label && !categoryId) return { error: 'budget.error.nameRequired' };
    const budget = await ensureBudget(owner.restaurantId, year);
    const count = await prisma.budgetLine.count({ where: { budgetId: budget.id } });
    const created = await prisma.budgetLine.create({
      data: { ...data, budgetId: budget.id, sortOrder: count },
      select: { id: true },
    });
    return { success: true, data: { id: created.id } };
  } catch (error: unknown) {
    return { error: toClientError('saveBudgetLine', error, 'write') };
  }
}

export async function deleteBudgetLine(id: string) {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return { error: owner.error };
    const { count } = await prisma.budgetLine.deleteMany({
      where: { id, budget: { restaurantId: owner.restaurantId } },
    });
    return count > 0 ? { success: true } : { error: 'budget.error.notFound' };
  } catch (error: unknown) {
    return { error: toClientError('deleteBudgetLine', error, 'write') };
  }
}

const scenarioSchema = z.object({
  year: z.number().int(),
  id: z.string().uuid().optional(),
  kind: z.enum(SCENARIO_KINDS),
  label: z.string().trim().min(1).max(120),
  active: z.boolean(),
  section: sectionSchema,
  amount: money.nullable(),
  percent: z.number().finite().min(-90).max(500).nullable(),
  mealAllowance: z.number().finite().min(0).max(10_000).nullable(),
  startMonth: z.number().int().min(1).max(12),
  spreadMonths: z.number().int().min(1).max(120).nullable(),
});

/** The band each kind lands in; only a new fixed cost lets the owner choose. */
function scenarioSection(kind: z.infer<typeof scenarioSchema>['kind'], requested: BudgetSection): BudgetSection | null {
  switch (kind) {
    case 'HIRE': return 'LABOUR';
    case 'PURCHASE': return 'OPEX';
    case 'REVENUE_CHANGE': return 'REVENUE';
    case 'COGS_CHANGE': return 'COGS';
    case 'FIXED_COST':
      return requested === 'OPEX' || requested === 'OCCUPANCY' || requested === 'LABOUR' ? requested : null;
  }
}

export async function saveBudgetScenario(input: z.infer<typeof scenarioSchema>) {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return { error: owner.error };
    const parsed = scenarioSchema.safeParse(input);
    if (!parsed.success || !yearOk(parsed.data.year)) return { error: 'budget.error.invalid' };
    const { year, id, kind, ...rest } = parsed.data;

    const section = scenarioSection(kind, rest.section);
    if (!section) return { error: 'budget.error.invalid' };
    const percentKind = kind === 'REVENUE_CHANGE' || kind === 'COGS_CHANGE';
    if (percentKind ? rest.percent === null : rest.amount === null) return { error: 'budget.error.invalid' };

    const data = {
      kind,
      label: rest.label,
      active: rest.active,
      section,
      amount: percentKind ? null : rest.amount,
      percent: percentKind ? rest.percent : null,
      mealAllowance: kind === 'HIRE' ? rest.mealAllowance ?? 0 : null,
      startMonth: rest.startMonth,
      spreadMonths: kind === 'PURCHASE' ? rest.spreadMonths ?? 1 : null,
    };

    if (id) {
      const { count } = await prisma.budgetScenario.updateMany({
        where: { id, budget: { restaurantId: owner.restaurantId, year } },
        data,
      });
      return count > 0 ? { success: true, data: { id } } : { error: 'budget.error.notFound' };
    }

    const budget = await ensureBudget(owner.restaurantId, year);
    const created = await prisma.budgetScenario.create({
      data: { ...data, budgetId: budget.id },
      select: { id: true },
    });
    return { success: true, data: { id: created.id } };
  } catch (error: unknown) {
    return { error: toClientError('saveBudgetScenario', error, 'write') };
  }
}

export async function setBudgetScenarioActive(id: string, active: boolean) {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return { error: owner.error };
    const { count } = await prisma.budgetScenario.updateMany({
      where: { id, budget: { restaurantId: owner.restaurantId } },
      data: { active: Boolean(active) },
    });
    return count > 0 ? { success: true } : { error: 'budget.error.notFound' };
  } catch (error: unknown) {
    return { error: toClientError('setBudgetScenarioActive', error, 'write') };
  }
}

export async function deleteBudgetScenario(id: string) {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return { error: owner.error };
    const { count } = await prisma.budgetScenario.deleteMany({
      where: { id, budget: { restaurantId: owner.restaurantId } },
    });
    return count > 0 ? { success: true } : { error: 'budget.error.notFound' };
  } catch (error: unknown) {
    return { error: toClientError('deleteBudgetScenario', error, 'write') };
  }
}
