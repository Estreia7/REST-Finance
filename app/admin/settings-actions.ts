'use server';

import { requireAdmin, isAuthError } from '@/lib/auth-helpers';
import { prisma } from '@/lib/prisma';
import { getSetting, setSetting, deleteSetting, SETTING_KEYS } from '@/lib/settings';
import { maskSecret } from '@/lib/crypto';
import { toClientError } from '@/lib/errors';

/**
 * Platform settings, managed from the admin console.
 *
 * Secrets are never sent back to the browser in full: reads return a masked
 * preview so an administrator can confirm which credential is stored without
 * the value being exposed in a response, a log or a screenshot.
 */

export async function getAuthSettings() {
  try {
    const admin = await requireAdmin();
    if (isAuthError(admin)) return { error: admin.error };

    const [clientId, clientSecret] = await Promise.all([
      getSetting(SETTING_KEYS.googleClientId),
      getSetting(SETTING_KEYS.googleClientSecret),
    ]);

    // Whether the stored value came from the database or the environment,
    // so the UI can say which is in effect.
    const row = await prisma.appSetting.findUnique({
      where: { key: SETTING_KEYS.googleClientId },
      select: { updatedAt: true },
    });

    return {
      success: true,
      data: {
        // The client id is not secret; it appears in the browser during the
        // OAuth redirect anyway.
        googleClientId: clientId ?? '',
        googleClientSecretPreview: clientSecret ? maskSecret(clientSecret) : '',
        configured: Boolean(clientId && clientSecret),
        fromDatabase: Boolean(row),
        updatedAt: row?.updatedAt ?? null,
        // Shown in the UI so the value can be pasted into Google Cloud.
        redirectUri: `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/api/auth/callback/google`,
      },
    };
  } catch (error: unknown) {
    return { error: toClientError('Failed to read auth settings', error, 'read') };
  }
}

export async function saveGoogleCredentials(clientId: string, clientSecret: string) {
  try {
    const admin = await requireAdmin();
    if (isAuthError(admin)) return { error: admin.error };

    const id = clientId.trim();
    const secret = clientSecret.trim();

    if (!id || !secret) {
      return { error: 'Preenche o Client ID e o Client Secret.' };
    }
    if (!id.endsWith('.apps.googleusercontent.com')) {
      return { error: 'O Client ID do Google termina em .apps.googleusercontent.com' };
    }

    await setSetting(SETTING_KEYS.googleClientId, id, admin.userId);
    await setSetting(SETTING_KEYS.googleClientSecret, secret, admin.userId);

    await prisma.auditLog.create({
      data: {
        action: 'admin.settings.google_oauth_updated',
        actorUserId: admin.userId,
        // The credential itself is never written to the audit log.
        metadata: { clientIdSuffix: id.slice(-24) },
      },
    });

    return { success: true };
  } catch (error: unknown) {
    return { error: toClientError('Failed to save Google credentials', error, 'write') };
  }
}

export async function clearGoogleCredentials() {
  try {
    const admin = await requireAdmin();
    if (isAuthError(admin)) return { error: admin.error };

    await deleteSetting(SETTING_KEYS.googleClientId);
    await deleteSetting(SETTING_KEYS.googleClientSecret);

    await prisma.auditLog.create({
      data: {
        action: 'admin.settings.google_oauth_cleared',
        actorUserId: admin.userId,
        metadata: {},
      },
    });

    return { success: true };
  } catch (error: unknown) {
    return { error: toClientError('Failed to clear Google credentials', error, 'delete') };
  }
}
