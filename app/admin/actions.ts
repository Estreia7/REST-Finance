'use server';

import { prisma } from '@/lib/prisma';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

// Keep this in sync with the Prisma enum `Plan` in schema.prisma
type Plan = 'TRIAL' | 'MONTHLY' | 'YEARLY';

export async function getClients() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return { error: 'Unauthorized' };
    }

    // Check if user is platform admin
    const userRecord = await prisma.user.findUnique({
      where: { id: user.id },
      include: {
        memberships: {
          where: { 
            role: 'PLATFORM_ADMIN',
            active: true,
          },
        },
      },
    });

    if (!userRecord || userRecord.memberships.length === 0) {
      return { error: 'Unauthorized - Admin access required' };
    }

    const restaurants = await prisma.restaurant.findMany({
      include: {
        memberships: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                name: true,
              },
            },
          },
          where: {
            role: 'OWNER',
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return { success: true, data: restaurants };
  } catch (error: any) {
    console.error('Error fetching clients:', error);
    return { error: error.message || 'Failed to fetch clients' };
  }
}

export async function updateClient(data: {
  restaurantId: string;
  name?: string;
  plan?: Plan;
  trialEndsAt?: Date | null;
}) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return { error: 'Unauthorized' };
    }

    // Check if user is platform admin
    const userRecord = await prisma.user.findUnique({
      where: { id: user.id },
      include: {
        memberships: {
          where: { 
            role: 'PLATFORM_ADMIN',
            active: true,
          },
        },
      },
    });

    if (!userRecord || userRecord.memberships.length === 0) {
      return { error: 'Unauthorized - Admin access required' };
    }

    const updateData: any = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.plan !== undefined) updateData.plan = data.plan;
    if (data.trialEndsAt !== undefined) updateData.trialEndsAt = data.trialEndsAt;

    const restaurant = await prisma.restaurant.update({
      where: { id: data.restaurantId },
      data: updateData,
      include: {
        memberships: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                name: true,
              },
            },
          },
          where: {
            role: 'OWNER',
          },
        },
      },
    });

    return { success: true, data: restaurant };
  } catch (error: any) {
    console.error('Error updating client:', error);
    return { error: error.message || 'Failed to update client' };
  }
}

export async function getClientStats() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return { error: 'Unauthorized' };
    }

    // Check if user is platform admin
    const userRecord = await prisma.user.findUnique({
      where: { id: user.id },
      include: {
        memberships: {
          where: { 
            role: 'PLATFORM_ADMIN',
            active: true,
          },
        },
      },
    });

    if (!userRecord || userRecord.memberships.length === 0) {
      return { error: 'Unauthorized - Admin access required' };
    }

    const [trial, monthly, yearly, total] = await Promise.all([
      prisma.restaurant.count({ where: { plan: 'TRIAL' } }),
      prisma.restaurant.count({ where: { plan: 'MONTHLY' } }),
      prisma.restaurant.count({ where: { plan: 'YEARLY' } }),
      prisma.restaurant.count(),
    ]);

    return {
      success: true,
      data: {
        trial,
        monthly,
        yearly,
        total,
      },
    };
  } catch (error: any) {
    console.error('Error fetching stats:', error);
    return { error: error.message || 'Failed to fetch stats' };
  }
}

export async function getMonthlyRevenue(year: number) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return { error: 'Unauthorized' };
    }

    // Check if user is platform admin
    const userRecord = await prisma.user.findUnique({
      where: { id: user.id },
      include: {
        memberships: {
          where: { 
            role: 'PLATFORM_ADMIN',
            active: true,
          },
        },
      },
    });

    if (!userRecord || userRecord.memberships.length === 0) {
      return { error: 'Unauthorized - Admin access required' };
    }

    // Get all restaurants that were active during the year
    const restaurants = await prisma.restaurant.findMany({
      where: {
        OR: [
          {
            createdAt: {
              lte: new Date(year, 11, 31),
            },
          },
          {
            trialEndsAt: {
              gte: new Date(year, 0, 1),
            },
          },
        ],
      },
      select: {
        plan: true,
        createdAt: true,
        trialEndsAt: true,
      },
    });

    // Calculate monthly revenue based on plans
    // Assuming: TRIAL = €0, MONTHLY = €29/month, YEARLY = €290/year (€24.17/month)
    const monthlyRevenue: { [key: number]: number } = {};
    for (let month = 0; month < 12; month++) {
      monthlyRevenue[month] = 0;
    }

    restaurants.forEach((restaurant: { plan: Plan; createdAt: Date; trialEndsAt: Date | null }) => {
      const createdDate = new Date(restaurant.createdAt);
      const createdYear = createdDate.getFullYear();
      const createdMonth = createdDate.getMonth();
      
      // Determine start month (when restaurant was created or year start, whichever is later)
      const startMonth = createdYear === year ? createdMonth : 0;
      
      // Determine end month (end of year or when trial ends, whichever is earlier)
      let endMonth = 11;
      if (restaurant.trialEndsAt) {
        const trialEnd = new Date(restaurant.trialEndsAt);
        if (trialEnd.getFullYear() === year) {
          endMonth = Math.min(trialEnd.getMonth(), 11);
        } else if (trialEnd.getFullYear() < year) {
          // Trial ended before this year, skip
          return;
        }
      }
      
      if (restaurant.plan === 'MONTHLY') {
        // €29 per month for active months
        for (let month = startMonth; month <= endMonth; month++) {
          monthlyRevenue[month] += 29;
        }
      } else if (restaurant.plan === 'YEARLY') {
        // Yearly plan: €290 per year, prorated monthly
        const monthlyAmount = 290 / 12; // ~€24.17 per month
        for (let month = startMonth; month <= endMonth; month++) {
          monthlyRevenue[month] += monthlyAmount;
        }
      }
      // TRIAL = €0, so we don't add anything
    });

    // Convert to array format for chart
    const chartData = Object.keys(monthlyRevenue).map((month) => ({
      month: parseInt(month),
      revenue: Math.round(monthlyRevenue[parseInt(month)] * 100) / 100,
    }));

    return { success: true, data: chartData };
  } catch (error: any) {
    console.error('Error fetching monthly revenue:', error);
    return { error: error.message || 'Failed to fetch monthly revenue' };
  }
}

export async function getAllUsers() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return { error: 'Unauthorized' };
    }

    // Check if user is platform admin
    const userRecord = await prisma.user.findUnique({
      where: { id: user.id },
      include: {
        memberships: {
          where: { 
            role: 'PLATFORM_ADMIN',
            active: true,
          },
        },
      },
    });

    if (!userRecord || userRecord.memberships.length === 0) {
      return { error: 'Unauthorized - Admin access required' };
    }

    const users = await prisma.user.findMany({
      include: {
        memberships: {
          include: {
            restaurant: {
              select: {
                id: true,
                name: true,
                plan: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return { success: true, data: users };
  } catch (error: any) {
    console.error('Error fetching users:', error);
    return { error: error.message || 'Failed to fetch users' };
  }
}

export async function updateUser(data: {
  userId: string;
  name?: string;
  email?: string;
  role?: 'OWNER' | 'STAFF' | 'PLATFORM_ADMIN';
  membershipId?: string | null;
}) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return { error: 'Unauthorized' };
    }

    // Check if user is platform admin
    const userRecord = await prisma.user.findUnique({
      where: { id: user.id },
      include: {
        memberships: {
          where: { 
            role: 'PLATFORM_ADMIN',
            active: true,
          },
        },
      },
    });

    if (!userRecord || userRecord.memberships.length === 0) {
      return { error: 'Unauthorized - Admin access required' };
    }

    // Update user data
    const updateData: any = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.email !== undefined) updateData.email = data.email;

    const updatedUser = await prisma.user.update({
      where: { id: data.userId },
      data: updateData,
    });

    // Update membership role if provided
    if (data.role && data.membershipId) {
      await prisma.membership.update({
        where: { id: data.membershipId },
        data: { role: data.role },
      });
    }

    return { success: true, data: updatedUser };
  } catch (error: any) {
    console.error('Error updating user:', error);
    return { error: error.message || 'Failed to update user' };
  }
}

export async function sendPasswordReset(email: string) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return { error: 'Unauthorized' };
    }

    // Check if user is platform admin
    const userRecord = await prisma.user.findUnique({
      where: { id: user.id },
      include: {
        memberships: {
          where: { 
            role: 'PLATFORM_ADMIN',
            active: true,
          },
        },
      },
    });

    if (!userRecord || userRecord.memberships.length === 0) {
      return { error: 'Unauthorized - Admin access required' };
    }

    // Use Supabase to send password reset
    // This will work with the anon key for password resets
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/forgot-password`,
    });

    if (resetError) {
      return { error: resetError.message };
    }

    return { success: true };
  } catch (error: any) {
    console.error('Error sending password reset:', error);
    return { error: error.message || 'Failed to send password reset' };
  }
}

export async function createAccount(data: {
  name: string;
  email: string;
  password: string;
  restaurantName: string;
  plan: Plan;
  trialEndsAt?: Date | null;
}) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return { error: 'Unauthorized' };
    }

    // Check if user is platform admin
    const userRecord = await prisma.user.findUnique({
      where: { id: user.id },
      include: {
        memberships: {
          where: { 
            role: 'PLATFORM_ADMIN',
            active: true,
          },
        },
      },
    });

    if (!userRecord || userRecord.memberships.length === 0) {
      return { error: 'Unauthorized - Admin access required' };
    }

    // Create Supabase auth user using service role key
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return { error: 'Server configuration incomplete - Service role key required' };
    }

    const supabaseAdmin = createSupabaseClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
    
    // Use admin API to create user (bypasses email confirmation)
    const { data: authData, error: signUpError } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: {
        name: data.name,
      },
    });

    if (signUpError) {
      return { error: signUpError.message };
    }

    if (!authData.user) {
      return { error: 'Failed to create user account' };
    }

    // Check if user already exists in database
    const existingUser = await prisma.user.findUnique({
      where: { id: authData.user.id },
      include: {
        memberships: {
          where: {
            role: 'OWNER',
            active: true,
          },
        },
      },
    });

    if (existingUser && existingUser.memberships.length > 0) {
      return { error: 'User already has a restaurant' };
    }

    // Create User record in database
    const dbUser = existingUser || await prisma.user.create({
      data: {
        id: authData.user.id,
        email: data.email,
        name: data.name,
      },
    });

    // Create Restaurant
    const restaurant = await prisma.restaurant.create({
      data: {
        name: data.restaurantName,
        plan: data.plan,
        trialEndsAt: data.trialEndsAt || (data.plan === 'TRIAL' ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) : null),
      },
    });

    // Create Membership with OWNER role
    await prisma.membership.create({
      data: {
        restaurantId: restaurant.id,
        userId: dbUser.id,
        role: 'OWNER',
        active: true,
      },
    });

    return { success: true, userId: dbUser.id, restaurantId: restaurant.id };
  } catch (error: any) {
    console.error('Error creating account:', error);
    
    if (error.code === 'P2002') {
      if (error.meta?.target?.includes('email')) {
        return { error: 'Email already registered' };
      }
    }

    return { error: error.message || 'Failed to create account' };
  }
}

export async function deleteAccount(userId: string) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return { error: 'Unauthorized' };
    }

    // Check if user is platform admin
    const userRecord = await prisma.user.findUnique({
      where: { id: user.id },
      include: {
        memberships: {
          where: { 
            role: 'PLATFORM_ADMIN',
            active: true,
          },
        },
      },
    });

    if (!userRecord || userRecord.memberships.length === 0) {
      return { error: 'Unauthorized - Admin access required' };
    }

    // Prevent deleting yourself
    if (userId === user.id) {
      return { error: 'Cannot delete your own account' };
    }

    // Get user's restaurants
    const userToDelete = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        memberships: {
          include: {
            restaurant: true,
          },
        },
      },
    });

    if (!userToDelete) {
      return { error: 'User not found' };
    }

    // Delete all memberships (this will cascade delete related data if configured)
    // Delete restaurants owned by this user
    const ownerMemberships = userToDelete.memberships.filter(m => m.role === 'OWNER');
    for (const membership of ownerMemberships) {
      await prisma.restaurant.delete({
        where: { id: membership.restaurantId },
      });
    }

    // Delete user record (memberships will be deleted by cascade or manually)
    await prisma.user.delete({
      where: { id: userId },
    });

    // Delete from Supabase auth (using service role key)
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (supabaseUrl && supabaseServiceRoleKey) {
        const supabaseAdmin = createSupabaseClient(supabaseUrl, supabaseServiceRoleKey, {
          auth: {
            autoRefreshToken: false,
            persistSession: false
          }
        });
        await supabaseAdmin.auth.admin.deleteUser(userId);
      }
    } catch (deleteAuthError) {
      console.warn('Could not delete user from Supabase auth:', deleteAuthError);
      // Continue even if auth deletion fails
    }

    return { success: true };
  } catch (error: any) {
    console.error('Error deleting account:', error);
    return { error: error.message || 'Failed to delete account' };
  }
}

export async function changeUserPassword(userId: string, newPassword: string) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return { error: 'Unauthorized' };
    }

    // Check if user is platform admin
    const userRecord = await prisma.user.findUnique({
      where: { id: user.id },
      include: {
        memberships: {
          where: { 
            role: 'PLATFORM_ADMIN',
            active: true,
          },
        },
      },
    });

    if (!userRecord || userRecord.memberships.length === 0) {
      return { error: 'Unauthorized - Admin access required' };
    }

    // Update password using Supabase admin - requires service role key
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return { error: 'Server configuration incomplete - Service role key required' };
    }

    const supabaseAdmin = createSupabaseClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
    
    // Use admin API to update password
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      password: newPassword,
    });

    if (updateError) {
      return { error: updateError.message };
    }

    return { success: true };
  } catch (error: any) {
    console.error('Error changing password:', error);
    return { error: error.message || 'Failed to change password' };
  }
}

export async function getCurrentUser() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return { error: 'Unauthorized' };
    }

    const userRecord = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        email: true,
        name: true,
      },
    });

    if (!userRecord) {
      return { error: 'User not found' };
    }

    return { success: true, data: userRecord };
  } catch (error: any) {
    console.error('Error fetching current user:', error);
    return { error: error.message || 'Failed to fetch user' };
  }
}
