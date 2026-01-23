'use server';

import { prisma } from '@/lib/prisma';
import { createClient } from '@/lib/supabase/server';
// Keep these in sync with the Prisma enums in schema.prisma
type CostType = 'COGS' | 'OPEX';
type CategoryType = 'REVENUE' | 'COGS' | 'OPEX';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

export async function getRestaurant() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return { error: 'Unauthorized' };
    }

    const membership = await prisma.membership.findFirst({
      where: {
        userId: user.id,
        role: 'OWNER',
        active: true,
      },
      include: {
        restaurant: {
          include: {
            categories: {
              where: { isActive: true },
              orderBy: { sortOrder: 'asc' },
            },
          },
        },
      },
    });

    if (!membership || !membership.restaurant) {
      return { error: 'Restaurant not found' };
    }

    return { success: true, data: membership.restaurant };
  } catch (error: any) {
    console.error('Error fetching restaurant:', error);
    return { error: error.message || 'Failed to fetch restaurant' };
  }
}

export async function getStaff() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return { error: 'Unauthorized' };
    }

    const ownerMembership = await prisma.membership.findFirst({
      where: {
        userId: user.id,
        role: 'OWNER',
        active: true,
      },
    });

    if (!ownerMembership) {
      return { error: 'Not an owner' };
    }

    const staff = await prisma.membership.findMany({
      where: {
        restaurantId: ownerMembership.restaurantId,
        role: 'STAFF',
        active: true,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    });

    return { success: true, data: staff };
  } catch (error: any) {
    console.error('Error fetching staff:', error);
    return { error: error.message || 'Failed to fetch staff' };
  }
}

export async function addStaff(email: string) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return { error: 'Unauthorized' };
    }

    const ownerMembership = await prisma.membership.findFirst({
      where: {
        userId: user.id,
        role: 'OWNER',
        active: true,
      },
    });

    if (!ownerMembership) {
      return { error: 'Not an owner' };
    }

    // Find or create user
    let staffUser = await prisma.user.findUnique({
      where: { email },
    });

    if (!staffUser) {
      // User doesn't exist, we need to create them in Supabase first
      // For now, return error - they need to register first
      return { error: 'User not found. Please ask them to register first.' };
    }

    // Check if membership already exists
    const existingMembership = await prisma.membership.findUnique({
      where: {
        restaurantId_userId: {
          restaurantId: ownerMembership.restaurantId,
          userId: staffUser.id,
        },
      },
    });

    if (existingMembership) {
      if (existingMembership.active) {
        return { error: 'User is already a staff member' };
      } else {
        // Reactivate membership
        await prisma.membership.update({
          where: { id: existingMembership.id },
          data: { active: true },
        });
        return { success: true };
      }
    }

    // Create new membership
    await prisma.membership.create({
      data: {
        restaurantId: ownerMembership.restaurantId,
        userId: staffUser.id,
        role: 'STAFF',
        active: true,
      },
    });

    return { success: true };
  } catch (error: any) {
    console.error('Error adding staff:', error);
    return { error: error.message || 'Failed to add staff' };
  }
}

export async function createDailySummary(data: {
  date: Date;
  dineInRevenue: number;
  takeawayRevenue: number;
  dineInTickets: number;
  takeawayTickets: number;
  notes?: string;
}) {
  try {
    const supabase = await createClient();
    
    // Try to get session first
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError) {
      console.error('Session error in createDailySummary:', sessionError);
    }
    
    // Then get user
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      console.error('Authentication error in createDailySummary:', {
        authError,
        hasSession: !!session,
        sessionError
      });
      return { 
        error: 'Sessão expirada. Por favor, faça login novamente.',
        requiresAuth: true 
      };
    }

    const ownerMembership = await prisma.membership.findFirst({
      where: {
        userId: user.id,
        role: 'OWNER',
        active: true,
      },
    });

    if (!ownerMembership) {
      return { error: 'Not an owner' };
    }

    const revenueTotal = data.dineInRevenue + data.takeawayRevenue;

    const summary = await prisma.dailySummary.upsert({
      where: {
        restaurantId_date: {
          restaurantId: ownerMembership.restaurantId,
          date: data.date,
        },
      },
      update: {
        dineInRevenue: data.dineInRevenue,
        takeawayRevenue: data.takeawayRevenue,
        revenueTotal,
        dineInTickets: data.dineInTickets,
        takeawayTickets: data.takeawayTickets,
        notes: data.notes,
        createdById: user.id,
      },
      create: {
        restaurantId: ownerMembership.restaurantId,
        date: data.date,
        dineInRevenue: data.dineInRevenue,
        takeawayRevenue: data.takeawayRevenue,
        revenueTotal,
        dineInTickets: data.dineInTickets,
        takeawayTickets: data.takeawayTickets,
        notes: data.notes,
        createdById: user.id,
      },
    });

    return { success: true, data: summary };
  } catch (error: any) {
    console.error('Error creating daily summary:', error);
    return { error: error.message || 'Failed to create daily summary' };
  }
}

export async function createCostEntry(data: {
  date: Date;
  type: CostType;
  categoryId?: string;
  amount: number;
  description?: string;
}) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return { error: 'Unauthorized' };
    }

    const ownerMembership = await prisma.membership.findFirst({
      where: {
        userId: user.id,
        role: 'OWNER',
        active: true,
      },
    });

    if (!ownerMembership) {
      return { error: 'Not an owner' };
    }

    const costEntry = await prisma.costEntry.create({
      data: {
        restaurantId: ownerMembership.restaurantId,
        date: data.date,
        type: data.type,
        categoryId: data.categoryId || null,
        amount: data.amount,
        description: data.description,
        createdById: user.id,
      },
    });

    return { success: true, data: costEntry };
  } catch (error: any) {
    console.error('Error creating cost entry:', error);
    return { error: error.message || 'Failed to create cost entry' };
  }
}

export async function initializeDefaultCategories(restaurantId: string) {
  try {
    // Check if categories already exist
    const existingCategories = await prisma.category.findMany({
      where: { restaurantId },
    });

    if (existingCategories.length > 0) {
      return { success: true, message: 'Categories already exist' };
    }

    // Default COGS categories
    const cogsCategories = [
      { name: 'Comida', sortOrder: 1 },
      { name: 'Bebidas', sortOrder: 2 },
      { name: 'Sobremesas', sortOrder: 3 },
      { name: 'Consumíveis Diretos', sortOrder: 4 },
      { name: 'Outro', sortOrder: 5 },
      { name: 'Diversos', sortOrder: 6 },
    ];

    // Default OPEX categories
    const opexCategories = [
      { name: 'Renda', sortOrder: 1 },
      { name: 'Internet + TV', sortOrder: 2 },
      { name: 'Água', sortOrder: 3 },
      { name: 'Luz', sortOrder: 4 },
      { name: 'Gás', sortOrder: 5 },
      { name: 'Manutenção', sortOrder: 6 },
      { name: 'Material Cozinha', sortOrder: 7 },
      { name: 'Marketing', sortOrder: 8 },
      { name: 'POS Sistema', sortOrder: 9 },
      { name: 'Bank fees', sortOrder: 10 },
      { name: 'Seguros', sortOrder: 11 },
      { name: 'Licenças TV+Musica', sortOrder: 12 },
      { name: 'Segurança Social', sortOrder: 13 },
      { name: 'Ordenado 1', sortOrder: 14 },
      { name: 'Limpeza/Higiene', sortOrder: 15 },
      { name: 'Outros', sortOrder: 16 },
    ];

    // Create COGS categories
    for (const cat of cogsCategories) {
      await prisma.category.create({
        data: {
          restaurantId,
          type: 'COGS',
          name: cat.name,
          sortOrder: cat.sortOrder,
          isActive: true,
        },
      });
    }

    // Create OPEX categories
    for (const cat of opexCategories) {
      await prisma.category.create({
        data: {
          restaurantId,
          type: 'OPEX',
          name: cat.name,
          sortOrder: cat.sortOrder,
          isActive: true,
        },
      });
    }

    return { success: true, message: 'Default categories created' };
  } catch (error: any) {
    console.error('Error initializing categories:', error);
    return { error: error.message || 'Failed to initialize categories' };
  }
}

export async function getCategories(type?: CategoryType) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return { error: 'Unauthorized' };
    }

    const ownerMembership = await prisma.membership.findFirst({
      where: {
        userId: user.id,
        role: 'OWNER',
        active: true,
      },
    });

    if (!ownerMembership) {
      return { error: 'Not an owner' };
    }

    // Initialize default categories if none exist
    const existingCategories = await prisma.category.findMany({
      where: { restaurantId: ownerMembership.restaurantId },
    });

    if (existingCategories.length === 0) {
      await initializeDefaultCategories(ownerMembership.restaurantId);
    }

    const where: any = {
      restaurantId: ownerMembership.restaurantId,
      isActive: true,
    };

    if (type) {
      where.type = type;
    }

    const categories = await prisma.category.findMany({
      where,
      orderBy: { sortOrder: 'asc' },
    });

    return { success: true, data: categories };
  } catch (error: any) {
    console.error('Error fetching categories:', error);
    return { error: error.message || 'Failed to fetch categories' };
  }
}

export async function getDashboardStats() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return { error: 'Unauthorized' };
    }

    const ownerMembership = await prisma.membership.findFirst({
      where: {
        userId: user.id,
        role: 'OWNER',
        active: true,
      },
    });

    if (!ownerMembership) {
      return { error: 'Not an owner' };
    }

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const [monthlyRevenue, monthlyCosts, staffCount] = await Promise.all([
      prisma.dailySummary.aggregate({
        where: {
          restaurantId: ownerMembership.restaurantId,
          date: {
            gte: startOfMonth,
            lte: endOfMonth,
          },
        },
        _sum: {
          revenueTotal: true,
        },
      }),
      prisma.costEntry.aggregate({
        where: {
          restaurantId: ownerMembership.restaurantId,
          date: {
            gte: startOfMonth,
            lte: endOfMonth,
          },
        },
        _sum: {
          amount: true,
        },
      }),
      prisma.membership.count({
        where: {
          restaurantId: ownerMembership.restaurantId,
          role: 'STAFF',
          active: true,
        },
      }),
    ]);

    const revenue = Number(monthlyRevenue._sum.revenueTotal || 0);
    const costs = Number(monthlyCosts._sum.amount || 0);
    const profit = revenue - costs;
    const profitMargin = revenue > 0 ? (profit / revenue) * 100 : 0;

    return {
      success: true,
      data: {
        revenue,
        costs,
        profit,
        profitMargin,
        staffCount,
      },
    };
  } catch (error: any) {
    console.error('Error fetching dashboard stats:', error);
    return { error: error.message || 'Failed to fetch dashboard stats' };
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
