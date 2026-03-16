'use server';

import { prisma } from '@/lib/prisma';
import { createClient } from '@/lib/supabase/server';

export async function checkUserRole(userId: string) {
  try {
    // Verify the caller is authenticated and is the same user
    const supabase = await createClient();
    const { data: { user: sessionUser }, error } = await supabase.auth.getUser();
    if (error || !sessionUser || sessionUser.id !== userId) {
      return { isAdmin: false };
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        memberships: {
          where: {
            role: 'PLATFORM_ADMIN',
            active: true,
          },
        },
      },
    });

    if (user && user.memberships.length > 0) {
      return { isAdmin: true };
    }

    return { isAdmin: false };
  } catch (error: any) {
    console.error('Error checking user role:', error);
    return { isAdmin: false };
  }
}

export async function getCurrentUserRole() {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
      return { isAdmin: false };
    }

    return await checkUserRole(user.id);
  } catch (error: any) {
    console.error('Error getting current user role:', error);
    return { isAdmin: false };
  }
}

export async function checkEmailConfirmation() {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
      return { isConfirmed: false };
    }

    return { isConfirmed: user.email_confirmed_at !== null };
  } catch (error: any) {
    console.error('Error checking email confirmation:', error);
    return { isConfirmed: false };
  }
}

export async function resendConfirmationEmail() {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
      return { error: 'User not found' };
    }

    if (user.email_confirmed_at) {
      return { success: true, message: 'Email already confirmed' };
    }

    const { error: resendError } = await supabase.auth.resend({
      type: 'signup',
      email: user.email!,
    });

    if (resendError) {
      return { error: resendError.message };
    }

    return { success: true, message: 'Confirmation email sent' };
  } catch (error: any) {
    console.error('Error resending confirmation email:', error);
    return { error: error.message || 'Failed to resend confirmation email' };
  }
}

export async function loginWithPassword(email: string, password: string) {
  try {
    const supabase = await createClient();

    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (data?.user && !signInError) {
      return { success: true, user: data.user, session: data.session };
    }

    // If email is not confirmed, tell the user to check their inbox
    if (signInError?.message?.toLowerCase().includes('email') ||
        signInError?.message?.toLowerCase().includes('confirm') ||
        signInError?.message?.toLowerCase().includes('not confirmed')) {
      return {
        success: false,
        error: 'Por favor confirme o seu email antes de entrar. Verifique a sua caixa de entrada.'
      };
    }

    return {
      success: false,
      error: signInError?.message || 'Falha ao iniciar sessao'
    };
  } catch (error: any) {
    console.error('Error in loginWithPassword:', error);
    return {
      success: false,
      error: 'Falha ao iniciar sessao'
    };
  }
}
