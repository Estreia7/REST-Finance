import { prisma } from '@/lib/prisma';
import { runAssistantTool } from '@/lib/assistant-tools';
import { readInboxCounts } from '@/lib/inbox-server';
import { buildInbox, inboxTotals } from '@/lib/inbox';
import { lastWeek, type WeeklyReportData, type PeriodFigures } from '@/lib/weekly-report';

/**
 * Gathers last week's figures for one restaurant, through the assistant's own
 * read-only tools and the inbox's counts, so the email never says something
 * the app does not. Callers authorise first.
 */
export async function gatherWeeklyReport(restaurantId: string, today = new Date()): Promise<WeeklyReportData | null> {
  const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { name: true } });
  if (!restaurant) return null;

  const { from, to, prevFrom, prevTo } = lastWeek(today);
  const tool = async <T>(name: string, input: Record<string, unknown>) =>
    JSON.parse(await runAssistantTool(name, input, restaurantId)) as T;

  type Summary = PeriodFigures & { daysWithTakings: number };
  const [week, previous, categories, prices, payables, inbox] = await Promise.all([
    tool<Summary>('period_summary', { from, to }),
    tool<Summary>('period_summary', { from: prevFrom, to: prevTo }),
    tool<Array<{ category: string; total: number }>>('costs_by_category', { from, to }),
    tool<{ rises: WeeklyReportData['priceRises'] }>('price_changes', { days: 30 }),
    tool<{ unpaid: number; overdue: number }>('payables', {}),
    readInboxCounts(restaurantId),
  ]);

  const urgent = buildInbox(inbox).filter((i) => i.severity === 'high');
  const figures = (s: Summary): PeriodFigures => ({
    revenue: s.revenue, costs: s.costs, result: s.result, marginPct: s.marginPct, foodCostPct: s.foodCostPct,
  });

  return {
    restaurant: restaurant.name,
    from, to,
    week: figures(week),
    previous: figures(previous),
    topCategories: categories.filter((c) => c.total > 0),
    priceRises: prices.rises,
    unpaid: payables.unpaid,
    overdue: payables.overdue,
    urgent: inboxTotals(urgent).count,
    appUrl: (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, ''),
  };
}

/** Whether a week had anything worth an email: a quiet, empty week sends nothing. */
export function hasActivity(d: WeeklyReportData): boolean {
  return d.week.revenue > 0 || d.week.costs > 0 || d.unpaid > 0 || d.urgent > 0;
}
