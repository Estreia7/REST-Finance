'use server';

import { prisma } from '@/lib/prisma';
import { requireOwner, isAuthError } from '@/lib/auth-helpers';
import { toClientError } from '@/lib/errors';
import { readInboxCounts } from '@/lib/inbox-server';
import { buildInbox, type InboxItem } from '@/lib/inbox';

/**
 * The "Precisa de ti" inbox, for every restaurant the person owns.
 *
 * An owner of two houses gets both in one list, each labelled, the active one
 * first — the point of an inbox is not having to visit each restaurant to find
 * out whether it needs you. Only restaurants they own: a staff member has no
 * business with another house's overdue invoices.
 */

export interface RestaurantInbox {
  restaurantId: string;
  name: string;
  active: boolean;
  items: InboxItem[];
}

export async function getInbox() {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return { success: false as const, error: owner.error };

    const memberships = await prisma.membership.findMany({
      where: { userId: owner.userId, role: 'OWNER', active: true },
      orderBy: { createdAt: 'asc' },
      select: { restaurantId: true, restaurant: { select: { name: true } } },
    });

    const groups: RestaurantInbox[] = await Promise.all(
      memberships.map(async (m) => ({
        restaurantId: m.restaurantId,
        name: m.restaurant.name,
        active: m.restaurantId === owner.restaurantId,
        items: buildInbox(await readInboxCounts(m.restaurantId)),
      })),
    );
    groups.sort((a, b) => Number(b.active) - Number(a.active));

    return { success: true as const, data: groups };
  } catch (error: unknown) {
    return { success: false as const, error: toClientError('Failed to read the inbox', error, 'read') };
  }
}
