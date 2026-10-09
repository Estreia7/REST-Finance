'use server';

import { cookies } from 'next/headers';
import { auth, signIn } from '@/lib/auth-config';
import { requireAdmin, isAuthError } from '@/lib/auth-helpers';
import { prisma } from '@/lib/prisma';
import { toClientError } from '@/lib/errors';
import { ACTIVE_RESTAURANT_COOKIE } from '@/lib/active-restaurant';
import { issueTicket, isPlatformAdmin } from '@/lib/impersonation-server';
import { IMPERSONATION_MINUTES } from '@/lib/impersonation';

/**
 * Support access: sign in as a client, and back. See lib/impersonation.ts for
 * the design and the decisions behind it.
 */

/**
 * Signs the administrator in as a client, with every restaurant they hold.
 *
 * Refused for another administrator, and for an account with no restaurant
 * to look at. Logged before the switch, so the entry is on record even if
 * the sign-in itself fails.
 */
export async function startImpersonation(userId: string) {
  try {
    const admin = await requireAdmin();
    if (isAuthError(admin)) return { error: admin.error };
    if (userId === admin.userId) return { error: 'admin.impersonate.notAllowed' };

    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, email: true, name: true,
        memberships: {
          where: { active: true },
          select: { role: true, restaurant: { select: { id: true, name: true } } },
        },
      },
    });
    if (!target) return { error: 'admin.impersonate.notFound' };
    if (target.memberships.some((m) => m.role === 'PLATFORM_ADMIN')) {
      return { error: 'admin.impersonate.notAllowed' };
    }
    const restaurants = target.memberships
      .filter((m) => m.role === 'OWNER' || m.role === 'STAFF')
      .map((m) => m.restaurant);
    if (restaurants.length === 0) return { error: 'admin.impersonate.noRestaurant' };

    // One entry per restaurant, so each restaurant's own activity shows that
    // support was in it.
    await prisma.auditLog.createMany({
      data: restaurants.map((r) => ({
        restaurantId: r.id,
        action: 'admin.impersonate.start',
        actorUserId: admin.userId,
        metadata: {
          adminEmail: admin.email,
          targetUserId: target.id,
          targetEmail: target.email,
          minutes: IMPERSONATION_MINUTES,
        },
      })),
    });

    const ticket = await issueTicket(admin.userId, target.id);
    // The restaurant last chosen in the admin's browser means nothing for
    // the client; theirs is resolved afresh from their own memberships.
    cookies().delete(ACTIVE_RESTAURANT_COOKIE);
    await signIn('impersonation', { ticket, redirect: false });

    return { success: true, redirectTo: '/dashboard' };
  } catch (error: unknown) {
    return { error: toClientError('Failed to start support access', error, 'write') };
  }
}

/** Who the administrator is looking at, and until when — for the banner. */
export async function getImpersonation() {
  try {
    const session = await auth();
    if (!session?.user?.id || !session.impersonation) return { success: true, data: null };
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { name: true, email: true },
    });
    return {
      success: true,
      data: {
        name: user?.name || user?.email || '',
        expiresAt: session.impersonation.expiresAt,
      },
    };
  } catch (error: unknown) {
    return { error: toClientError('Failed to read support access', error, 'read') };
  }
}

/**
 * Back to the administrator's own account.
 *
 * Only from a support session, and only while that administrator still is
 * one: a revoked administrator is signed out instead of signed back in.
 */
export async function stopImpersonation() {
  try {
    const session = await auth();
    const adminId = session?.impersonation?.adminId;
    if (!session?.user?.id || !adminId) return { error: 'admin.impersonate.notActive' };
    if (!(await isPlatformAdmin(adminId))) return { error: 'admin.impersonate.notAllowed' };

    const memberships = await prisma.membership.findMany({
      where: { userId: session.user.id, active: true, role: { in: ['OWNER', 'STAFF'] } },
      select: { restaurantId: true },
    });
    await prisma.auditLog.createMany({
      data: memberships.map((m) => ({
        restaurantId: m.restaurantId,
        action: 'admin.impersonate.stop',
        actorUserId: adminId,
        metadata: { targetUserId: session.user.id },
      })),
    });

    const ticket = await issueTicket(adminId, adminId);
    cookies().delete(ACTIVE_RESTAURANT_COOKIE);
    await signIn('impersonation', { ticket, redirect: false });

    return { success: true, redirectTo: '/admin' };
  } catch (error: unknown) {
    return { error: toClientError('Failed to end support access', error, 'write') };
  }
}
