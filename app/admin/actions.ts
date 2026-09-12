'use server';

import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { requireAuth, requireAdmin, isAuthError } from '@/lib/auth-helpers';
import { Plan } from '@prisma/client';
import { z } from 'zod';
import { toClientError, isUniqueConstraintError } from '@/lib/errors';

/**
 * Admin edits are bounded exactly like an owner's own edits. Without this the
 * admin console was the one way to write a negative revenue into a client's
 * books.
 */
const adminRevenueUpdateSchema = z
  .object({
    dineInRevenue: z.number().min(0, 'Receita não pode ser negativa').max(999999).optional(),
    takeawayRevenue: z.number().min(0, 'Receita não pode ser negativa').max(999999).optional(),
  })
  .strict();

const adminCostUpdateSchema = z
  .object({
    amount: z.number().min(0, 'Valor não pode ser negativo').max(999999).optional(),
    description: z.string().trim().max(500).optional(),
  })
  .strict();

export async function getClients() {
  try {
    const admin = await requireAdmin();
    if (isAuthError(admin)) return { error: admin.error };

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
  } catch (error: unknown) {
    return { error: toClientError('Failed to fetch clients', error, 'read') };
  }
}

export async function updateClient(data: {
  restaurantId: string;
  name?: string;
  plan?: Plan;
  trialEndsAt?: Date | null;
}) {
  try {
    const admin = await requireAdmin();
    if (isAuthError(admin)) return { error: admin.error };

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
  } catch (error: unknown) {
    return { error: toClientError('Failed to update client', error, 'write') };
  }
}

export async function getClientStats() {
  try {
    const admin = await requireAdmin();
    if (isAuthError(admin)) return { error: admin.error };

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
  } catch (error: unknown) {
    return { error: toClientError('Failed to fetch stats', error, 'read') };
  }
}

export async function getMonthlyRevenue(year: number) {
  try {
    const admin = await requireAdmin();
    if (isAuthError(admin)) return { error: admin.error };

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
  } catch (error: unknown) {
    return { error: toClientError('Failed to fetch monthly revenue', error, 'read') };
  }
}

export async function getAllUsers() {
  try {
    const admin = await requireAdmin();
    if (isAuthError(admin)) return { error: admin.error };

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
  } catch (error: unknown) {
    return { error: toClientError('Failed to fetch users', error, 'read') };
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
    const admin = await requireAdmin();
    if (isAuthError(admin)) return { error: admin.error };

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
  } catch (error: unknown) {
    return { error: toClientError('Failed to update user', error, 'write') };
  }
}

export async function sendPasswordReset(email: string) {
  try {
    const admin = await requireAdmin();
    if (isAuthError(admin)) return { error: admin.error };

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      select: { id: true },
    });
    // Do not reveal whether the address is registered.
    if (!user) return { success: true };

    // Single-use token, valid for one hour, stored in the table Auth.js
    // already uses for verification.
    const token = randomUUID();
    const expires = new Date(Date.now() + 60 * 60 * 1000);

    await prisma.verificationToken.deleteMany({ where: { identifier: email.toLowerCase() } });
    await prisma.verificationToken.create({
      data: { identifier: email.toLowerCase(), token, expires },
    });

    const base = process.env.NEXT_PUBLIC_APP_URL ?? '';
    const link = `${base}/reset-password?token=${token}`;

    // No mail provider is wired up yet, so the admin passes the link on
    // directly rather than the request silently doing nothing.
    return { success: true, resetLink: link };
  } catch (error: unknown) {
    return { error: toClientError('Failed to send password reset', error, 'write') };
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
    const admin = await requireAdmin();
    if (isAuthError(admin)) return { error: admin.error };

    // Identity is local now: hash the password and mint the id ourselves.
    const passwordHash = await bcrypt.hash(data.password, 12);
    const newUserId = randomUUID();

    // Check if user already exists in database
    const existingUser = await prisma.user.findUnique({
      where: { id: newUserId },
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

    // Create User record in database. The hash must be stored here: without
    // it the account exists but can never sign in.
    const dbUser = existingUser || await prisma.user.create({
      data: {
        id: newUserId,
        email: data.email.toLowerCase(),
        name: data.name,
        passwordHash,
        // Created by an admin, so the address is taken as confirmed.
        emailVerified: new Date(),
      },
    });

    // Create Restaurant
    const restaurant = await prisma.restaurant.create({
      data: {
        name: data.restaurantName,
        plan: data.plan,
        trialEndsAt: data.trialEndsAt || (data.plan === 'TRIAL' ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) : null),
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
  } catch (error: unknown) {
    if (isUniqueConstraintError(error, 'email')) {
      return { error: 'Email already registered' };
    }

    return { error: toClientError('Failed to create account', error, 'write') };
  }
}

export async function deleteAccount(userId: string) {
  try {
    const admin = await requireAdmin();
    if (isAuthError(admin)) return { error: admin.error };

    if (userId === admin.userId) {
      return { error: 'Não podes eliminar a tua própria conta.' };
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true },
    });
    if (!user) return { error: 'Utilizador não encontrado' };

    // Sessions and linked providers cascade from the user row. Memberships
    // are removed explicitly so the restaurant loses the access immediately.
    await prisma.$transaction([
      prisma.membership.deleteMany({ where: { userId } }),
      prisma.user.delete({ where: { id: userId } }),
    ]);

    await prisma.auditLog.create({
      data: {
        action: 'admin.user.delete',
        actorUserId: admin.userId,
        metadata: { deletedUserId: userId, deletedEmail: user.email },
      },
    });

    return { success: true };
  } catch (error: unknown) {
    return { error: toClientError('Failed to delete account', error, 'delete') };
  }
}

export async function changeUserPassword(userId: string, newPassword: string) {
  try {
    const admin = await requireAdmin();
    if (isAuthError(admin)) return { error: admin.error };

    if (newPassword.length < 8) {
      return { error: 'A palavra-passe deve ter pelo menos 8 caracteres.' };
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true },
    });
    if (!user) return { error: 'Utilizador não encontrado' };

    const passwordHash = await bcrypt.hash(newPassword, 12);

    await prisma.$transaction([
      prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
      // End every existing session: a password change should revoke access
      // anywhere the old one was used.
      prisma.session.deleteMany({ where: { userId } }),
    ]);

    await prisma.auditLog.create({
      data: {
        action: 'admin.user.password_change',
        actorUserId: admin.userId,
        metadata: { targetUserId: userId, targetEmail: user.email },
      },
    });

    return { success: true };
  } catch (error: unknown) {
    return { error: toClientError('Failed to change password', error, 'write') };
  }
}

// ─── Restaurant Detail Actions ────────────────────────────────────────────

/** Returns the admin's identity, or null when the caller is not one. */
async function verifyAdmin() {
  const admin = await requireAdmin();
  if (isAuthError(admin)) return null;
  return admin;
}

export async function getRestaurantDetail(restaurantId: string) {
  try {
    if (!await verifyAdmin()) return { error: 'Unauthorized' };

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      include: {
        memberships: { include: { user: { select: { id: true, email: true, name: true } } } },
        _count: { select: { dailySummaries: true, costEntries: true } },
      },
    });
    if (!restaurant) return { error: 'Not found' };

    // Get current month stats
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const [rev, costs] = await Promise.all([
      prisma.dailySummary.aggregate({
        where: { restaurantId, date: { gte: startOfMonth, lte: endOfMonth } },
        _sum: { revenueTotal: true },
      }),
      prisma.costEntry.aggregate({
        where: { restaurantId, date: { gte: startOfMonth, lte: endOfMonth } },
        _sum: { amount: true },
      }),
    ]);

    return {
      success: true,
      data: {
        ...restaurant,
        currentMonthRevenue: Number(rev._sum.revenueTotal || 0),
        currentMonthCosts: Number(costs._sum.amount || 0),
      },
    };
  } catch (error: unknown) {
    return { error: toClientError('Failed', error, 'generic') };
  }
}

export async function getRestaurantRevenue(restaurantId: string, dateFrom: Date, dateTo: Date) {
  try {
    if (!await verifyAdmin()) return { error: 'Unauthorized' };

    const entries = await prisma.dailySummary.findMany({
      where: { restaurantId, date: { gte: dateFrom, lte: dateTo } },
      orderBy: { date: 'desc' },
    });

    return {
      success: true,
      data: entries.map(e => ({
        id: e.id, date: e.date,
        dineInRevenue: Number(e.dineInRevenue),
        takeawayRevenue: Number(e.takeawayRevenue),
        revenueTotal: Number(e.revenueTotal),
        dineInTickets: e.dineInTickets,
        takeawayTickets: e.takeawayTickets,
      })),
    };
  } catch (error: unknown) {
    return { error: toClientError('Failed', error, 'generic') };
  }
}

export async function getRestaurantCosts(restaurantId: string, dateFrom: Date, dateTo: Date) {
  try {
    if (!await verifyAdmin()) return { error: 'Unauthorized' };

    const entries = await prisma.costEntry.findMany({
      where: { restaurantId, date: { gte: dateFrom, lte: dateTo } },
      orderBy: { date: 'desc' },
      include: { category: { select: { name: true } } },
    });

    return {
      success: true,
      data: entries.map(e => ({
        id: e.id, date: e.date, type: e.type,
        categoryName: e.category?.name || '—',
        amount: Number(e.amount),
        description: e.description,
      })),
    };
  } catch (error: unknown) {
    return { error: toClientError('Failed', error, 'generic') };
  }
}

export async function adminUpdateEntry(
  type: 'revenue' | 'cost',
  id: string,
  data: { dineInRevenue?: number; takeawayRevenue?: number; amount?: number; description?: string }
) {
  try {
    const admin = await requireAdmin();
    if (isAuthError(admin)) return { error: admin.error };

    if (type === 'revenue') {
      const parsed = adminRevenueUpdateSchema.safeParse(data);
      if (!parsed.success) {
        return { error: parsed.error.errors[0]?.message ?? 'Dados inválidos' };
      }

      // Read first, so the audit entry can record what actually changed and
      // which restaurant it belonged to.
      const before = await prisma.dailySummary.findFirst({
        where: { id, deletedAt: null },
        select: {
          restaurantId: true,
          date: true,
          dineInRevenue: true,
          takeawayRevenue: true,
        },
      });
      if (!before) return { error: 'Lançamento não encontrado' };

      const dineIn = parsed.data.dineInRevenue ?? Number(before.dineInRevenue);
      const takeaway = parsed.data.takeawayRevenue ?? Number(before.takeawayRevenue);

      await prisma.dailySummary.update({
        where: { id },
        data: {
          dineInRevenue: dineIn,
          takeawayRevenue: takeaway,
          revenueTotal: dineIn + takeaway,
        },
      });

      await prisma.auditLog.create({
        data: {
          restaurantId: before.restaurantId,
          action: 'admin.revenue.update',
          actorUserId: admin.userId,
          metadata: {
            entryId: id,
            date: before.date.toISOString(),
            from: {
              dineIn: Number(before.dineInRevenue),
              takeaway: Number(before.takeawayRevenue),
            },
            to: { dineIn, takeaway },
          },
        },
      });
    } else {
      const parsed = adminCostUpdateSchema.safeParse(data);
      if (!parsed.success) {
        return { error: parsed.error.errors[0]?.message ?? 'Dados inválidos' };
      }

      const before = await prisma.costEntry.findFirst({
        where: { id, deletedAt: null },
        select: { restaurantId: true, date: true, amount: true, description: true },
      });
      if (!before) return { error: 'Lançamento não encontrado' };

      await prisma.costEntry.update({
        where: { id },
        data: {
          amount: parsed.data.amount ?? Number(before.amount),
          description: parsed.data.description ?? before.description,
        },
      });

      await prisma.auditLog.create({
        data: {
          restaurantId: before.restaurantId,
          action: 'admin.cost.update',
          actorUserId: admin.userId,
          metadata: {
            entryId: id,
            date: before.date.toISOString(),
            from: { amount: Number(before.amount), description: before.description },
            to: { amount: parsed.data.amount, description: parsed.data.description },
          },
        },
      });
    }

    return { success: true };
  } catch (error: unknown) {
    return { error: toClientError('Failed to update entry as admin', error, 'write') };
  }
}

export async function adminDeleteEntry(type: 'revenue' | 'cost', id: string) {
  try {
    const admin = await requireAdmin();
    if (isAuthError(admin)) return { error: admin.error };

    // Soft delete, matching every tenant-facing path. A hard delete here
    // destroyed a client's financial record with nothing to recover from and
    // no trace of who did it.
    if (type === 'revenue') {
      const before = await prisma.dailySummary.findFirst({
        where: { id, deletedAt: null },
        select: { restaurantId: true, date: true, revenueTotal: true },
      });
      if (!before) return { error: 'Lançamento não encontrado' };

      await prisma.dailySummary.update({
        where: { id },
        data: { deletedAt: new Date() },
      });

      await prisma.auditLog.create({
        data: {
          restaurantId: before.restaurantId,
          action: 'admin.revenue.delete',
          actorUserId: admin.userId,
          metadata: {
            entryId: id,
            date: before.date.toISOString(),
            revenueTotal: Number(before.revenueTotal),
          },
        },
      });
    } else {
      const before = await prisma.costEntry.findFirst({
        where: { id, deletedAt: null },
        select: { restaurantId: true, date: true, amount: true, description: true },
      });
      if (!before) return { error: 'Lançamento não encontrado' };

      await prisma.costEntry.update({
        where: { id },
        data: { deletedAt: new Date() },
      });

      await prisma.auditLog.create({
        data: {
          restaurantId: before.restaurantId,
          action: 'admin.cost.delete',
          actorUserId: admin.userId,
          metadata: {
            entryId: id,
            date: before.date.toISOString(),
            amount: Number(before.amount),
            description: before.description,
          },
        },
      });
    }

    return { success: true };
  } catch (error: unknown) {
    return { error: toClientError('Failed to delete entry as admin', error, 'delete') };
  }
}

export async function getAuditLogs(filters?: { restaurantId?: string; limit?: number }) {
  try {
    if (!await verifyAdmin()) return { error: 'Unauthorized' };

    const logs = await prisma.auditLog.findMany({
      where: filters?.restaurantId ? { restaurantId: filters.restaurantId } : {},
      orderBy: { createdAt: 'desc' },
      take: filters?.limit || 50,
      include: {
        actor: { select: { name: true, email: true } },
        restaurant: { select: { name: true } },
      },
    });

    return { success: true, data: logs };
  } catch (error: unknown) {
    return { error: toClientError('Failed', error, 'generic') };
  }
}

export async function bulkUpdateRestaurants(ids: string[], data: { plan?: Plan; trialEndsAt?: Date }) {
  try {
    if (!await verifyAdmin()) return { error: 'Unauthorized' };

    await prisma.restaurant.updateMany({
      where: { id: { in: ids } },
      data: {
        ...(data.plan && { plan: data.plan }),
        ...(data.trialEndsAt && { trialEndsAt: data.trialEndsAt }),
      },
    });

    return { success: true };
  } catch (error: unknown) {
    return { error: toClientError('Failed', error, 'generic') };
  }
}

export async function getCurrentUser() {
  try {
    const authResult = await requireAuth();
    if (isAuthError(authResult)) return { error: authResult.error };

    const userRecord = await prisma.user.findUnique({
      where: { id: authResult.userId },
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
