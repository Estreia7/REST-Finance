import { describe, it, expect } from 'vitest';
import { lastWeek, buildWeeklyReport, type WeeklyReportData } from '@/lib/weekly-report';

const data: WeeklyReportData = {
  restaurant: 'Tasca <Antiga>',
  from: '2026-10-19', to: '2026-10-25',
  week: { revenue: 8200, costs: 6100, result: 2100, marginPct: 25.6, foodCostPct: 31.2 },
  previous: { revenue: 8000, costs: 6000, result: 2000, marginPct: 25, foodCostPct: 30 },
  topCategories: [{ category: 'Comida', total: 2500 }],
  priceRises: [{ product: 'Azeite 5L', supplier: 'Makro', before: 30, now: 34.5, changePct: 15 }],
  unpaid: 1200, overdue: 300, urgent: 2,
  appUrl: 'https://app.example',
};

describe('lastWeek', () => {
  it('is the Monday to Sunday before any day of this week', () => {
    expect(lastWeek(new Date('2026-10-26T08:00:00Z'))).toEqual({ from: '2026-10-19', to: '2026-10-25', prevFrom: '2026-10-12', prevTo: '2026-10-18' });
    expect(lastWeek(new Date('2026-11-01T08:00:00Z')).from).toBe('2026-10-19');
  });
});

describe('buildWeeklyReport', () => {
  it('writes the week against the one before, in the owner language', () => {
    const pt = buildWeeklyReport(data, 'pt');
    expect(pt.text).toContain('+2.5%');
    expect(pt.text).toContain('Azeite 5L (Makro)');
    expect(pt.text).toContain('https://app.example/dashboard');
    const en = buildWeeklyReport(data, 'en');
    expect(en.subject).not.toBe(pt.subject);
  });

  it('escapes names in the HTML', () => {
    expect(buildWeeklyReport(data, 'pt').html).toContain('Tasca &lt;Antiga&gt;');
  });

  it('leaves out what has nothing to show', () => {
    const quiet = buildWeeklyReport({ ...data, priceRises: [], urgent: 0, overdue: 0, previous: { ...data.previous, revenue: 0 } }, 'en');
    expect(quiet.text).not.toContain('%)');
    expect(quiet.text).not.toMatch(/urgent/i);
  });
});
