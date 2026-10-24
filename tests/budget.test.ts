import { describe, it, expect } from 'vitest';
import {
  computePlan, hireMonthlyCost, scenarioImpact, costScenarioMonths, importFromActual,
  monthsWithoutRevenue, variance, closedMonths, throughMonth, spreadEvenly, rescaleMonths, sum, emptyMonths,
  type PlanLine, type Scenario, type ActualYear,
} from '@/lib/budget';

const flat = (v: number) => Array.from({ length: 12 }, () => v);

const line = (over: Partial<PlanLine> & Pick<PlanLine, 'id' | 'section'>): PlanLine => ({
  categoryId: null, channel: null, label: '', months: emptyMonths(), revenueShare: null, ...over,
});

const scenario = (over: Partial<Scenario> & Pick<Scenario, 'id' | 'kind'>): Scenario => ({
  label: 'x', active: true, section: 'OPEX', amount: null, percent: null,
  mealAllowance: null, startMonth: 1, spreadMonths: null, ...over,
});

const base: PlanLine[] = [
  line({ id: 'rev', section: 'REVENUE', channel: 'total', months: flat(30000) }),
  line({ id: 'food', section: 'COGS', revenueShare: 0.3 }),
  line({ id: 'wages', section: 'LABOUR', months: flat(9000) }),
  line({ id: 'power', section: 'OPEX', months: flat(2000) }),
  line({ id: 'rent', section: 'OCCUPANCY', months: flat(3000) }),
];

describe('hireMonthlyCost', () => {
  it('spreads fourteen salaries over twelve months and adds the employer TSU', () => {
    // 1000 × 14 / 12 = 1166.67; × 1.2375 = 1443.75
    expect(hireMonthlyCost(1000, 0)).toBe(1443.75);
  });

  it('adds the meal allowance for the eleven months worked, without TSU', () => {
    expect(hireMonthlyCost(1000, 240)).toBe(1443.75 + 220);
  });
});

describe('computePlan', () => {
  it('follows the P&L bands down to the net result', () => {
    const plan = computePlan(base, []);
    expect(plan.sections.REVENUE[0]).toBe(30000);
    expect(plan.sections.COGS[0]).toBe(9000);
    expect(plan.primeCost[0]).toBe(18000);
    expect(plan.controllableIncome[0]).toBe(10000);
    expect(plan.netIncome[0]).toBe(7000);
  });

  it('turns a share of revenue into euros, month by month', () => {
    const seasonal = [line({ id: 'rev', section: 'REVENUE', months: [10000, ...flat(20000).slice(1)] }),
      line({ id: 'food', section: 'COGS', revenueShare: 0.25 })];
    const plan = computePlan(seasonal, []);
    expect(plan.lines.find((l) => l.id === 'food')!.computed.slice(0, 2)).toEqual([2500, 5000]);
  });

  it('lets food cost follow a planned increase in sales', () => {
    const plan = computePlan(base, [scenario({ id: 's', kind: 'REVENUE_CHANGE', percent: 10, startMonth: 7 })]);
    expect(plan.sections.REVENUE[5]).toBe(30000);
    expect(plan.sections.REVENUE[6]).toBe(33000);
    expect(plan.sections.COGS[6]).toBe(9900);
  });

  it('adds revenue changes rather than compounding them', () => {
    const plan = computePlan(base, [
      scenario({ id: 'a', kind: 'REVENUE_CHANGE', percent: 3, startMonth: 1 }),
      scenario({ id: 'b', kind: 'REVENUE_CHANGE', percent: 2, startMonth: 1 }),
    ]);
    expect(plan.sections.REVENUE[0]).toBe(31500);
  });

  it('puts a hire under labour from the month they start', () => {
    const plan = computePlan(base, [scenario({ id: 'h', kind: 'HIRE', amount: 1000, startMonth: 10, section: 'LABOUR' })]);
    expect(plan.sections.LABOUR[8]).toBe(9000);
    expect(plan.sections.LABOUR[9]).toBe(9000 + 1443.75);
    expect(plan.scenarioRows).toHaveLength(1);
    expect(plan.scenarioRows[0].total).toBe(1443.75 * 3);
  });

  it('lands a new fixed cost in the band the owner chose', () => {
    const plan = computePlan(base, [scenario({ id: 'f', kind: 'FIXED_COST', amount: 400, section: 'OCCUPANCY', startMonth: 1 })]);
    expect(plan.sections.OCCUPANCY[0]).toBe(3400);
    expect(plan.sections.OPEX[0]).toBe(2000);
  });

  it('raises cost of sales by a supplier increase', () => {
    const plan = computePlan(base, [scenario({ id: 'c', kind: 'COGS_CHANGE', percent: 5, startMonth: 1 })]);
    expect(plan.sections.COGS[0]).toBe(9450);
  });

  it('ignores switched-off items, and all items when asked for the plan as typed', () => {
    const hire = scenario({ id: 'h', kind: 'HIRE', amount: 1000, active: false });
    expect(computePlan(base, [hire]).sections.LABOUR[0]).toBe(9000);
    const on = { ...hire, active: true };
    expect(computePlan(base, [on], { withScenarios: false }).sections.LABOUR[0]).toBe(9000);
    expect(computePlan(base, [on], { withScenarios: false }).scenarioRows).toHaveLength(0);
  });
});

describe('costScenarioMonths', () => {
  it('pays a purchase at once by default', () => {
    const months = costScenarioMonths(scenario({ id: 'p', kind: 'PURCHASE', amount: 6000, startMonth: 3 }))!;
    expect(months[2]).toBe(6000);
    expect(sum(months)).toBe(6000);
  });

  it('spreads a purchase and cuts it at December', () => {
    const months = costScenarioMonths(scenario({ id: 'p', kind: 'PURCHASE', amount: 6000, startMonth: 11, spreadMonths: 6 }))!;
    expect(months[10]).toBe(1000);
    expect(months[11]).toBe(1000);
    expect(sum(months)).toBe(2000);
  });
});

describe('scenarioImpact', () => {
  it('gives the cost of a hire as its effect on the result, even before it is switched on', () => {
    const s = [scenario({ id: 'h', kind: 'HIRE', amount: 1000, active: false })];
    expect(scenarioImpact(base, s, 'h')).toBe(-1443.75 * 12);
  });

  it('counts a sales increase net of the food cost that follows it', () => {
    const s = [scenario({ id: 'r', kind: 'REVENUE_CHANGE', percent: 10 })];
    // +3000 a month in sales, 30% of it spent on food
    expect(scenarioImpact(base, s, 'r')).toBe(2100 * 12);
  });
});

describe('importFromActual', () => {
  const actual: ActualYear = {
    revenue: [0, 0, ...flat(20000).slice(2)],
    dineIn: [0, 0, ...flat(15000).slice(2)],
    takeaway: [0, 0, ...flat(5000).slice(2)],
    cogsLines: [{ categoryId: 'meat', months: [0, 0, ...flat(6000).slice(2)] }],
    labourLines: [{ categoryId: 'wages', months: flat(8000) }],
    opexLines: [{ categoryId: null, months: flat(100) }, { categoryId: 'unused', months: emptyMonths() }],
    occupancyLines: [{ categoryId: 'rent', months: flat(2500) }],
  };

  it('keeps the seasonality and applies growth to revenue, split by channel', () => {
    const lines = importFromActual(actual, { revenueGrowth: 10, costGrowth: 0, sections: ['REVENUE'] });
    expect(lines.map((l) => l.channel)).toEqual(['dineIn', 'takeaway']);
    expect(lines[0].months[0]).toBe(0);
    expect(lines[0].months[2]).toBe(16500);
  });

  it('uses a single revenue line when there was no takeaway', () => {
    const lines = importFromActual({ ...actual, takeaway: emptyMonths(), dineIn: actual.revenue },
      { revenueGrowth: 0, costGrowth: 0, sections: ['REVENUE'] });
    expect(lines).toHaveLength(1);
    expect(lines[0].channel).toBe('total');
  });

  it('imports cost of sales as the year\'s share of revenue', () => {
    const [food] = importFromActual(actual, { revenueGrowth: 0, costGrowth: 0, sections: ['COGS'] });
    expect(food.revenueShare).toBe(0.3);
    expect(food.categoryId).toBe('meat');
  });

  it('inflates the other costs, keeps uncategorised ones and drops empty ones', () => {
    const lines = importFromActual(actual, { revenueGrowth: 0, costGrowth: 2, sections: ['LABOUR', 'OPEX', 'OCCUPANCY'] });
    expect(lines).toHaveLength(3);
    expect(lines.find((l) => l.categoryId === 'wages')!.months[0]).toBe(8160);
    expect(lines.find((l) => l.section === 'OPEX')!.categoryId).toBeNull();
  });

  it('only imports the bands asked for', () => {
    const lines = importFromActual(actual, { revenueGrowth: 0, costGrowth: 0, sections: ['OCCUPANCY'] });
    expect(lines.every((l) => l.section === 'OCCUPANCY')).toBe(true);
  });

  it('names the months with no takings to warn about', () => {
    expect(monthsWithoutRevenue(actual)).toEqual([0, 1]);
  });
});

describe('variance', () => {
  it('calls more revenue than planned good news', () => {
    const v = variance('REVENUE', 1000, 1100);
    expect(v).toMatchObject({ difference: 100, percent: 10, favourable: true });
  });

  it('calls a cost over budget bad news', () => {
    expect(variance('COGS', 1000, 1100).favourable).toBe(false);
    expect(variance('LABOUR', 1000, 900).favourable).toBe(true);
  });

  it('has no percentage when nothing was budgeted', () => {
    expect(variance('OPEX', 0, 50).percent).toBeNull();
  });
});

describe('closedMonths', () => {
  const today = new Date(2026, 9, 24);
  it('judges only finished months', () => {
    expect(closedMonths(2025, today)).toBe(12);
    expect(closedMonths(2026, today)).toBe(9);
    expect(closedMonths(2027, today)).toBe(0);
    expect(throughMonth(flat(10), 9)).toBe(90);
  });
});

describe('rescaleMonths', () => {
  it('keeps the shape of a seasonal line', () => {
    const months = rescaleMonths([...flat(1000).slice(0, 11), 2000], 26000);
    expect(months[0]).toBe(2000);
    expect(months[11]).toBe(4000);
  });

  it('spreads evenly when the line is empty', () => {
    expect(rescaleMonths(emptyMonths(), 1200)).toEqual(flat(100));
  });

  it('adds up to the total to the cent', () => {
    const months = rescaleMonths([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], 1000);
    expect(Math.round(sum(months) * 100) / 100).toBe(1000);
  });
});

describe('spreadEvenly', () => {
  it('adds up to the total to the cent', () => {
    const months = spreadEvenly(1000);
    expect(months[0]).toBe(83.33);
    expect(Math.round(sum(months) * 100) / 100).toBe(1000);
  });
});
