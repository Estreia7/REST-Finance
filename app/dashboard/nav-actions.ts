'use server';

import { prisma } from '@/lib/prisma';
import { requireAuth, isAuthError, refuseWhileImpersonating } from '@/lib/auth-helpers';
import { toClientError } from '@/lib/errors';
import { isDockTheme, isNavMode, type DockTheme, type NavMode } from '@/lib/nav-preferences';

/**
 * Saves how this person likes the desktop navigation. On the account rather
 * than in the browser, so it follows them to another computer; and refused
 * during support access, because it is theirs and not the restaurant's.
 */
export async function saveNavPreferences(input: { navMode?: NavMode; dockTheme?: DockTheme }) {
  try {
    const auth = await requireAuth();
    if (isAuthError(auth)) return { success: false as const, error: auth.error };
    const refused = refuseWhileImpersonating(auth);
    if (refused) return refused;

    const { navMode, dockTheme } = input;
    if (navMode !== undefined && !isNavMode(navMode)) return { success: false as const, error: 'errors.write' };
    if (dockTheme !== undefined && !isDockTheme(dockTheme)) return { success: false as const, error: 'errors.write' };

    await prisma.user.update({ where: { id: auth.userId }, data: { navMode, dockTheme } });
    return { success: true as const };
  } catch (error: unknown) {
    return { success: false as const, error: toClientError('Failed to save the navigation', error, 'write') };
  }
}
