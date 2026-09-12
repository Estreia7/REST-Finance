'use server';

import { requireAdmin, isAuthError } from '@/lib/auth-helpers';
import { prisma } from '@/lib/prisma';
import { signIn } from '@/lib/auth-config';
import { toClientError } from '@/lib/errors';

/**
 * Sign in as the demo restaurant.
 *
 * Deliberately hard-wired to one address. It takes no parameters, so there is
 * no way to point it at a paying client: an administrator cannot use this to
 * read a real customer's financials. Support access to a real account, if it
 * is ever needed, should be a separate feature with consent and an audit
 * trail, not a widening of this one.
 */

const DEMO_EMAIL = 'demo@rest-finance.com';
const DEMO_PASSWORD = 'demo-restaurant-2026';

export async function signInAsDemo() {
  try {
    const admin = await requireAdmin();
    if (isAuthError(admin)) return { error: admin.error };

    const demo = await prisma.user.findUnique({
      where: { email: DEMO_EMAIL },
      select: { id: true },
    });

    if (!demo) {
      return {
        error: 'A conta de demonstração ainda não existe. Corre: npx ts-node scripts/seed-demo.ts',
      };
    }

    // Recorded because it ends the admin's own session; the log explains why
    // the account changed.
    await prisma.auditLog.create({
      data: {
        action: 'admin.demo.signin',
        actorUserId: admin.userId,
        metadata: { adminEmail: admin.email },
      },
    });

    // Goes through the normal credentials flow rather than minting a session
    // directly, so it cannot bypass anything the real sign-in path enforces.
    await signIn('credentials', {
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
      redirect: false,
    });

    return { success: true, redirectTo: '/dashboard' };
  } catch (error: unknown) {
    return { error: toClientError('Failed to sign in as demo', error, 'write') };
  }
}

/** Whether the demo account exists, so the admin UI can explain its absence. */
export async function getDemoStatus() {
  try {
    const admin = await requireAdmin();
    if (isAuthError(admin)) return { error: admin.error };

    const demo = await prisma.user.findFirst({
      where: { email: DEMO_EMAIL },
      select: {
        id: true,
        memberships: {
          where: { role: 'OWNER', active: true },
          select: { restaurant: { select: { id: true, name: true } } },
          take: 1,
        },
      },
    });

    const restaurant = demo?.memberships[0]?.restaurant ?? null;
    if (!restaurant) return { success: true, data: { exists: false } };

    const [summaries, costs, range] = await Promise.all([
      prisma.dailySummary.count({ where: { restaurantId: restaurant.id, deletedAt: null } }),
      prisma.costEntry.count({ where: { restaurantId: restaurant.id, deletedAt: null } }),
      prisma.dailySummary.aggregate({
        where: { restaurantId: restaurant.id, deletedAt: null },
        _min: { date: true },
        _max: { date: true },
      }),
    ]);

    return {
      success: true,
      data: {
        exists: true,
        restaurantName: restaurant.name,
        summaries,
        costs,
        from: range._min.date,
        to: range._max.date,
      },
    };
  } catch (error: unknown) {
    return { error: toClientError('Failed to read demo status', error, 'read') };
  }
}
