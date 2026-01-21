import { describe, it, expect } from 'vitest';
import { calculateKpis } from '../lib/kpi';

describe('calculateKpis', () => {
  it('computes all KPIs with non-zero revenue', () => {
    const result = calculateKpis({
      revenueTotal: 1000,
      cogsTotal: 400,
      opexTotal: 300,
      dineInRevenue: 700,
      takeawayRevenue: 300,
      dineInTickets: 70,
      takeawayTickets: 30
    });

    expect(result.totalRevenue).toBe(1000);
    expect(result.totalCogs).toBe(400);
    expect(result.grossProfit).toBe(600);
    expect(result.grossProfitPct).toBeCloseTo(0.6);
    expect(result.operatingExpenses).toBe(300);
    expect(result.netIncome).toBe(300);
    expect(result.netIncomePct).toBeCloseTo(0.3);
    expect(result.avgTicketDineIn).toBeCloseTo(10);
    expect(result.avgTicketTakeaway).toBeCloseTo(10);
  });

  it('handles zero revenue safely', () => {
    const result = calculateKpis({
      revenueTotal: 0,
      cogsTotal: 0,
      opexTotal: 0,
      dineInRevenue: 0,
      takeawayRevenue: 0,
      dineInTickets: 0,
      takeawayTickets: 0
    });

    expect(result.grossProfitPct).toBe(0);
    expect(result.netIncomePct).toBe(0);
  });
});

