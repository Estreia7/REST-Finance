import { prisma } from '@/lib/prisma';
import { getTranslation, type Language } from '@/lib/translations';
import { occurrenceIn } from '@/lib/recurring-costs';
import { bookDueRecurringCosts } from '@/lib/recurring-costs-server';
import { payrollCategory, payrollLines, type PayrollKind } from '@/lib/payroll';

/**
 * Keeps one person's pay booked as fixed monthly costs.
 *
 * Each part of the pay (salary, Social Security, and the subsidies when they
 * are paid whole) is one RecurringCost tied to the person, so the existing
 * monthly booking does the rest. Changing the salary changes the months still
 * to come; what was already booked was paid and stays. No salary, or someone
 * who left, stops every part.
 */

const day = (k: string) => new Date(`${k}T00:00:00Z`);

/** The restaurant's wages and Social Security categories, made when missing. */
async function labourCategories(restaurantId: string) {
  const labour = await prisma.category.findMany({
    where: { restaurantId, isLabour: true, isActive: true },
    orderBy: { sortOrder: 'asc' },
    select: { id: true, name: true },
  });
  const find = (pattern: RegExp) => labour.find((c) => pattern.test(c.name))?.id;
  const ensure = async (name: string) =>
    (await prisma.category.create({
      data: { restaurantId, type: 'OPEX', name, isLabour: true, sortOrder: 0 },
      select: { id: true },
    })).id;

  const wages = find(/ordenad|sal[aá]ri|vencimento|wage|salar/i) ?? labour.find((c) => !/social|tsu/i.test(c.name))?.id ?? await ensure('Ordenados');
  const socialSecurity = find(/seguran[cç]a social|social security|tsu/i) ?? await ensure('Segurança Social');
  return { wages, socialSecurity };
}

export async function syncPayroll(input: {
  restaurantId: string;
  employeeId: string;
  userId: string;
  language: Language;
  now?: Date;
}): Promise<void> {
  const { restaurantId, employeeId, userId, language } = input;
  const now = input.now ?? new Date();

  const employee = await prisma.scheduleEmployee.findFirst({
    where: { id: employeeId, restaurantId },
    select: { name: true, grossSalary: true, subsidiesSpread: true, payDay: true, active: true, deletedAt: true },
  });
  if (!employee) return;

  const wanted = employee.active && !employee.deletedAt && employee.grossSalary
    ? payrollLines({ grossSalary: Number(employee.grossSalary), subsidiesSpread: employee.subsidiesSpread })
    : [];

  const running = await prisma.recurringCost.findMany({
    where: { restaurantId, employeeId, active: true },
    select: { id: true, payrollKind: true, startDate: true, lastGeneratedDate: true },
  });

  const categories = wanted.length ? await labourCategories(restaurantId) : null;
  const describe = (kind: PayrollKind) =>
    getTranslation(language, `payroll.lines.${kind}`).replace('{name}', employee.name);
  const firstDate = occurrenceIn(now.getUTCFullYear(), now.getUTCMonth(), employee.payDay);

  const writes = [];
  for (const line of wanted) {
    const existing = running.find((r) => r.payrollKind === line.kind);
    const data = {
      amount: line.amount,
      months: line.months,
      dayOfMonth: employee.payDay,
      description: describe(line.kind),
      categoryId: categories![payrollCategory(line.kind)],
    };
    if (existing) {
      // Never booked yet: its first date follows the pay day too.
      const startDate = existing.lastGeneratedDate
        ? existing.startDate
        : day(occurrenceIn(existing.startDate.getUTCFullYear(), existing.startDate.getUTCMonth(), employee.payDay));
      writes.push(prisma.recurringCost.update({ where: { id: existing.id }, data: { ...data, startDate } }));
    } else {
      writes.push(prisma.recurringCost.create({
        data: {
          ...data,
          restaurantId,
          employeeId,
          payrollKind: line.kind,
          type: 'OPEX',
          startDate: day(firstDate),
          // Paid by transfer on the day: nobody has to mark wages paid every month.
          paymentMethod: 'TRANSFER',
          createdById: userId,
        },
      }));
    }
  }
  for (const r of running) {
    if (wanted.some((l) => l.kind === r.payrollKind)) continue;
    writes.push(prisma.recurringCost.update({
      where: { id: r.id },
      data: { active: false, endDate: r.lastGeneratedDate ?? r.startDate },
    }));
  }

  if (writes.length) await prisma.$transaction(writes);
  await bookDueRecurringCosts(restaurantId, now);
}
