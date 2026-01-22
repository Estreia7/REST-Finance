'use server';

import { prisma } from '@/lib/prisma';
import { createClient } from '@/lib/supabase/server';

export async function checkUserRole(userId: string) {
  try {
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

export async function autoConfirmEmail(email: string) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return { success: false, error: 'Service role key not configured' };
    }

    const { createClient: createSupabaseClient } = await import('@supabase/supabase-js');
    const supabaseAdmin = createSupabaseClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // Get user by email
    const { data: usersData, error: listError } = await supabaseAdmin.auth.admin.listUsers();
    
    if (listError || !usersData?.users) {
      return { success: false, error: 'Failed to find user' };
    }

    const userToConfirm = usersData.users.find(u => u.email?.toLowerCase() === email.toLowerCase());
    
    if (!userToConfirm) {
      return { success: false, error: 'User not found' };
    }

    if (userToConfirm.email_confirmed_at) {
      return { success: true, message: 'Email already confirmed' };
    }

    // Confirm email using admin API
    const { data: updatedUser, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userToConfirm.id, {
      email_confirm: true,
    });

    if (updateError) {
      return { success: false, error: updateError.message };
    }

    return { success: true, message: 'Email confirmed successfully' };
  } catch (error: any) {
    console.error('Error auto-confirming email:', error);
    return { success: false, error: error.message || 'Failed to confirm email' };
  }
}

export async function loginWithPassword(email: string, password: string) {
  try {
    const supabase = await createClient();
    
    // Try normal login first
    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    // If login succeeds, return success
    if (data?.user && !signInError) {
      return { success: true, user: data.user, session: data.session };
    }

    // If error is about email confirmation, auto-confirm email and return flag to retry
    if (signInError?.message?.toLowerCase().includes('email') || 
        signInError?.message?.toLowerCase().includes('confirm') ||
        signInError?.message?.toLowerCase().includes('not confirmed')) {
      
      // Auto-confirm email using service role
      const confirmResult = await autoConfirmEmail(email);
      
      if (confirmResult.success) {
        // Return a flag indicating email was confirmed, client should retry login
        return { 
          success: false, 
          error: 'EMAIL_CONFIRMED_RETRY',
          message: 'Email confirmed. Please try logging in again.' 
        };
      }
    }

    // If all else fails, return the original error
    return { 
      success: false, 
      error: signInError?.message || 'Failed to login' 
    };
  } catch (error: any) {
    console.error('Error in loginWithPassword:', error);
    return { 
      success: false, 
      error: error.message || 'Failed to login' 
    };
  }
}
