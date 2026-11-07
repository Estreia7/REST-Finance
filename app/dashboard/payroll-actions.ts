'use server';

import { prisma } from '@/lib/prisma';
import { requireOwner, isAuthError } from '@/lib/auth-helpers';
import { getServerLanguage } from '@/lib/server-language';
import { monthlyEmployerCost, parseSalary } from '@/lib/payroll';
import { syncPayroll } from '@/lib/payroll-server';

/**
 * The people on the team and what each one is paid.
 *
 * Owner-only: salaries are nobody else's business. Errors are dictionary
 * keys; the panel translates them.
 */

function fail(error: string) {
  return { success: false as const, error };
}

export interface TeamMemberPay {
  id: string;
  name: string;
  role: string | null;
  color: string;
  grossSalary: number | null;
  subsidiesSpread: boolean;
  payDay: number;
  /** What they cost the restaurant in an average month, Social Security included. */
  monthlyCost: number;
}

export async function getTeamPay() {
  const owner = await requireOwner();
  if (isAuthError(owner)) return fail(owner.error);

  const [employees, unlinked] = await Promise.all([
    prisma.scheduleEmployee.findMany({
      where: { restaurantId: owner.restaurantId, deletedAt: null, active: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, name: true, role: true, color: true, grossSalary: true, subsidiesSpread: true, payDay: true },
    }),
    // Wages already typed as fixed costs by hand: booked from Equipa as well,
    // they would count twice.
    prisma.recurringCost.findMany({
      where: { restaurantId: owner.restaurantId, active: true, employeeId: null, category: { isLabour: true } },
      select: { amount: true },
    }),
  ]);

  const people: TeamMemberPay[] = employees.map((e) => {
    const gross = e.grossSalary ? Number(e.grossSalary) : null;
    return {
      id: e.id,
      name: e.name,
      role: e.role,
      color: e.color,
      grossSalary: gross,
      subsidiesSpread: e.subsidiesSpread,
      payDay: e.payDay,
      monthlyCost: gross ? monthlyEmployerCost({ grossSalary: gross, subsidiesSpread: e.subsidiesSpread }) : 0,
    };
  });

  return {
    success: true as const,
    data: {
      people,
      handTypedLabour: {
        count: unlinked.length,
        amount: Math.round(unlinked.reduce((s, r) => s + Number(r.amount), 0) * 100) / 100,
      },
    },
  };
}

export async function setEmployeePay(
  id: string,
  input: { grossSalary: string; subsidiesSpread: boolean; payDay: number },
) {
  const owner = await requireOwner();
  if (isAuthError(owner)) return fail(owner.error);

  const gross = parseSalary(input.grossSalary ?? '');
  if (gross === 'invalid') return fail('payroll.errors.salary');
  if (!Number.isInteger(input.payDay) || input.payDay < 1 || input.payDay > 31) return fail('payroll.errors.payDay');

  const { count } = await prisma.scheduleEmployee.updateMany({
    where: { id, restaurantId: owner.restaurantId, deletedAt: null },
    data: { grossSalary: gross, subsidiesSpread: !!input.subsidiesSpread, payDay: input.payDay },
  });
  if (count === 0) return fail('payroll.errors.notFound');

  await syncPayroll({
    restaurantId: owner.restaurantId,
    employeeId: id,
    userId: owner.userId,
    language: await getServerLanguage(),
  });
  return { success: true as const };
}
