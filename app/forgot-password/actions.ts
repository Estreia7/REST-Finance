'use server';

import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { toClientError } from '@/lib/errors';
import { MIN_PASSWORD_LENGTH } from '@/lib/validations';

/**
 * Starts a password reset.
 *
 * Always reports success, whether or not the address is registered, so the
 * form cannot be used to discover which emails have accounts.
 */
export async function requestPasswordReset(email: string) {
  try {
    const normalised = email.trim().toLowerCase();

    const user = await prisma.user.findUnique({
      where: { email: normalised },
      select: { id: true },
    });

    if (user) {
      const token = randomUUID();
      const expires = new Date(Date.now() + 60 * 60 * 1000); // one hour

      // Only the most recent link stays valid.
      await prisma.verificationToken.deleteMany({ where: { identifier: normalised } });
      await prisma.verificationToken.create({
        data: { identifier: normalised, token, expires },
      });

      // No mail provider is configured yet. Until one is, the link is logged
      // server-side so an administrator can pass it on.
      const base = process.env.NEXT_PUBLIC_APP_URL ?? '';
      console.info(`[password-reset] ${normalised}: ${base}/reset-password?token=${token}`);
    }

    return { success: true };
  } catch (error: unknown) {
    return { error: toClientError('Failed to start password reset', error, 'write') };
  }
}

/** Completes a reset. The token is single use and expires after an hour. */
export async function resetPasswordWithToken(token: string, newPassword: string) {
  const bcrypt = await import('bcryptjs');

  try {
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      return { error: 'register.errors.passwordTooShort' };
    }

    const record = await prisma.verificationToken.findUnique({ where: { token } });
    if (!record || record.expires < new Date()) {
      return { error: 'Este link expirou ou já foi usado. Pede um novo.' };
    }

    const user = await prisma.user.findUnique({
      where: { email: record.identifier },
      select: { id: true },
    });
    if (!user) return { error: 'Este link expirou ou já foi usado. Pede um novo.' };

    const passwordHash = await bcrypt.default.hash(newPassword, 12);

    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
      prisma.verificationToken.delete({ where: { token } }),
      // Any session opened with the old password is ended.
      prisma.session.deleteMany({ where: { userId: user.id } }),
    ]);

    return { success: true };
  } catch (error: unknown) {
    return { error: toClientError('Failed to reset password', error, 'write') };
  }
}
