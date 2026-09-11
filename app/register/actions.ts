'use server';

import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { registerSchema, formatZodError } from '@/lib/validations';
import { toClientError, isUniqueConstraintError } from '@/lib/errors';
import { signIn } from '@/lib/auth-config';

/**
 * Account creation.
 *
 * Identity is local now, so this writes the user, restaurant and membership
 * in one transaction and signs the person straight in. No external service
 * is involved, and nothing can half-succeed.
 */
export async function registerUser(data: {
  name: string;
  email: string;
  password: string;
  restaurantName: string;
}) {
  try {
    const parsed = registerSchema.safeParse(data);
    if (!parsed.success) {
      return { error: formatZodError(parsed.error) };
    }

    const { name, restaurantName } = parsed.data;
    const email = parsed.data.email.trim().toLowerCase();

    const existing = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existing) {
      return { error: 'Este email já está registado. Tenta iniciar sessão.' };
    }

    const passwordHash = await bcrypt.hash(parsed.data.password, 12);

    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 14);

    // One transaction: an account without a restaurant, or a restaurant with
    // no owner, would both be broken states.
    await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { email, name, passwordHash },
      });

      const restaurant = await tx.restaurant.create({
        data: { name: restaurantName, plan: 'TRIAL', trialEndsAt },
      });

      await tx.membership.create({
        data: {
          userId: user.id,
          restaurantId: restaurant.id,
          role: 'OWNER',
          active: true,
        },
      });
    });

    await signIn('credentials', {
      email,
      password: parsed.data.password,
      redirect: false,
    });

    return { success: true, redirectTo: '/dashboard?onboarding=true' };
  } catch (error: unknown) {
    if (isUniqueConstraintError(error, 'email')) {
      return { error: 'Este email já está registado. Tenta iniciar sessão.' };
    }
    return { error: toClientError('Failed to register', error, 'write') };
  }
}
