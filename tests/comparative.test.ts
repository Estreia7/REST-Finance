import { describe, it, expect } from 'vitest';
import { buildYearComparison, cumulativeSales, axisIndex, AXIS_DAYS, type DayAmount } from '@/lib/comparative';

const day = (iso: string, amount: number): DayAmount => ({ date: new Date(`${iso}T00:00:00Z`), amount });
const today = new Date('2026-10-09T00:00:00Z');

describe('buildYearComparison', () => {
  const revenue = [
    day('2025-10-03', 1000), day('2025-10-09', 500), day('2025-10-20', 9000), // last October
    day('2026-10-02', 1200), day('2026-10-09', 600),                          // this October so far
    day('2025-03-15', 4000), day('2026-03-15', 5000),
  ];
  const costs = [day('2025-10-05', 300), day('2026-10-05', 400), day('2026-03-01', 1000)];

  it('lays out January to December of this year', () => {
    const c = buildYearComparison(revenue, costs, today);
    expect(c.year).toBe(2026);
    expect(c.months).toHaveLength(12);
    expect(c.months[2]).toMatchObject({ month: 2, revenue: 5000, costs: 1000, profit: 4000 });
    expect(c.months[2].lastYear).toEqual({ revenue: 4000, costs: 0, profit: 4000 });
  });

  it('compares the running month with the same days last year, not the whole month', () => {
    const { current } = buildYearComparison(revenue, costs, today);
    expect(current).toMatchObject({ month: 9, revenue: 1800, costs: 400, throughDay: 9 });
    // 3 and 9 October 2025 count; the 20th has not "happened" yet this year.
    expect(current.lastYear).toEqual({ revenue: 1500, costs: 300, profit: 1200 });
  });

  it('says there is nothing to compare with rather than comparing with zero', () => {
    const c = buildYearComparison(revenue, costs, today);
    expect(c.months[0].lastYear).toBeNull();
  });

  it('averages the last six months, reaching into last year when needed', () => {
    const early = new Date('2026-02-10T00:00:00Z');
    const c = buildYearComparison([day('2025-09-15', 600), day('2026-02-01', 600)], [], early);
    expect(c.averageSixMonths).toBe(200);
  });

  it('cuts last February at its own end in a leap comparison', () => {
    const leapToday = new Date('2028-02-29T00:00:00Z');
    const c = buildYearComparison([day('2027-02-28', 100), day('2028-02-29', 50)], [], leapToday);
    expect(c.current.lastYear?.revenue).toBe(100);
  });
});

describe('cumulativeSales', () => {
  const revenue = [day('2025-01-01', 100), day('2025-10-09', 50), day('2025-12-31', 10), day('2026-01-02', 200), day('2026-10-09', 40)];

  it('accumulates each year on a shared January-to-December axis', () => {
    const s = cumulativeSales(revenue, today);
    expect(s.years).toEqual([2026, 2025]);
    expect(s.rows).toHaveLength(AXIS_DAYS);
    expect(s.rows[0]).toMatchObject({ '2025': 100, '2026': 0 });
    expect(s.rows[AXIS_DAYS - 1]['2025']).toBe(160);
  });

  it('stops this year at today and reports both totals at the same date', () => {
    const s = cumulativeSales(revenue, today);
    expect(s.todayIndex).toBe(axisIndex(9, 9));
    expect(s.rows[s.todayIndex]['2026']).toBe(240);
    expect(s.rows[s.todayIndex + 1]['2026']).toBeNull();
    expect(s.toDate).toEqual({ current: 240, lastYear: 150 });
  });

  it('gives 29 February its own slot', () => {
    expect(axisIndex(1, 29)).toBe(59);
    expect(axisIndex(2, 1)).toBe(60);
    expect(axisIndex(11, 31)).toBe(365);
  });
});
