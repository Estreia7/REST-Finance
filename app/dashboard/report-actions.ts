'use server';

import { prisma } from '@/lib/prisma';
import { requireAuth, refuseWhileImpersonating, isAuthError } from '@/lib/auth-helpers';
import { toClientError } from '@/lib/errors';
import { isMailConfigured } from '@/lib/mailer';

/**
 * The weekly email report, switched on or off by the person, not the
 * restaurant: it goes to their inbox. Personal, so refused while an
 * administrator is signed in as them.
 */

type Prefs = { weeklyReport?: boolean };

export async function getWeeklyReportPref() {
  try {
    const auth = await requireAuth();
    if (isAuthError(auth)) return { success: false as const, error: auth.error };
    const user = await prisma.user.findUnique({ where: { id: auth.userId }, select: { notificationPrefs: true } });
    const prefs = (user?.notificationPrefs ?? {}) as Prefs;
    return { success: true as const, data: { on: prefs.weeklyReport === true, mailReady: isMailConfigured() } };
  } catch (error: unknown) {
    return { success: false as const, error: toClientError('Failed to read the report setting', error, 'read') };
  }
}

export async function setWeeklyReportPref(on: boolean) {
  try {
    const auth = await requireAuth();
    if (isAuthError(auth)) return { success: false as const, error: auth.error };
    const refused = refuseWhileImpersonating(auth);
    if (refused) return refused;
    const user = await prisma.user.findUnique({ where: { id: auth.userId }, select: { notificationPrefs: true } });
    const prefs = (user?.notificationPrefs ?? {}) as Prefs;
    await prisma.user.update({ where: { id: auth.userId }, data: { notificationPrefs: { ...prefs, weeklyReport: on } } });
    return { success: true as const };
  } catch (error: unknown) {
    return { success: false as const, error: toClientError('Failed to save the report setting', error, 'write') };
  }
}
