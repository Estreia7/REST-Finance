import { EMPLOYER_TSU } from './budget';

/**
 * What one person's pay books as fixed costs every month.
 *
 * Portuguese wages are paid fourteen times a year: twelve salaries plus the
 * holiday and Christmas subsidies. Some restaurants pay the subsidies a
 * twelfth each month (duodécimos), so every month costs gross × 14 ÷ 12; others
 * pay them whole, here in June and November. Either way the employer's Social
 * Security (TSU, 23.75%) is due on every euro of it. The 11% withheld from the
 * employee is part of the gross and costs the restaurant nothing more.
 *
 * Pure, so the arithmetic is tested without a database.
 */

export const SUBSIDY_MONTHS: readonly number[] = [6, 11];

export type PayrollKind = 'salary' | 'socialSecurity' | 'subsidy' | 'subsidySocialSecurity';
export const PAYROLL_KINDS: readonly PayrollKind[] = ['salary', 'socialSecurity', 'subsidy', 'subsidySocialSecurity'];

export interface PayrollLine {
  kind: PayrollKind;
  amount: number;
  /** Months it books in, 1–12; empty is every month. */
  months: number[];
}

export interface PayInput {
  grossSalary: number;
  subsidiesSpread: boolean;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** The fixed costs one salary books. Nothing for no salary. */
export function payrollLines({ grossSalary, subsidiesSpread }: PayInput): PayrollLine[] {
  if (!(grossSalary > 0)) return [];
  if (subsidiesSpread) {
    const monthly = round2((grossSalary * 14) / 12);
    return [
      { kind: 'salary', amount: monthly, months: [] },
      { kind: 'socialSecurity', amount: round2(monthly * EMPLOYER_TSU), months: [] },
    ];
  }
  const gross = round2(grossSalary);
  const tsu = round2(gross * EMPLOYER_TSU);
  return [
    { kind: 'salary', amount: gross, months: [] },
    { kind: 'socialSecurity', amount: tsu, months: [] },
    { kind: 'subsidy', amount: gross, months: [...SUBSIDY_MONTHS] },
    { kind: 'subsidySocialSecurity', amount: tsu, months: [...SUBSIDY_MONTHS] },
  ];
}

/** What the person costs the restaurant in an average month: the year's pay over twelve. */
export function monthlyEmployerCost(input: PayInput): number {
  const year = payrollLines(input).reduce((s, l) => s + l.amount * (l.months.length || 12), 0);
  return round2(year / 12);
}

/** Labour category each part books under: the salary in wages, the rest in Social Security. */
export function payrollCategory(kind: PayrollKind): 'wages' | 'socialSecurity' {
  return kind === 'salary' || kind === 'subsidy' ? 'wages' : 'socialSecurity';
}

/** A salary as typed: euros, a comma allowed, within reason. */
export function parseSalary(value: string): number | null | 'invalid' {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed.replace(/\s/g, '').replace(',', '.'));
  if (!Number.isFinite(n) || n < 0 || n > 100000) return 'invalid';
  return n === 0 ? null : round2(n);
}
