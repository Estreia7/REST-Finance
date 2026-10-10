import { prisma } from '@/lib/prisma';
import { dueOccurrences, nextOccurrence } from '@/lib/recurring-costs';

/**
 * Books whatever fixed monthly costs have come due for one restaurant.
 *
 * Called when the dashboard opens, and straight after a fixed cost is
 * created, so a contract typed in with a start date months ago fills in its
 * past months at once. There is no scheduler on the box; doing it on read
 * also means a month nobody looked at is caught up the next time anyone
 * does.
 *
 * Safe to run twice at once: entries are written with skipDuplicates against
 * the unique (recurringCostId, date) pair, so two dashboards opening together
 * book each month once.
 */
export async function bookDueRecurringCosts(restaurantId: string, now: Date = new Date()): Promise<number> {
  const today = now.toISOString().slice(0, 10);
  const key = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

  const templates = await prisma.recurringCost.findMany({
    where: { restaurantId, active: true, startDate: { lte: new Date(`${today}T00:00:00Z`) } },
  });

  let booked = 0;

  for (const t of templates) {
    const schedule = {
      startDate: key(t.startDate)!,
      dayOfMonth: t.dayOfMonth,
      endDate: key(t.endDate),
      lastGeneratedDate: key(t.lastGeneratedDate),
    };
    const due = dueOccurrences({ ...schedule, today });

    // A contract whose last month is booked is finished: it leaves the list
    // of running costs, and its entries stay where they are.
    const finishedAfter = (last: string | null) =>
      nextOccurrence({ ...schedule, lastGeneratedDate: last }) === null;

    if (due.length === 0) {
      if (finishedAfter(schedule.lastGeneratedDate)) {
        await prisma.recurringCost.update({ where: { id: t.id }, data: { active: false } });
      }
      continue;
    }

    const last = due[due.length - 1];
    await prisma.$transaction([
      prisma.costEntry.createMany({
        data: due.map((date) => ({
          restaurantId,
          date: new Date(`${date}T00:00:00Z`),
          type: t.type,
          categoryId: t.categoryId,
          amount: t.amount,
          description: t.description,
          createdById: t.createdById,
          recurringCostId: t.id,
          // Paid the way the fixed cost says, on its own date. A direct
          // debit is left to pay itself on that date; none, it waits.
          paymentMethod: t.paymentMethod,
          vendorId: t.vendorId,
          paidAt: t.paymentMethod && t.paymentMethod !== 'DIRECT_DEBIT'
            ? new Date(`${date}T00:00:00Z`)
            : null,
        })),
        skipDuplicates: true,
      }),
      prisma.recurringCost.update({
        where: { id: t.id },
        data: {
          lastGeneratedDate: new Date(`${last}T00:00:00Z`),
          active: !finishedAfter(last),
        },
      }),
    ]);
    booked += due.length;
  }

  return booked;
}
