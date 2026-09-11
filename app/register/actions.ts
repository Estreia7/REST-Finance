'use server';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { prisma } from '@/lib/prisma';
import { registerSchema, formatZodError } from '@/lib/validations';
import { toClientError, isUniqueConstraintError } from '@/lib/errors';

export async function registerUser(data: {
  name: string;
  email: string;
  password: string;
  restaurantName: string;
}) {
  try {
    // Validate input
    const parsed = registerSchema.safeParse(data);
    if (!parsed.success) {
      return { error: formatZodError(parsed.error) };
    }

    const { name, email, password, restaurantName } = parsed.data;

    // 1. Create Supabase auth user
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return { error: 'Configuracao do servidor incompleta. Contacte o suporte.' };
    }

    const supabase = createSupabaseClient(supabaseUrl, supabaseAnonKey);

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name },
      },
    });

    if (authError) {
      return { error: authError.message };
    }

    if (!authData.user) {
      return { error: 'Falha ao criar conta de utilizador' };
    }

    // 2. Create User, Restaurant, and Membership in a transaction
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 14);

    await prisma.$transaction(async (tx) => {
      // Check if user already exists in DB
      const existingUser = await tx.user.findUnique({
        where: { id: authData.user!.id },
        include: {
          memberships: {
            where: { role: 'OWNER', active: true },
          },
        },
      });

      if (existingUser && existingUser.memberships.length > 0) {
        throw new Error('Voce ja possui um restaurante. Cada conta so pode ter um restaurante.');
      }

      // Create or use existing user record
      const user = existingUser || await tx.user.create({
        data: {
          id: authData.user!.id,
          email,
          name,
        },
      });

      // Create restaurant with trial plan
      const restaurant = await tx.restaurant.create({
        data: {
          name: restaurantName,
          plan: 'TRIAL',
          trialEndsAt,
        },
      });

      // Create membership
      await tx.membership.create({
        data: {
          restaurantId: restaurant.id,
          userId: user.id,
          role: 'OWNER',
          active: true,
        },
      });
    });

    return { success: true, userId: authData.user.id };
  } catch (error: unknown) {
    if (isUniqueConstraintError(error, 'email')) {
      return { error: 'Este email já está registado. Tente fazer login.' };
    }
    return { error: toClientError('Erro ao criar conta. Tente novamente.', error, 'generic') };
  }
}
