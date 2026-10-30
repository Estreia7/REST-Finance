import { describe, it, expect } from 'vitest';
import { monthForecast } from '@/lib/month-forecast';

describe('monthForecast', () => {
  it('adds the fixed costs still due and food for the revenue to come', () => {
    // 10 000 in so far, heading for 30 000. Food ran at 30%: 6 000 more of it.
    // Rent of 2 000 is still to be booked.
    const f = monthForecast({
      revenueSoFar: 10_000, projectedRevenue: 30_000, costsSoFar: 7_000, cogsSoFar: 3_000, fixedStillDue: 2_000,
    });
    expect(f).toEqual({ revenue: 30_000, costs: 15_000, result: 15_000, margin: 50 });
  });

  it('can forecast a loss', () => {
    const f = monthForecast({
      revenueSoFar: 1_000, projectedRevenue: 2_000, costsSoFar: 1_500, cogsSoFar: 400, fixedStillDue: 1_000,
    });
    expect(f?.result).toBe(-900);
  });

  it('says nothing before there is revenue to project from', () => {
    expect(monthForecast({ revenueSoFar: 0, projectedRevenue: null, costsSoFar: 500, cogsSoFar: 0, fixedStillDue: 0 })).toBeNull();
  });
});
