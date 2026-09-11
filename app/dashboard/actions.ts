'use server';

import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import {
  dailySummarySchema,
  costEntrySchema,
  dailySummaryUpdateSchema,
  costEntryUpdateSchema,
  changePasswordSchema,
  formatZodError,
} from '@/lib/validations';
import { requireAuth, requireOwner, requireMember, isAuthError } from '@/lib/auth-helpers';
import { calculateKpis, toPercent, safeDivide, percentChange } from '@/lib/kpi';
// Keep these in sync with the Prisma enums in schema.prisma
type CostType = 'COGS' | 'OPEX';
type CategoryType = 'REVENUE' | 'COGS' | 'OPEX';
import { toClientError } from '@/lib/errors';

export async function getRestaurant() {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return { error: owner.error };

    const membership = await prisma.membership.findFirst({
      where: {
        userId: owner.userId,
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
  } catch (error: unknown) {
    return { error: toClientError('Failed to fetch restaurant', error, 'read') };
  }
}

export async function getStaff() {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return { error: owner.error };

    const staff = await prisma.membership.findMany({
      where: {
        restaurantId: owner.restaurantId,
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
  } catch (error: unknown) {
    return { error: toClientError('Failed to fetch staff', error, 'read') };
  }
}

export async function addStaff(email: string) {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return { error: owner.error };

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
          restaurantId: owner.restaurantId,
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
        restaurantId: owner.restaurantId,
        userId: staffUser.id,
        role: 'STAFF',
        active: true,
      },
    });

    return { success: true };
  } catch (error: unknown) {
    return { error: toClientError('Failed to add staff', error, 'write') };
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
    // Validate input
    const parsed = dailySummarySchema.safeParse(data);
    if (!parsed.success) {
      return { success: false as const, error: formatZodError(parsed.error) };
    }

    const owner = await requireOwner();
    if (isAuthError(owner)) return { success: false as const, error: owner.error };

    const revenueTotal = parsed.data.dineInRevenue + parsed.data.takeawayRevenue;

    const v = parsed.data;
    const summary = await prisma.dailySummary.upsert({
      where: {
        restaurantId_date: {
          restaurantId: owner.restaurantId,
          date: v.date,
        },
      },
      update: {
        dineInRevenue: v.dineInRevenue,
        takeawayRevenue: v.takeawayRevenue,
        revenueTotal,
        dineInTickets: v.dineInTickets,
        takeawayTickets: v.takeawayTickets,
        notes: v.notes,
        createdById: owner.userId,
      },
      create: {
        restaurantId: owner.restaurantId,
        date: v.date,
        dineInRevenue: v.dineInRevenue,
        takeawayRevenue: v.takeawayRevenue,
        revenueTotal,
        dineInTickets: v.dineInTickets,
        takeawayTickets: v.takeawayTickets,
        notes: v.notes,
        createdById: owner.userId,
      },
    });

    return { success: true, data: summary };
  } catch (error: unknown) {
    return { success: false as const, error: toClientError('Failed to create daily summary', error, 'write') };
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
    // Validate input
    const parsed = costEntrySchema.safeParse(data);
    if (!parsed.success) {
      return { success: false as const, error: formatZodError(parsed.error) };
    }

    const owner = await requireOwner();
    if (isAuthError(owner)) return { success: false as const, error: owner.error };

    const v = parsed.data;
    const costEntry = await prisma.costEntry.create({
      data: {
        restaurantId: owner.restaurantId,
        date: v.date,
        type: v.type,
        categoryId: v.categoryId || null,
        amount: v.amount,
        description: v.description,
        createdById: owner.userId,
      },
    });

    return { success: true, data: costEntry };
  } catch (error: unknown) {
    return { success: false as const, error: toClientError('Failed to create cost entry', error, 'write') };
  }
}

async function initializeDefaultCategories(restaurantId: string) {
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
  } catch (error: unknown) {
    return { error: toClientError('Failed to initialize categories', error, 'write') };
  }
}

export async function getCategories(type?: CategoryType) {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return { error: owner.error };

    // Initialize default categories if none exist
    const existingCategories = await prisma.category.findMany({
      where: { restaurantId: owner.restaurantId },
    });

    if (existingCategories.length === 0) {
      await initializeDefaultCategories(owner.restaurantId);
    }

    const where: any = {
      restaurantId: owner.restaurantId,
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
  } catch (error: unknown) {
    return { error: toClientError('Failed to fetch categories', error, 'read') };
  }
}

export async function getDashboardStats() {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return { error: owner.error };

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const [monthlyRevenue, monthlyCosts, staffCount] = await Promise.all([
      prisma.dailySummary.aggregate({
        where: {
          restaurantId: owner.restaurantId,
          deletedAt: null,
          date: {
            gte: startOfMonth,
            lte: endOfMonth,
          },
        },
        _sum: {
          revenueTotal: true,
          dineInRevenue: true,
          takeawayRevenue: true,
        },
      }),
      prisma.costEntry.aggregate({
        where: {
          restaurantId: owner.restaurantId,
          deletedAt: null,
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
          restaurantId: owner.restaurantId,
          role: 'STAFF',
          active: true,
        },
      }),
    ]);

    const revenue = Number(monthlyRevenue._sum.revenueTotal || 0);
    const dineInRevenue = Number(monthlyRevenue._sum.dineInRevenue || 0);
    const takeawayRevenue = Number(monthlyRevenue._sum.takeawayRevenue || 0);
    const costs = Number(monthlyCosts._sum.amount || 0);
    const profit = revenue - costs;
    const profitMargin = revenue > 0 ? (profit / revenue) * 100 : 0;

    return {
      success: true,
      data: {
        revenue,
        dineInRevenue,
        takeawayRevenue,
        costs,
        profit,
        profitMargin,
        staffCount,
      },
    };
  } catch (error: unknown) {
    return { error: toClientError('Failed to fetch dashboard stats', error, 'read') };
  }
}

// ─── History Actions ──────────────────────────────────────────────────────

export async function getRevenueHistory(dateFrom: Date, dateTo: Date) {
  try {
    const member = await requireMember();
    if (isAuthError(member)) return { error: member.error };

    const entries = await prisma.dailySummary.findMany({
      where: {
        restaurantId: member.restaurantId,
        deletedAt: null,
        date: { gte: dateFrom, lte: dateTo },
      },
      orderBy: { date: 'desc' },
      include: { createdBy: { select: { name: true, email: true } } },
    });

    const data = entries.map(e => ({
      id: e.id,
      date: e.date,
      dineInRevenue: Number(e.dineInRevenue),
      takeawayRevenue: Number(e.takeawayRevenue),
      revenueTotal: Number(e.revenueTotal),
      dineInTickets: e.dineInTickets,
      takeawayTickets: e.takeawayTickets,
      notes: e.notes,
      createdBy: e.createdBy.name || e.createdBy.email,
    }));

    return { success: true, data };
  } catch (error: unknown) {
    return { error: toClientError('Failed to fetch revenue history', error, 'read') };
  }
}

export async function updateDailySummary(id: string, data: {
  dineInRevenue?: number;
  takeawayRevenue?: number;
  dineInTickets?: number;
  takeawayTickets?: number;
  notes?: string;
}) {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return { error: owner.error };

    // Updates are validated with the same bounds as creation. Without this a
    // negative or absurd revenue could be written through the update path that
    // createDailySummary correctly rejects.
    const parsed = dailySummaryUpdateSchema.safeParse(data);
    if (!parsed.success) return { error: formatZodError(parsed.error) };

    const existing = await prisma.dailySummary.findFirst({
      where: { id, restaurantId: owner.restaurantId, deletedAt: null },
    });
    if (!existing) return { error: 'Entry not found' };

    const dineIn = parsed.data.dineInRevenue ?? Number(existing.dineInRevenue);
    const takeaway = parsed.data.takeawayRevenue ?? Number(existing.takeawayRevenue);

    const updated = await prisma.dailySummary.update({
      where: { id },
      data: {
        dineInRevenue: dineIn,
        takeawayRevenue: takeaway,
        revenueTotal: dineIn + takeaway,
        dineInTickets: parsed.data.dineInTickets ?? existing.dineInTickets,
        takeawayTickets: parsed.data.takeawayTickets ?? existing.takeawayTickets,
        notes: parsed.data.notes ?? existing.notes,
      },
    });

    return { success: true, data: updated };
  } catch (error: unknown) {
    return { error: toClientError('Failed to update entry', error, 'write') };
  }
}

export async function deleteDailySummary(id: string) {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return { success: false as const, error: owner.error };

    const existing = await prisma.dailySummary.findFirst({
      where: { id, restaurantId: owner.restaurantId, deletedAt: null },
    });
    if (!existing) return { success: false as const, error: 'Entry not found' };

    await prisma.dailySummary.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return { success: true as const };
  } catch (error: unknown) {
    return { success: false as const, error: toClientError('Failed to delete entry', error, 'delete') };
  }
}

export async function getCostHistory(dateFrom: Date, dateTo: Date, type?: CostType, categoryId?: string) {
  try {
    const member = await requireMember();
    if (isAuthError(member)) return { error: member.error };

    const where: any = {
      restaurantId: member.restaurantId,
      date: { gte: dateFrom, lte: dateTo },
      deletedAt: null,
    };
    if (type) where.type = type;
    if (categoryId) where.categoryId = categoryId;

    const entries = await prisma.costEntry.findMany({
      where,
      orderBy: { date: 'desc' },
      include: {
        category: { select: { name: true, type: true } },
        createdBy: { select: { name: true, email: true } },
      },
    });

    const data = entries.map(e => ({
      id: e.id,
      date: e.date,
      type: e.type,
      categoryName: e.category?.name || '—',
      categoryType: e.category?.type || e.type,
      amount: Number(e.amount),
      description: e.description,
      createdBy: e.createdBy.name || e.createdBy.email,
    }));

    return { success: true, data };
  } catch (error: unknown) {
    return { error: toClientError('Failed to fetch cost history', error, 'read') };
  }
}

export async function updateCostEntry(id: string, data: {
  amount?: number;
  description?: string;
  categoryId?: string;
  type?: CostType;
  date?: Date;
}) {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return { error: owner.error };

    // Same bounds as creation — see updateDailySummary.
    const parsed = costEntryUpdateSchema.safeParse(data);
    if (!parsed.success) return { error: formatZodError(parsed.error) };

    const existing = await prisma.costEntry.findFirst({
      where: { id, restaurantId: owner.restaurantId, deletedAt: null },
    });
    if (!existing) return { error: 'Entry not found' };

    // A supplied categoryId must belong to this restaurant; otherwise an entry
    // could be reassigned to another tenant's category.
    if (parsed.data.categoryId && parsed.data.categoryId !== existing.categoryId) {
      const category = await prisma.category.findFirst({
        where: { id: parsed.data.categoryId, restaurantId: owner.restaurantId },
        select: { id: true },
      });
      if (!category) return { error: 'Categoria inválida' };
    }

    const updated = await prisma.costEntry.update({
      where: { id },
      data: {
        amount: parsed.data.amount ?? Number(existing.amount),
        description: parsed.data.description ?? existing.description,
        categoryId: parsed.data.categoryId ?? existing.categoryId,
        type: parsed.data.type ?? existing.type,
        date: parsed.data.date ?? existing.date,
      },
    });

    return { success: true, data: updated };
  } catch (error: unknown) {
    return { error: toClientError('Failed to update entry', error, 'write') };
  }
}

export async function deleteCostEntry(id: string) {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return { success: false as const, error: owner.error };

    const existing = await prisma.costEntry.findFirst({
      where: { id, restaurantId: owner.restaurantId, deletedAt: null },
    });
    if (!existing) return { success: false as const, error: 'Entry not found' };

    await prisma.costEntry.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return { success: true as const };
  } catch (error: unknown) {
    return { success: false as const, error: toClientError('Failed to delete entry', error, 'delete') };
  }
}

// ─── P&L & Analytics Actions ──────────────────────────────────────────────

export async function getPnLStatement(month: number, year: number) {
  try {
    const member = await requireMember();
    if (isAuthError(member)) return { error: member.error };

    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth = new Date(year, month, 0, 23, 59, 59);

    const [revAgg, cogsAgg, opexAgg, cogsBreakdown, opexBreakdown] = await Promise.all([
      prisma.dailySummary.aggregate({
        where: { restaurantId: member.restaurantId, deletedAt: null, date: { gte: startOfMonth, lte: endOfMonth } },
        _sum: { revenueTotal: true, dineInRevenue: true, takeawayRevenue: true },
      }),
      prisma.costEntry.aggregate({
        where: { restaurantId: member.restaurantId, deletedAt: null, type: 'COGS', date: { gte: startOfMonth, lte: endOfMonth } },
        _sum: { amount: true },
      }),
      prisma.costEntry.aggregate({
        where: { restaurantId: member.restaurantId, deletedAt: null, type: 'OPEX', date: { gte: startOfMonth, lte: endOfMonth } },
        _sum: { amount: true },
      }),
      prisma.costEntry.groupBy({
        by: ['categoryId'],
        where: { restaurantId: member.restaurantId, deletedAt: null, type: 'COGS', date: { gte: startOfMonth, lte: endOfMonth } },
        _sum: { amount: true },
      }),
      prisma.costEntry.groupBy({
        by: ['categoryId'],
        where: { restaurantId: member.restaurantId, deletedAt: null, type: 'OPEX', date: { gte: startOfMonth, lte: endOfMonth } },
        _sum: { amount: true },
      }),
    ]);

    // Fetch category names
    const categoryIds = [...cogsBreakdown, ...opexBreakdown].map(b => b.categoryId).filter(Boolean) as string[];
    const categories = categoryIds.length > 0
      ? await prisma.category.findMany({ where: { id: { in: categoryIds } }, select: { id: true, name: true } })
      : [];
    const catMap = Object.fromEntries(categories.map(c => [c.id, c.name]));

    const revenue = Number(revAgg._sum.revenueTotal || 0);
    const dineIn = Number(revAgg._sum.dineInRevenue || 0);
    const takeaway = Number(revAgg._sum.takeawayRevenue || 0);
    const cogs = Number(cogsAgg._sum.amount || 0);
    const opex = Number(opexAgg._sum.amount || 0);

    // Labour is the subset of OPEX in categories flagged as labour, so Prime
    // Cost can be reported consistently with the dashboard and PDF.
    const labourAgg = await prisma.costEntry.aggregate({
      where: {
        restaurantId: member.restaurantId,
        deletedAt: null,
        date: { gte: startOfMonth, lte: endOfMonth },
        category: { isLabour: true },
      },
      _sum: { amount: true },
    });
    const labour = Number(labourAgg._sum.amount || 0);

    // All financial formulas come from lib/kpi.ts — the single source of truth.
    const kpis = calculateKpis({
      revenueTotal: revenue,
      cogsTotal: cogs,
      labourTotal: labour,
      opexTotal: Math.max(opex - labour, 0),
      dineInRevenue: dineIn,
      takeawayRevenue: takeaway,
      dineInTickets: 0,
      takeawayTickets: 0,
    });

    const grossProfit = kpis.grossProfit;
    const netIncome = kpis.netIncome;

    return {
      success: true,
      data: {
        month, year,
        revenue, dineIn, takeaway,
        cogs, opex, labour,
        grossProfit,
        grossMargin: toPercent(kpis.grossProfitPct),
        netIncome,
        netMargin: toPercent(kpis.netIncomePct),
        primeCost: kpis.primeCost,
        primeCostPercent: toPercent(kpis.primeCostPct),
        cogsBreakdown: cogsBreakdown.map(b => ({ category: catMap[b.categoryId || ''] || 'Sem categoria', amount: Number(b._sum.amount || 0) })),
        opexBreakdown: opexBreakdown.map(b => ({ category: catMap[b.categoryId || ''] || 'Sem categoria', amount: Number(b._sum.amount || 0) })),
      },
    };
  } catch (error: unknown) {
    return { error: toClientError('Failed to fetch P&L', error, 'read') };
  }
}

export async function getComparativeData() {
  try {
    const member = await requireMember();
    if (isAuthError(member)) return { error: member.error };

    const now = new Date();
    const months = [];

    for (let i = 5; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);

      const [rev, costs] = await Promise.all([
        prisma.dailySummary.aggregate({
          where: { restaurantId: member.restaurantId, deletedAt: null, date: { gte: start, lte: end } },
          _sum: { revenueTotal: true },
        }),
        prisma.costEntry.aggregate({
          where: { restaurantId: member.restaurantId, deletedAt: null, date: { gte: start, lte: end } },
          _sum: { amount: true },
        }),
      ]);

      const revenue = Number(rev._sum.revenueTotal || 0);
      const totalCosts = Number(costs._sum.amount || 0);

      months.push({
        label: start.toLocaleDateString('pt-PT', { month: 'short', year: '2-digit' }),
        revenue,
        costs: totalCosts,
        profit: revenue - totalCosts,
      });
    }

    return { success: true, data: months };
  } catch (error: unknown) {
    return { error: toClientError('Failed to fetch comparative data', error, 'read') };
  }
}

export async function getTicketAnalysis(dateFrom: Date, dateTo: Date) {
  try {
    const member = await requireMember();
    if (isAuthError(member)) return { error: member.error };

    const summaries = await prisma.dailySummary.findMany({
      where: { restaurantId: member.restaurantId, deletedAt: null, date: { gte: dateFrom, lte: dateTo } },
      orderBy: { date: 'asc' },
    });

    const data = summaries.map(s => {
      const totalTickets = s.dineInTickets + s.takeawayTickets;
      const totalRev = Number(s.revenueTotal);
      return {
        date: s.date,
        avgTicket: totalTickets > 0 ? totalRev / totalTickets : 0,
        dineInAvg: s.dineInTickets > 0 ? Number(s.dineInRevenue) / s.dineInTickets : 0,
        takeawayAvg: s.takeawayTickets > 0 ? Number(s.takeawayRevenue) / s.takeawayTickets : 0,
        dineInTickets: s.dineInTickets,
        takeawayTickets: s.takeawayTickets,
      };
    });

    // Overall averages
    const totalDineInRev = summaries.reduce((s, e) => s + Number(e.dineInRevenue), 0);
    const totalTakeawayRev = summaries.reduce((s, e) => s + Number(e.takeawayRevenue), 0);
    const totalDineInTickets = summaries.reduce((s, e) => s + e.dineInTickets, 0);
    const totalTakeawayTickets = summaries.reduce((s, e) => s + e.takeawayTickets, 0);
    const totalTickets = totalDineInTickets + totalTakeawayTickets;

    return {
      success: true,
      data: {
        daily: data,
        avgTicket: totalTickets > 0 ? (totalDineInRev + totalTakeawayRev) / totalTickets : 0,
        avgDineIn: totalDineInTickets > 0 ? totalDineInRev / totalDineInTickets : 0,
        avgTakeaway: totalTakeawayTickets > 0 ? totalTakeawayRev / totalTakeawayTickets : 0,
        totalTickets,
      },
    };
  } catch (error: unknown) {
    return { error: toClientError('Failed to fetch ticket analysis', error, 'read') };
  }
}

export async function updateRevenueTarget(target: number) {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return { error: owner.error };

    await prisma.restaurant.update({
      where: { id: owner.restaurantId },
      data: { monthlyRevenueTarget: target },
    });

    return { success: true };
  } catch (error: unknown) {
    return { error: toClientError('Failed to update target', error, 'write') };
  }
}

// ─── Settings & Staff Actions ─────────────────────────────────────────────

export async function updateUserProfile(name: string) {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return { error: owner.error };

    await prisma.user.update({ where: { id: owner.userId }, data: { name } });

    return { success: true };
  } catch (error: unknown) {
    return { error: toClientError('Failed to update profile', error, 'write') };
  }
}

export async function changePassword(currentPassword: string, newPassword: string) {
  try {
    const parsed = changePasswordSchema.safeParse({ currentPassword, newPassword });
    if (!parsed.success) return { error: formatZodError(parsed.error) };

    const authResult = await requireAuth();
    if (isAuthError(authResult)) return { error: authResult.error, requiresAuth: true };

    const user = await prisma.user.findUnique({
      where: { id: authResult.userId },
      select: { passwordHash: true },
    });

    // An account created through Google has no password to change. Setting
    // one from here would let anyone with a live session add a second way in.
    if (!user?.passwordHash) {
      return { error: 'Esta conta inicia sessão com Google e não tem palavra-passe.' };
    }

    const matches = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
    if (!matches) return { error: 'Palavra-passe atual incorreta' };

    const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
    await prisma.user.update({
      where: { id: authResult.userId },
      data: { passwordHash },
    });

    // Every other session is invalidated, so a password change actually ends
    // access anywhere the old one was used.
    await prisma.session.deleteMany({ where: { userId: authResult.userId } });

    return { success: true };
  } catch (error: unknown) {
    return { error: toClientError('Failed to change password', error, 'write') };
  }
}


export async function updateRestaurantSettings(data: {
  name?: string;
  timezone?: string;
  currency?: string;
}) {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return { error: owner.error };

    await prisma.restaurant.update({
      where: { id: owner.restaurantId },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.timezone && { timezone: data.timezone }),
        ...(data.currency && { currency: data.currency }),
      },
    });

    return { success: true };
  } catch (error: unknown) {
    return { error: toClientError('Failed to update restaurant', error, 'write') };
  }
}

export async function updateStaffPermissions(membershipId: string, permissions: string[]) {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return { error: owner.error };

    const ownerMembership = await prisma.membership.findFirst({
      where: { userId: owner.userId, role: 'OWNER', active: true },
    });
    if (!ownerMembership) return { error: 'Not an owner' };

    // Verify the target membership belongs to the same restaurant
    const targetMembership = await prisma.membership.findFirst({
      where: { id: membershipId, restaurantId: owner.restaurantId },
    });
    if (!targetMembership) return { error: 'Staff member not found' };

    await prisma.membership.update({
      where: { id: membershipId },
      data: { permissions },
    });

    return { success: true };
  } catch (error: unknown) {
    return { error: toClientError('Failed to update permissions', error, 'write') };
  }
}

export async function removeStaff(membershipId: string) {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return { error: owner.error };

    const ownerMembership = await prisma.membership.findFirst({
      where: { userId: owner.userId, role: 'OWNER', active: true },
    });
    if (!ownerMembership) return { error: 'Not an owner' };

    const targetMembership = await prisma.membership.findFirst({
      where: { id: membershipId, restaurantId: owner.restaurantId, role: 'STAFF' },
    });
    if (!targetMembership) return { error: 'Staff member not found' };

    await prisma.membership.update({
      where: { id: membershipId },
      data: { active: false },
    });

    return { success: true };
  } catch (error: unknown) {
    return { error: toClientError('Failed to remove staff', error, 'delete') };
  }
}

export async function getCurrentUser() {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return { error: owner.error };

    const userRecord = await prisma.user.findUnique({
      where: { id: owner.userId },
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
  } catch (error: unknown) {
    return { error: toClientError('Failed to fetch user', error, 'read') };
  }
}

// Get last 7 days revenue for mini chart
export async function getLast7DaysRevenue() {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return { error: owner.error };

    const now = new Date();
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const summaries = await prisma.dailySummary.findMany({
      where: {
        restaurantId: owner.restaurantId,
        deletedAt: null,
        date: {
          gte: sevenDaysAgo,
          lte: now,
        },
      },
      orderBy: {
        date: 'asc',
      },
    });

    // Fill in missing days with 0
    const data = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      
      const summary = summaries.find(s => {
        const sDate = new Date(s.date);
        sDate.setHours(0, 0, 0, 0);
        return sDate.getTime() === date.getTime();
      });

      data.push({
        date: date.toISOString().split('T')[0],
        revenue: summary ? Number(summary.revenueTotal) : 0,
      });
    }

    return { success: true, data };
  } catch (error: unknown) {
    return { error: toClientError('Failed to fetch revenue data', error, 'read') };
  }
}

// Get monthly revenue breakdown by category (Food, Drinks, Other)
export async function getMonthlyRevenueBreakdown() {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return { error: owner.error };

    const now = new Date();
    const sixMonthsAgo = new Date(now);
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const summaries = await prisma.dailySummary.findMany({
      where: {
        restaurantId: owner.restaurantId,
        deletedAt: null,
        date: {
          gte: sixMonthsAgo,
          lte: now,
        },
      },
      orderBy: {
        date: 'asc',
      },
    });

    // Group by month: actual dineIn vs takeaway (no fabricated splits)
    const monthlyData: Record<string, { dineIn: number; takeaway: number }> = {};

    summaries.forEach(summary => {
      const monthKey = `${new Date(summary.date).getFullYear()}-${String(new Date(summary.date).getMonth() + 1).padStart(2, '0')}`;

      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = { dineIn: 0, takeaway: 0 };
      }

      monthlyData[monthKey].dineIn += Number(summary.dineInRevenue);
      monthlyData[monthKey].takeaway += Number(summary.takeawayRevenue);
    });

    const result = Object.entries(monthlyData).map(([month, data]) => ({
      month,
      dineIn: data.dineIn,
      takeaway: data.takeaway,
      total: data.dineIn + data.takeaway,
    }));

    return { success: true, data: result };
  } catch (error: unknown) {
    return { error: toClientError('Failed to fetch breakdown', error, 'read') };
  }
}

// Get category performance data
export async function getCategoryPerformance() {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return { error: owner.error };

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    // Get actual cost spending grouped by category
    const costsByCategory = await prisma.costEntry.groupBy({
      by: ['categoryId'],
      where: {
        restaurantId: owner.restaurantId,
        deletedAt: null,
        date: { gte: startOfMonth, lte: endOfMonth },
      },
      _sum: { amount: true },
    });

    const categoryIds = costsByCategory.map(c => c.categoryId).filter(Boolean) as string[];
    const categories = categoryIds.length > 0
      ? await prisma.category.findMany({
          where: { id: { in: categoryIds } },
          select: { id: true, name: true, type: true },
        })
      : [];
    const catMap = Object.fromEntries(categories.map(c => [c.id, c]));

    const totalSpending = costsByCategory.reduce((sum, c) => sum + Number(c._sum.amount || 0), 0);

    const result = costsByCategory
      .filter(c => c.categoryId && catMap[c.categoryId])
      .map(c => {
        const cat = catMap[c.categoryId!];
        const amount = Number(c._sum.amount || 0);
        return {
          name: cat.name,
          monthlySpending: amount,
          contributionPercent: totalSpending > 0 ? (amount / totalSpending) * 100 : 0,
          type: cat.type,
        };
      })
      .sort((a, b) => b.monthlySpending - a.monthlySpending);

    return { success: true, data: result };
  } catch (error: unknown) {
    return { error: toClientError('Failed to fetch category performance', error, 'read') };
  }
}

// Get advanced dashboard stats (Prime Cost, COGS %, etc.)
export async function getAdvancedDashboardStats() {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return { error: owner.error };

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

    // Labour categories are identified by an explicit flag. Matching on
    // hardcoded names ('Ordenado 1', 'Segurança Social') silently yielded
    // labour = 0 — and a Prime Cost understated by roughly half — for any
    // restaurant that used its own category names.
    const laborCategories = await prisma.category.findMany({
      where: {
        restaurantId: owner.restaurantId,
        isLabour: true,
      },
      select: { id: true },
    });

    const laborCategoryIds = laborCategories.map(c => c.id);

    // Current month data
    const [currentRevenue, currentCosts, currentCOGS, currentLabor] = await Promise.all([
      prisma.dailySummary.aggregate({
        where: {
          restaurantId: owner.restaurantId,
          deletedAt: null,
          date: { gte: startOfMonth, lte: endOfMonth },
        },
        _sum: { revenueTotal: true },
      }),
      prisma.costEntry.aggregate({
        where: {
          restaurantId: owner.restaurantId,
          deletedAt: null,
          date: { gte: startOfMonth, lte: endOfMonth },
        },
        _sum: { amount: true },
      }),
      prisma.costEntry.aggregate({
        where: {
          restaurantId: owner.restaurantId,
          deletedAt: null,
          type: 'COGS',
          date: { gte: startOfMonth, lte: endOfMonth },
        },
        _sum: { amount: true },
      }),
      laborCategoryIds.length > 0
        ? prisma.costEntry.aggregate({
            where: {
              restaurantId: owner.restaurantId,
              deletedAt: null,
              date: { gte: startOfMonth, lte: endOfMonth },
              categoryId: { in: laborCategoryIds },
            },
            _sum: { amount: true },
          })
        : Promise.resolve({ _sum: { amount: null } }),
    ]);

    // Last month data for comparisons
    const [lastMonthRevenue, lastMonthCOGS] = await Promise.all([
      prisma.dailySummary.aggregate({
        where: {
          restaurantId: owner.restaurantId,
          deletedAt: null,
          date: { gte: startOfLastMonth, lte: endOfLastMonth },
        },
        _sum: { revenueTotal: true },
      }),
      prisma.costEntry.aggregate({
        where: {
          restaurantId: owner.restaurantId,
          deletedAt: null,
          type: 'COGS',
          date: { gte: startOfLastMonth, lte: endOfLastMonth },
        },
        _sum: { amount: true },
      }),
    ]);

    const revenue = Number(currentRevenue._sum.revenueTotal || 0);
    const totalCosts = Number(currentCosts._sum.amount || 0);
    const cogs = Number(currentCOGS._sum.amount || 0);
    const labor = Number(currentLabor._sum.amount || 0);

    // All financial formulas come from lib/kpi.ts — the single source of truth.
    // `totalCosts` already includes COGS and labour, so non-labour opex is the
    // remainder; passing them separately keeps the engine's inputs unambiguous.
    const kpis = calculateKpis({
      revenueTotal: revenue,
      cogsTotal: cogs,
      labourTotal: labor,
      opexTotal: Math.max(totalCosts - cogs - labor, 0),
      dineInRevenue: 0,
      takeawayRevenue: 0,
      dineInTickets: 0,
      takeawayTickets: 0,
    });

    const netIncome = kpis.netIncome;
    const primeCostPercent = toPercent(kpis.primeCostPct);
    const cogsPercent = toPercent(kpis.foodCostPct);

    // Previous month COGS % for trend
    const lastMonthRevenueVal = Number(lastMonthRevenue._sum.revenueTotal || 0);
    const lastMonthCOGSVal = Number(lastMonthCOGS._sum.amount || 0);
    const lastMonthCOGSPercent = toPercent(safeDivide(lastMonthCOGSVal, lastMonthRevenueVal));
    const cogsPercentChange = cogsPercent - lastMonthCOGSPercent;

    // Revenue change vs previous month
    const revenueChange = toPercent(percentChange(revenue, lastMonthRevenueVal));

    // Prime cost trend (simple sparkline data - last 7 months)
    const primeCostTrend = [];
    for (let i = 6; i >= 0; i--) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
      
      const [monthRev, monthCOGS, monthLab] = await Promise.all([
        prisma.dailySummary.aggregate({
          where: {
            restaurantId: owner.restaurantId,
            deletedAt: null,
            date: { gte: monthStart, lte: monthEnd },
          },
          _sum: { revenueTotal: true },
        }),
        prisma.costEntry.aggregate({
          where: {
            restaurantId: owner.restaurantId,
            deletedAt: null,
            type: 'COGS',
            date: { gte: monthStart, lte: monthEnd },
          },
          _sum: { amount: true },
        }),
        laborCategoryIds.length > 0
          ? prisma.costEntry.aggregate({
              where: {
                restaurantId: owner.restaurantId,
                deletedAt: null,
                date: { gte: monthStart, lte: monthEnd },
                categoryId: { in: laborCategoryIds },
              },
              _sum: { amount: true },
            })
          : Promise.resolve({ _sum: { amount: null } }),
      ]);
      
      const mRev = Number(monthRev._sum.revenueTotal || 0);
      const mCOGS = Number(monthCOGS._sum.amount || 0);
      const mLab = Number(monthLab._sum.amount || 0);
      const primeCost = mRev > 0 ? ((mCOGS + mLab) / mRev) * 100 : 0;
      primeCostTrend.push(primeCost);
    }

    // The owner's real revenue target, set in GoalsPanel. Null when unset so
    // the UI can prompt for one instead of charting a number we invented.
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: owner.restaurantId },
      select: { monthlyRevenueTarget: true },
    });
    const monthlyGoal = restaurant?.monthlyRevenueTarget
      ? Number(restaurant.monthlyRevenueTarget)
      : null;

    return {
      success: true,
      data: {
        totalRevenue: revenue,
        revenueChange,
        primeCostPercent,
        primeCostTrend,
        netIncome,
        netIncomePercent: toPercent(kpis.netIncomePct),
        cogsPercent,
        cogsPercentChange,
        laborPercent: toPercent(kpis.labourCostPct),
        labor,
        cogs,
        monthlyGoal,
        /** False when no category is flagged as labour, so the UI can warn
         *  that Prime Cost is incomplete rather than showing a wrong number. */
        hasLabourCategories: laborCategoryIds.length > 0,
      },
    };
  } catch (error: unknown) {
    return { error: toClientError('Failed to fetch advanced stats', error, 'read') };
  }
}
