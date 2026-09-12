import { describe, it, expect } from 'vitest';
import {
  buildUsarStatement,
  calculateCvp,
  seatTurnover,
  revenuePerSeat,
  flowThrough,
  varianceFromTarget,
} from '@/lib/kpi-extended';
import { rate, bandLabel, PT_BENCHMARKS } from '@/lib/benchmarks';

describe('buildUsarStatement', () => {
  // A month with round numbers, so every subtotal can be checked by hand.
  const month = buildUsarStatement({
    revenue: 100_000,
    costOfSales: 30_000,
    labour: 30_000,
    operatingExpenses: 15_000,
    occupancy: 10_000,
  });

  it('puts prime cost at cost of sales plus labour', () => {
    expect(month.primeCost).toBe(60_000);
    expect(month.primeCostPct).toBeCloseTo(0.6, 10);
  });

  it('stops controllable income before occupancy', () => {
    // 100 − 30 − 30 − 15 = 25. Rent has not been taken yet, deliberately:
    // it is not something a manager can act on this month.
    expect(month.controllableIncome).toBe(25_000);
    expect(month.controllableIncomePct).toBeCloseTo(0.25, 10);
  });

  it('takes occupancy only at the net line', () => {
    expect(month.netIncome).toBe(15_000);
    expect(month.netIncomePct).toBeCloseTo(0.15, 10);
  });

  it('reconciles: revenue less every cost equals net income', () => {
    const totalCosts =
      month.costOfSales + month.labour + month.operatingExpenses + month.occupancy;
    expect(month.revenue - totalCosts).toBeCloseTo(month.netIncome, 10);
  });

  it('reports zero rather than NaN for a month with no trade', () => {
    const empty = buildUsarStatement({
      revenue: 0,
      costOfSales: 0,
      labour: 0,
      operatingExpenses: 0,
      occupancy: 0,
    });

    expect(empty.primeCostPct).toBe(0);
    expect(empty.netIncomePct).toBe(0);
    expect(Number.isNaN(empty.netIncomePct)).toBe(false);
  });

  it('carries a loss through as a negative, not a floor of zero', () => {
    // Closed for refurbishment: rent still due, nothing sold.
    const bad = buildUsarStatement({
      revenue: 10_000,
      costOfSales: 5_000,
      labour: 8_000,
      operatingExpenses: 3_000,
      occupancy: 4_000,
    });

    expect(bad.controllableIncome).toBe(-6_000);
    expect(bad.netIncome).toBe(-10_000);
    expect(bad.netIncomePct).toBeCloseTo(-1, 10);
  });
});

describe('calculateCvp', () => {
  it('computes break-even from the contribution margin ratio', () => {
    // CM ratio 0.70; fixed costs 35 000 → break-even 50 000.
    const cvp = calculateCvp({ revenue: 100_000, variableCosts: 30_000, fixedCosts: 35_000 });

    expect(cvp.contributionMarginRatio).toBeCloseTo(0.7, 10);
    expect(cvp.breakEvenRevenue).toBeCloseTo(50_000, 6);
    expect(cvp.marginOfSafety).toBeCloseTo(0.5, 10);
  });

  it('reports no break-even when variable costs swallow the sale', () => {
    // Selling at or below variable cost: no volume ever breaks even, and a
    // number here would be worse than none.
    const cvp = calculateCvp({ revenue: 50_000, variableCosts: 50_000, fixedCosts: 10_000 });

    expect(cvp.breakEvenRevenue).toBeNull();
    expect(cvp.marginOfSafety).toBeNull();
  });

  it('gives a negative margin of safety below break-even', () => {
    const cvp = calculateCvp({ revenue: 40_000, variableCosts: 12_000, fixedCosts: 35_000 });

    expect(cvp.breakEvenRevenue).toBeCloseTo(50_000, 6);
    expect(cvp.marginOfSafety!).toBeLessThan(0);
  });

  it('survives a month with no revenue', () => {
    const cvp = calculateCvp({ revenue: 0, variableCosts: 0, fixedCosts: 20_000 });
    expect(cvp.breakEvenRevenue).toBeNull();
  });
});

describe('capacity metrics', () => {
  it('counts seat turnover per day', () => {
    // 40 seats, 30 days, 2400 covers → two sittings a day.
    expect(seatTurnover(2_400, 40, 30)).toBeCloseTo(2, 10);
  });

  it('returns null when the seat count is unknown', () => {
    // Better to hide the tile than to invent a denominator.
    expect(seatTurnover(2_400, null, 30)).toBeNull();
    expect(seatTurnover(2_400, 0, 30)).toBeNull();
    expect(revenuePerSeat(50_000, undefined)).toBeNull();
  });

  it('divides revenue across seats', () => {
    expect(revenuePerSeat(48_000, 48)).toBeCloseTo(1_000, 10);
  });
});

describe('flowThrough', () => {
  it('reports the share of extra revenue that reached the profit line', () => {
    // Revenue up 10 000, profit up 4 000.
    expect(flowThrough(14_000, 10_000, 110_000, 100_000)).toBeCloseTo(0.4, 10);
  });

  it('goes negative when profit fell despite growth', () => {
    // The case worth catching: busier, and worse off.
    expect(flowThrough(8_000, 10_000, 110_000, 100_000)).toBeCloseTo(-0.2, 10);
  });

  it('can exceed one when costs fell as sales rose', () => {
    expect(flowThrough(20_000, 10_000, 105_000, 100_000)).toBeCloseTo(2, 10);
  });

  it('returns null when revenue did not move', () => {
    expect(flowThrough(12_000, 10_000, 100_000, 100_000)).toBeNull();
  });
});

describe('varianceFromTarget', () => {
  it('is positive when a cost ran over target', () => {
    expect(varianceFromTarget(0.34, 0.3)).toBeCloseTo(0.04, 10);
  });

  it('is negative when it came in under', () => {
    expect(varianceFromTarget(0.28, 0.3)).toBeCloseTo(-0.02, 10);
  });
});

describe('benchmark rating', () => {
  it('rates a cost good below the band and bad past the concern line', () => {
    expect(rate('foodCostPct', 0.3)).toBe('good');
    expect(rate('foodCostPct', 0.35)).toBe('watch');
    expect(rate('foodCostPct', 0.42)).toBe('bad');
  });

  it('inverts the direction for a margin', () => {
    expect(rate('netIncomePct', 0.09, { higherIsBetter: true })).toBe('good');
    expect(rate('netIncomePct', 0.03, { higherIsBetter: true })).toBe('watch');
    expect(rate('netIncomePct', -0.05, { higherIsBetter: true })).toBe('bad');
  });

  it('says unknown rather than guessing when there is no value', () => {
    expect(rate('primeCostPct', null)).toBe('unknown');
    expect(rate('primeCostPct', Number.NaN)).toBe('unknown');
  });

  it('holds Portuguese labour to a Portuguese band', () => {
    // 34% is ordinary here; against the US full-service median it would look
    // like an achievement, which is exactly the misreading to avoid.
    expect(rate('labourPct', 0.34)).toBe('good');
    expect(PT_BENCHMARKS.labourPct.note).toMatch(/TSU/);
  });

  it('describes each band in words', () => {
    expect(bandLabel('primeCostPct')).toBe('alvo 55–65%');
    expect(bandLabel('occupancyPct')).toBe('alvo ≤ 12%');
    expect(bandLabel('netIncomePct', true)).toBe('alvo ≥ 5%');
  });

  it('cites a source for every benchmark', () => {
    // A benchmark without provenance is an opinion; the UI shows these.
    for (const band of Object.values(PT_BENCHMARKS)) {
      expect(band.source.length).toBeGreaterThan(10);
    }
  });
});
