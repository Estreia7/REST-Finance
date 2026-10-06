'use server';

import { prisma } from '@/lib/prisma';
import { requireOwner, isAuthError } from '@/lib/auth-helpers';
import { bookDueRecurringCosts } from '@/lib/recurring-costs-server';
import { nextOccurrence } from '@/lib/recurring-costs';

/**
 * Fixed monthly costs: rent, internet, a 12-month contract.
 *
 * Owner-only, like every cost. Errors are dictionary keys, never sentences:
 * there is no language here, and the panel translates them.
 */

function fail(error: string) {
  return { success: false as const, error };
}

const key = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

/**
 * Books the months that have come due. Run when the dashboard opens, before
 * anything is read, so every figure on screen already includes them.
 */
export async function syncRecurringCosts() {
  const owner = await requireOwner();
  if (isAuthError(owner)) return fail(owner.error);
  try {
    const booked = await bookDueRecurringCosts(owner.restaurantId);
    return { success: true as const, data: { booked } };
  } catch {
    // Never the reason the dashboard fails to open: the costs are booked the
    // next time round.
    return fail('recurring.syncFailed');
  }
}

/** The fixed costs still running, soonest next booking first. */
export async function listRecurringCosts() {
  const owner = await requireOwner();
  if (isAuthError(owner)) return fail(owner.error);

  const rows = await prisma.recurringCost.findMany({
    where: { restaurantId: owner.restaurantId, active: true },
    include: { category: { select: { name: true } } },
  });

  const data = rows
    .map((r) => {
      const schedule = {
        startDate: key(r.startDate)!,
        dayOfMonth: r.dayOfMonth,
        endDate: key(r.endDate),
        lastGeneratedDate: key(r.lastGeneratedDate),
      };
      return {
        id: r.id,
        type: r.type,
        categoryName: r.category?.name ?? null,
        description: r.description,
        amount: Number(r.amount),
        dayOfMonth: r.dayOfMonth,
        startDate: schedule.startDate,
        endDate: schedule.endDate,
        nextDate: nextOccurrence(schedule),
      };
    })
    .sort((a, b) => (a.nextDate ?? '9999').localeCompare(b.nextDate ?? '9999'));

  return { success: true as const, data };
}

/**
 * Changes what the coming months will book. The months already booked keep
 * their amount: they are what was actually paid.
 */
export async function updateRecurringCostAmount(id: string, amount: number) {
  const owner = await requireOwner();
  if (isAuthError(owner)) return fail(owner.error);
  if (!Number.isFinite(amount) || amount < 0.01 || amount > 999999) return fail('recurring.invalidAmount');

  const { count } = await prisma.recurringCost.updateMany({
    where: { id, restaurantId: owner.restaurantId, active: true },
    data: { amount: Math.round(amount * 100) / 100 },
  });
  if (count === 0) return fail('recurring.notFound');
  return { success: true as const };
}

/**
 * Stops a fixed cost: nothing more is booked. What was already booked stays,
 * because it was paid.
 */
export async function stopRecurringCost(id: string) {
  const owner = await requireOwner();
  if (isAuthError(owner)) return fail(owner.error);

  const existing = await prisma.recurringCost.findFirst({
    where: { id, restaurantId: owner.restaurantId, active: true },
    select: { id: true, lastGeneratedDate: true, startDate: true },
  });
  if (!existing) return fail('recurring.notFound');

  await prisma.recurringCost.update({
    where: { id },
    data: { active: false, endDate: existing.lastGeneratedDate ?? existing.startDate },
  });
  return { success: true as const };
}
