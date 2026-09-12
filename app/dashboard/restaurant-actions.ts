'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireAuth, isAuthError } from '@/lib/auth-helpers';
import { toClientError } from '@/lib/errors';
import { ACTIVE_RESTAURANT_COOKIE, readActiveRestaurantCookie, resolveActiveRestaurant } from '@/lib/active-restaurant';

/**
 * The restaurants a person belongs to, and switching between them.
 *
 * An owner with two houses was previously pinned to whichever row came first.
 * Now the choice is explicit and lives in a cookie, validated against their
 * memberships on every request by the auth helpers.
 */

export async function getMyRestaurants() {
  try {
    const authResult = await requireAuth();
    if (isAuthError(authResult)) return { error: authResult.error };

    const memberships = await prisma.membership.findMany({
      where: {
        userId: authResult.userId,
        role: { in: ['OWNER', 'STAFF'] },
        active: true,
      },
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
      select: {
        restaurantId: true,
        role: true,
        restaurant: { select: { name: true, logoPath: true } },
      },
    });

    // Resolved the same way the auth helpers do it, so the switcher always
    // highlights the restaurant the data on screen actually came from.
    const active = resolveActiveRestaurant(memberships, readActiveRestaurantCookie());

    return {
      success: true,
      data: {
        activeId: active?.restaurantId ?? null,
        restaurants: memberships.map((m) => ({
          id: m.restaurantId,
          name: m.restaurant.name,
          logoPath: m.restaurant.logoPath,
          role: m.role as 'OWNER' | 'STAFF',
        })),
      },
    };
  } catch (error: unknown) {
    return { error: toClientError('Failed to list restaurants', error, 'read') };
  }
}

/**
 * Changes which restaurant the dashboard is about.
 *
 * Membership is checked before the cookie is written, so an id the caller does
 * not hold is refused here rather than being quietly ignored later.
 */
export async function setActiveRestaurant(restaurantId: string) {
  try {
    const authResult = await requireAuth();
    if (isAuthError(authResult)) return { error: authResult.error };

    const membership = await prisma.membership.findFirst({
      where: {
        userId: authResult.userId,
        restaurantId,
        role: { in: ['OWNER', 'STAFF'] },
        active: true,
      },
      select: { id: true },
    });
    if (!membership) return { error: 'Restaurante não encontrado' };

    cookies().set(ACTIVE_RESTAURANT_COOKIE, restaurantId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
    });

    revalidatePath('/dashboard');
    return { success: true };
  } catch (error: unknown) {
    return { error: toClientError('Failed to switch restaurant', error, 'write') };
  }
}
