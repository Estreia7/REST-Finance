import { describe, expect, it } from 'vitest';
import { monthlyEmployerCost, parseSalary, payrollCategory, payrollLines } from '@/lib/payroll';
import { hireMonthlyCost } from '@/lib/budget';
import { dueOccurrences, nextOccurrence } from '@/lib/recurring-costs';

describe('payrollLines', () => {
  it('spreads the subsidies over the twelve months', () => {
    expect(payrollLines({ grossSalary: 1000, subsidiesSpread: true })).toEqual([
      { kind: 'salary', amount: 1166.67, months: [] },
      { kind: 'socialSecurity', amount: 277.08, months: [] },
    ]);
  });

  it('books the subsidies whole in June and November', () => {
    expect(payrollLines({ grossSalary: 1000, subsidiesSpread: false })).toEqual([
      { kind: 'salary', amount: 1000, months: [] },
      { kind: 'socialSecurity', amount: 237.5, months: [] },
      { kind: 'subsidy', amount: 1000, months: [6, 11] },
      { kind: 'subsidySocialSecurity', amount: 237.5, months: [6, 11] },
    ]);
  });

  it('books nothing without a salary', () => {
    expect(payrollLines({ grossSalary: 0, subsidiesSpread: true })).toEqual([]);
  });

  it('costs the same over a year either way, and matches the budget', () => {
    const spread = monthlyEmployerCost({ grossSalary: 1000, subsidiesSpread: true });
    const whole = monthlyEmployerCost({ grossSalary: 1000, subsidiesSpread: false });
    expect(whole).toBeCloseTo(spread, 1);
    expect(spread).toBeCloseTo(hireMonthlyCost(1000, 0), 1);
  });

  it('files salary and subsidy as wages, the rest as Social Security', () => {
    expect(payrollCategory('salary')).toBe('wages');
    expect(payrollCategory('subsidy')).toBe('wages');
    expect(payrollCategory('socialSecurity')).toBe('socialSecurity');
    expect(payrollCategory('subsidySocialSecurity')).toBe('socialSecurity');
  });
});

describe('parseSalary', () => {
  it('reads euros with a comma or a point', () => {
    expect(parseSalary('1050,50')).toBe(1050.5);
    expect(parseSalary(' 920 ')).toBe(920);
  });
  it('treats empty or zero as no salary', () => {
    expect(parseSalary('')).toBeNull();
    expect(parseSalary('0')).toBeNull();
  });
  it('refuses what is not an amount', () => {
    expect(parseSalary('mil')).toBe('invalid');
    expect(parseSalary('-5')).toBe('invalid');
  });
});

describe('a fixed cost booked only in some months', () => {
  const subsidy = { startDate: '2026-11-30', dayOfMonth: 31, endDate: null, months: [6, 11] };

  it('books in November, then waits for June', () => {
    expect(dueOccurrences({ ...subsidy, lastGeneratedDate: null, today: '2027-07-01' })).toEqual(['2026-11-30', '2027-06-30']);
    expect(nextOccurrence({ ...subsidy, lastGeneratedDate: '2026-11-30' })).toBe('2027-06-30');
  });

  it('skips a first date outside its months', () => {
    expect(dueOccurrences({ ...subsidy, startDate: '2026-12-31', lastGeneratedDate: null, today: '2027-02-01' })).toEqual([]);
    expect(nextOccurrence({ ...subsidy, startDate: '2026-12-31', lastGeneratedDate: null })).toBe('2027-06-30');
  });

  it('books every month when no months are given', () => {
    expect(dueOccurrences({ ...subsidy, months: [], lastGeneratedDate: '2026-11-30', today: '2027-01-31' })).toEqual(['2026-12-31', '2027-01-31']);
  });
});
