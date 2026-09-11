import { describe, it, expect } from 'vitest';
import {
  calculateKpis,
  calculateRevPASH,
  safeDivide,
  toPercent,
  percentChange,
  rateAgainstBenchmark,
  BENCHMARKS,
  type KpiInput,
} from '@/lib/kpi';

/** A realistic month for a small Portuguese restaurant. */
function baseInput(overrides: Partial<KpiInput> = {}): KpiInput {
  return {
    revenueTotal: 50_000,
    cogsTotal: 15_000, // 30% food cost
    labourTotal: 15_000, // 30% labour
    opexTotal: 10_000, // rent, utilities, etc.
    dineInRevenue: 35_000,
    takeawayRevenue: 15_000,
    dineInTickets: 1_400,
    takeawayTickets: 750,
    ...overrides,
  };
}

describe('safeDivide', () => {
  it('divides normally', () => {
    expect(safeDivide(10, 4)).toBe(2.5);
  });

  it('returns 0 rather than Infinity when dividing by zero', () => {
    expect(safeDivide(100, 0)).toBe(0);
  });

  it('returns 0 rather than NaN for 0/0', () => {
    expect(safeDivide(0, 0)).toBe(0);
  });

  it('handles negative numerators', () => {
    expect(safeDivide(-50, 100)).toBe(-0.5);
  });
});

describe('toPercent', () => {
  it('converts a ratio to a display percentage', () => {
    expect(toPercent(0.3245)).toBe(32.5);
  });

  it('respects the decimals argument', () => {
    expect(toPercent(0.3245, 2)).toBe(32.45);
    expect(toPercent(0.3245, 0)).toBe(32);
  });
});

describe('percentChange', () => {
  it('computes growth', () => {
    expect(percentChange(120, 100)).toBeCloseTo(0.2);
  });

  it('computes decline', () => {
    expect(percentChange(80, 100)).toBeCloseTo(-0.2);
  });

  it('returns 0 when the previous period was zero', () => {
    expect(percentChange(500, 0)).toBe(0);
  });

  it('uses the absolute base so a recovery from a loss reads as positive', () => {
    expect(percentChange(50, -100)).toBeCloseTo(1.5);
  });
});

describe('calculateKpis — core arithmetic', () => {
  it('computes every KPI for a healthy restaurant', () => {
    const k = calculateKpis(baseInput());

    expect(k.totalRevenue).toBe(50_000);
    expect(k.grossProfit).toBe(35_000); // revenue - cogs
    expect(k.grossProfitPct).toBeCloseTo(0.7);

    expect(k.foodCostPct).toBeCloseTo(0.3);
    expect(k.labourCostPct).toBeCloseTo(0.3);

    expect(k.primeCost).toBe(30_000); // cogs + labour
    expect(k.primeCostPct).toBeCloseTo(0.6);

    // 50000 - 15000 - 15000 - 10000
    expect(k.netIncome).toBe(10_000);
    expect(k.netIncomePct).toBeCloseTo(0.2);
  });

  it('subtracts labour from net income', () => {
    // Regression guard: the previous implementation computed
    // netIncome = revenue - cogs - opex and silently ignored labour,
    // overstating profit by the entire wage bill.
    const withLabour = calculateKpis(baseInput({ labourTotal: 15_000 }));
    const withoutLabour = calculateKpis(baseInput({ labourTotal: 0 }));

    expect(withoutLabour.netIncome - withLabour.netIncome).toBe(15_000);
  });

  it('includes labour in prime cost', () => {
    // Regression guard for the production bug where labour categories were
    // matched by hardcoded Portuguese names, so any restaurant that renamed
    // them got labour = 0 and a prime cost understated by roughly half.
    const k = calculateKpis(baseInput({ cogsTotal: 15_000, labourTotal: 15_000 }));
    expect(k.primeCost).toBe(30_000);
    expect(k.primeCostPct).toBeCloseTo(0.6);

    const broken = calculateKpis(baseInput({ cogsTotal: 15_000, labourTotal: 0 }));
    expect(broken.primeCostPct).toBeCloseTo(0.3); // what users saw before
    expect(broken.primeCostPct).not.toBeCloseTo(k.primeCostPct);
  });

  it('computes average tickets per channel and overall', () => {
    const k = calculateKpis(baseInput());
    expect(k.avgTicketDineIn).toBeCloseTo(25); // 35000 / 1400
    expect(k.avgTicketTakeaway).toBeCloseTo(20); // 15000 / 750
    expect(k.avgTicketOverall).toBeCloseTo(50_000 / 2_150);
  });
});

describe('calculateKpis — edge cases', () => {
  it('handles an all-zero period without NaN or Infinity', () => {
    const k = calculateKpis({
      revenueTotal: 0,
      cogsTotal: 0,
      labourTotal: 0,
      opexTotal: 0,
      dineInRevenue: 0,
      takeawayRevenue: 0,
      dineInTickets: 0,
      takeawayTickets: 0,
    });

    for (const [key, value] of Object.entries(k)) {
      if (value === null) continue;
      expect(Number.isFinite(value as number), `${key} must be finite`).toBe(true);
    }
    expect(k.primeCostPct).toBe(0);
    expect(k.netIncomePct).toBe(0);
    expect(k.avgTicketOverall).toBe(0);
  });

  it('reports a loss when costs exceed revenue', () => {
    const k = calculateKpis(
      baseInput({ revenueTotal: 20_000, cogsTotal: 12_000, labourTotal: 12_000, opexTotal: 8_000 })
    );

    expect(k.netIncome).toBe(-12_000);
    expect(k.netIncomePct).toBeLessThan(0);
    expect(k.primeCostPct).toBeGreaterThan(1); // prime cost above revenue
  });

  it('handles revenue with no tickets recorded', () => {
    const k = calculateKpis(baseInput({ dineInTickets: 0, takeawayTickets: 0 }));
    expect(k.avgTicketDineIn).toBe(0);
    expect(k.avgTicketTakeaway).toBe(0);
    expect(k.avgTicketOverall).toBe(0);
  });
});

describe('calculateRevPASH', () => {
  it('computes revenue per available seat-hour', () => {
    // 50 seats x 8 hours x 30 days = 12,000 seat-hours; 35,000 dine-in revenue
    const revpash = calculateRevPASH(
      baseInput({ seats: 50, serviceHoursPerDay: 8, daysInPeriod: 30 })
    );
    expect(revpash).toBeCloseTo(35_000 / 12_000);
  });

  it('uses dine-in revenue only, since takeaway occupies no seat', () => {
    const a = calculateRevPASH(
      baseInput({ takeawayRevenue: 15_000, seats: 50, serviceHoursPerDay: 8, daysInPeriod: 30 })
    );
    const b = calculateRevPASH(
      baseInput({ takeawayRevenue: 90_000, seats: 50, serviceHoursPerDay: 8, daysInPeriod: 30 })
    );
    expect(a).toBe(b);
  });

  it.each([
    ['seats missing', { serviceHoursPerDay: 8, daysInPeriod: 30 }],
    ['hours missing', { seats: 50, daysInPeriod: 30 }],
    ['days missing', { seats: 50, serviceHoursPerDay: 8 }],
    ['seats zero', { seats: 0, serviceHoursPerDay: 8, daysInPeriod: 30 }],
    ['hours zero', { seats: 50, serviceHoursPerDay: 0, daysInPeriod: 30 }],
    ['seats negative', { seats: -10, serviceHoursPerDay: 8, daysInPeriod: 30 }],
  ])('returns null when %s, so the UI hides the metric', (_label, overrides) => {
    expect(calculateRevPASH(baseInput(overrides as Partial<KpiInput>))).toBeNull();
  });

  it('is exposed on the full KPI result', () => {
    expect(calculateKpis(baseInput()).revPASH).toBeNull();
    expect(
      calculateKpis(baseInput({ seats: 50, serviceHoursPerDay: 8, daysInPeriod: 30 })).revPASH
    ).toBeGreaterThan(0);
  });
});

describe('rateAgainstBenchmark', () => {
  it('rates a food cost inside the healthy band as good', () => {
    expect(rateAgainstBenchmark('foodCostPct', 0.3)).toBe('good');
  });

  it('rates a slightly high prime cost as a warning', () => {
    // max 0.62, warning up to 0.682
    expect(rateAgainstBenchmark('primeCostPct', 0.65)).toBe('warning');
  });

  it('rates a runaway prime cost as bad', () => {
    expect(rateAgainstBenchmark('primeCostPct', 0.8)).toBe('bad');
  });

  it('inverts the scale for margins, where higher is better', () => {
    expect(rateAgainstBenchmark('netIncomePct', 0.18, { higherIsBetter: true })).toBe('good');
    expect(rateAgainstBenchmark('netIncomePct', 0.02, { higherIsBetter: true })).toBe('bad');
  });

  it('treats the exact band edge as good', () => {
    expect(rateAgainstBenchmark('foodCostPct', BENCHMARKS.foodCostPct.max)).toBe('good');
  });
});
