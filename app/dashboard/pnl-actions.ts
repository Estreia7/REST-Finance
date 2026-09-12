'use server';

import { prisma } from '@/lib/prisma';
import { requireMember, isAuthError } from '@/lib/auth-helpers';
import { toPercent } from '@/lib/kpi';
import { buildUsarStatement } from '@/lib/kpi-extended';
import { toClientError } from '@/lib/errors';

/**
 * Annual profit and loss, and the drill-down behind each figure.
 *
 * Every number on a statement is a sum of entries somebody typed. Being able
 * to click one and see those entries is what turns a report into something an
 * owner will trust, and it is how a wrong month gets traced back to the day
 * it was mistyped.
 */

/** Which part of a daily summary a revenue line refers to. */
export type RevenueChannel = 'total' | 'dineIn' | 'takeaway';

export type PnLLine = {
  label: string;
  /** Twelve months, January first. Missing months are 0, not absent. */
  months: number[];
  total: number;
  /** Share of annual revenue. Null for the revenue line itself. */
  percentOfRevenue: number | null;
  /** Identifies what to fetch when the figure is clicked. */
  drill: {
    kind: 'revenue' | 'cogs' | 'opex';
    categoryId?: string;
    channel?: RevenueChannel;
  } | null;
};

function emptyMonths(): number[] {
  return Array.from({ length: 12 }, () => 0);
}

export async function getAnnualPnL(year: number) {
  try {
    const member = await requireMember();
    if (isAuthError(member)) return { error: member.error };

    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      return { error: 'Ano inválido' };
    }

    const start = new Date(year, 0, 1);
    const end = new Date(year, 11, 31, 23, 59, 59);
    const scope = { restaurantId: member.restaurantId, deletedAt: null };

    const [summaries, costs, categories] = await Promise.all([
      // Grouped by day, then folded into months here: Prisma cannot group by
      // month portably, and a year is at most 365 rows.
      prisma.dailySummary.findMany({
        where: { ...scope, date: { gte: start, lte: end } },
        select: {
          date: true,
          revenueTotal: true,
          dineInRevenue: true,
          takeawayRevenue: true,
        },
      }),
      prisma.costEntry.findMany({
        where: { ...scope, date: { gte: start, lte: end } },
        select: { date: true, amount: true, type: true, categoryId: true },
      }),
      prisma.category.findMany({
        where: { restaurantId: member.restaurantId },
        select: { id: true, name: true, type: true, isLabour: true, isOccupancy: true },
      }),
    ]);

    const categoryById = new Map(categories.map((c) => [c.id, c]));

    // ------------------------------------------------------------ revenue
    const revenue = emptyMonths();
    const dineIn = emptyMonths();
    const takeaway = emptyMonths();

    for (const s of summaries) {
      const m = s.date.getMonth();
      revenue[m] += Number(s.revenueTotal);
      dineIn[m] += Number(s.dineInRevenue);
      takeaway[m] += Number(s.takeawayRevenue);
    }

    // -------------------------------------------------------------- costs
    const cogsTotal = emptyMonths();
    const opexTotal = emptyMonths();
    const labourTotal = emptyMonths();
    const occupancyTotal = emptyMonths();
    const byCategory = new Map<string, number[]>();

    for (const c of costs) {
      const m = c.date.getMonth();
      const amount = Number(c.amount);
      const category = c.categoryId ? categoryById.get(c.categoryId) : undefined;

      if (c.type === 'COGS') cogsTotal[m] += amount;
      else opexTotal[m] += amount;

      if (category?.isLabour) labourTotal[m] += amount;
      if (category?.isOccupancy) occupancyTotal[m] += amount;

      const key = c.categoryId ?? `__uncategorised_${c.type}`;
      if (!byCategory.has(key)) byCategory.set(key, emptyMonths());
      byCategory.get(key)![m] += amount;
    }

    const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
    const annualRevenue = sum(revenue);

    const pct = (value: number) =>
      annualRevenue > 0 ? toPercent(value / annualRevenue) : 0;

    const line = (
      label: string,
      months: number[],
      drill: PnLLine['drill'],
      showPercent = true
    ): PnLLine => ({
      label,
      months,
      total: sum(months),
      percentOfRevenue: showPercent ? pct(sum(months)) : null,
      drill,
    });

    /**
     * The detail lines under one band.
     *
     * `bucket` splits OPEX three ways, because USAR reports labour and
     * occupancy as their own sections. Without it a wage category would be
     * listed twice — once under Pessoal and again under operating costs — and
     * the section totals would no longer add up to revenue.
     */
    const categoryLines = (
      type: 'COGS' | 'OPEX',
      bucket: 'all' | 'labour' | 'occupancy' | 'other' = 'all'
    ): PnLLine[] =>
      [...byCategory.entries()]
        .filter(([key]) => {
          if (key.startsWith('__uncategorised_')) {
            // An uncategorised cost belongs to none of the special buckets.
            return key.endsWith(type) && (bucket === 'all' || bucket === 'other');
          }
          const category = categoryById.get(key);
          if (category?.type !== type) return false;
          if (bucket === 'all') return true;
          if (bucket === 'labour') return Boolean(category.isLabour);
          if (bucket === 'occupancy') return Boolean(category.isOccupancy);
          return !category.isLabour && !category.isOccupancy;
        })
        .map(([key, months]) => ({
          label: key.startsWith('__uncategorised_')
            ? 'Sem categoria'
            : categoryById.get(key)?.name ?? 'Sem categoria',
          months,
          total: sum(months),
          percentOfRevenue: pct(sum(months)),
          drill: {
            kind: type === 'COGS' ? ('cogs' as const) : ('opex' as const),
            categoryId: key.startsWith('__uncategorised_') ? undefined : key,
          },
        }))
        .sort((a, b) => b.total - a.total);

    // Operating expenses in the USAR sense: what is left of OPEX once labour
    // and occupancy have been lifted into their own sections. Floored at zero
    // so a mis-flagged category cannot produce a negative band.
    const otherOpex = emptyMonths();
    const primeCost = emptyMonths();
    const controllableIncome = emptyMonths();
    const netIncome = emptyMonths();

    for (let m = 0; m < 12; m += 1) {
      otherOpex[m] = Math.max(opexTotal[m] - labourTotal[m] - occupancyTotal[m], 0);

      const statement = buildUsarStatement({
        revenue: revenue[m],
        costOfSales: cogsTotal[m],
        labour: labourTotal[m],
        operatingExpenses: otherOpex[m],
        occupancy: occupancyTotal[m],
      });

      primeCost[m] = statement.primeCost;
      controllableIncome[m] = statement.controllableIncome;
      netIncome[m] = statement.netIncome;
    }

    return {
      success: true,
      data: {
        year,
        revenue: line('Receita total', revenue, { kind: 'revenue', channel: 'total' }, false),
        dineIn: line('Local', dineIn, { kind: 'revenue', channel: 'dineIn' }),
        takeaway: line('Take-away', takeaway, { kind: 'revenue', channel: 'takeaway' }),

        cogs: line('Custo das mercadorias', cogsTotal, { kind: 'cogs' }),
        cogsLines: categoryLines('COGS'),

        labour: line('Pessoal', labourTotal, { kind: 'opex' }),
        labourLines: categoryLines('OPEX', 'labour'),

        // USAR's headline subtotal, and the reason the standard omits a gross
        // profit line: this is the figure that predicts survival.
        primeCost: line('Prime cost', primeCost, null),

        opex: line('Despesas operacionais', otherOpex, null),
        opexLines: categoryLines('OPEX', 'other'),

        controllableIncome: line('Resultado controlável', controllableIncome, null),

        occupancy: line('Renda e ocupação', occupancyTotal, { kind: 'opex' }),
        occupancyLines: categoryLines('OPEX', 'occupancy'),

        netIncome: line('Resultado líquido', netIncome, null),
      },
    };
  } catch (error: unknown) {
    return { error: toClientError('Failed to build annual P&L', error, 'read') };
  }
}

/**
 * The entries behind one figure.
 *
 * Month is 1-12, or 0 for the whole year, matching whichever cell was
 * clicked.
 */
export async function getPnLEntries(params: {
  year: number;
  month: number;
  kind: 'revenue' | 'cogs' | 'opex';
  categoryId?: string;
  channel?: RevenueChannel;
}) {
  try {
    const member = await requireMember();
    if (isAuthError(member)) return { error: member.error };

    const { year, month, kind, categoryId, channel = 'total' } = params;

    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      return { error: 'Ano inválido' };
    }
    if (!Number.isInteger(month) || month < 0 || month > 12) {
      return { error: 'Mês inválido' };
    }

    const start = month === 0 ? new Date(year, 0, 1) : new Date(year, month - 1, 1);
    const end =
      month === 0
        ? new Date(year, 11, 31, 23, 59, 59)
        : new Date(year, month, 0, 23, 59, 59);

    const scope = { restaurantId: member.restaurantId, deletedAt: null };

    if (kind === 'revenue') {
      const rows = await prisma.dailySummary.findMany({
        where: { ...scope, date: { gte: start, lte: end } },
        orderBy: { date: 'asc' },
        select: {
          id: true,
          date: true,
          dineInRevenue: true,
          takeawayRevenue: true,
          revenueTotal: true,
          dineInTickets: true,
          takeawayTickets: true,
          notes: true,
        },
      });

      return {
        success: true,
        data: {
          kind: 'revenue' as const,
          entries: rows
            .map((r) => {
              // The amount has to match the line that was clicked, or the
              // dialog reconciles against the wrong figure.
              const amount =
                channel === 'dineIn'
                  ? Number(r.dineInRevenue)
                  : channel === 'takeaway'
                  ? Number(r.takeawayRevenue)
                  : Number(r.revenueTotal);

              const tickets =
                channel === 'dineIn'
                  ? r.dineInTickets
                  : channel === 'takeaway'
                  ? r.takeawayTickets
                  : r.dineInTickets + r.takeawayTickets;

              const detail =
                channel === 'total'
                  ? `Local ${Number(r.dineInRevenue).toFixed(2)} · Take-away ${Number(
                      r.takeawayRevenue
                    ).toFixed(2)}`
                  : channel === 'dineIn'
                  ? 'Receita de sala'
                  : 'Receita take-away';

              return { id: r.id, date: r.date, amount, detail, tickets, notes: r.notes };
            })
            // A day with no takeaway is noise in a takeaway breakdown.
            .filter((e) => e.amount !== 0),
        },
      };
    }

    const rows = await prisma.costEntry.findMany({
      where: {
        ...scope,
        date: { gte: start, lte: end },
        type: kind === 'cogs' ? 'COGS' : 'OPEX',
        // undefined means "any category"; the caller clicked a total rather
        // than a single line.
        ...(categoryId ? { categoryId } : {}),
      },
      orderBy: { date: 'asc' },
      select: {
        id: true,
        date: true,
        amount: true,
        description: true,
        category: { select: { name: true } },
        vendor: { select: { name: true } },
      },
    });

    return {
      success: true,
      data: {
        kind: kind as 'cogs' | 'opex',
        entries: rows.map((r) => ({
          id: r.id,
          date: r.date,
          amount: Number(r.amount),
          detail: [r.category?.name, r.vendor?.name, r.description]
            .filter(Boolean)
            .join(' · '),
          tickets: null,
          notes: null,
        })),
      },
    };
  } catch (error: unknown) {
    return { error: toClientError('Failed to fetch P&L entries', error, 'read') };
  }
}
