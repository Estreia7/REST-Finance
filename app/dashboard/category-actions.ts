'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireOwner, isAuthError } from '@/lib/auth-helpers';
import { toClientError } from '@/lib/errors';

/**
 * Category management.
 *
 * Owners can add a category while entering a cost, and rename or retire one
 * later. Categories are never hard deleted: cost entries reference them, and
 * removing one would silently rewrite past months. They are deactivated
 * instead, so history keeps its labels while the category stops appearing in
 * new entries.
 */

const categorySchema = z.object({
  name: z.string().trim().min(2, 'Nome demasiado curto').max(60, 'Nome demasiado longo'),
  type: z.enum(['COGS', 'OPEX'], { message: 'Tipo inválido' }),
  // Wages and employer contributions. Prime Cost is COGS plus labour, so an
  // unflagged wage category silently halves the metric.
  isLabour: z.boolean().optional(),
});

export async function createCategory(input: {
  name: string;
  type: 'COGS' | 'OPEX';
  isLabour?: boolean;
}) {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return { error: owner.error };

    const parsed = categorySchema.safeParse(input);
    if (!parsed.success) {
      return { error: parsed.error.errors[0]?.message ?? 'Dados inválidos' };
    }

    const { name, type } = parsed.data;
    // Only OPEX can be labour; flagging a goods category would corrupt both
    // food cost and prime cost.
    const isLabour = type === 'OPEX' ? parsed.data.isLabour ?? false : false;

    const existing = await prisma.category.findFirst({
      where: {
        restaurantId: owner.restaurantId,
        type,
        name: { equals: name, mode: 'insensitive' },
      },
      select: { id: true, isActive: true },
    });

    if (existing) {
      if (existing.isActive) {
        return { error: 'Já existe uma categoria com esse nome.' };
      }
      // Reactivate rather than create a duplicate, so past entries reconnect
      // to the category they already used.
      const revived = await prisma.category.update({
        where: { id: existing.id },
        data: { isActive: true, isLabour },
      });
      revalidatePath('/dashboard');
      return { success: true, data: revived };
    }

    const last = await prisma.category.findFirst({
      where: { restaurantId: owner.restaurantId, type },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });

    const category = await prisma.category.create({
      data: {
        restaurantId: owner.restaurantId,
        name,
        type,
        isLabour,
        sortOrder: (last?.sortOrder ?? 0) + 1,
        isActive: true,
      },
    });

    revalidatePath('/dashboard');
    return { success: true, data: category };
  } catch (error: unknown) {
    return { error: toClientError('Failed to create category', error, 'write') };
  }
}

export async function renameCategory(id: string, name: string) {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return { error: owner.error };

    const parsed = categorySchema.pick({ name: true }).safeParse({ name });
    if (!parsed.success) {
      return { error: parsed.error.errors[0]?.message ?? 'Nome inválido' };
    }

    // Scoped fetch first: a forged id from another restaurant must not resolve.
    const category = await prisma.category.findFirst({
      where: { id, restaurantId: owner.restaurantId },
      select: { id: true, type: true },
    });
    if (!category) return { error: 'Categoria não encontrada' };

    const clash = await prisma.category.findFirst({
      where: {
        restaurantId: owner.restaurantId,
        type: category.type,
        name: { equals: parsed.data.name, mode: 'insensitive' },
        id: { not: id },
      },
      select: { id: true },
    });
    if (clash) return { error: 'Já existe uma categoria com esse nome.' };

    await prisma.category.update({ where: { id }, data: { name: parsed.data.name } });

    revalidatePath('/dashboard');
    return { success: true };
  } catch (error: unknown) {
    return { error: toClientError('Failed to rename category', error, 'write') };
  }
}

/** Flags or unflags a category as labour, which Prime Cost depends on. */
export async function setCategoryLabour(id: string, isLabour: boolean) {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return { error: owner.error };

    const category = await prisma.category.findFirst({
      where: { id, restaurantId: owner.restaurantId },
      select: { id: true, type: true },
    });
    if (!category) return { error: 'Categoria não encontrada' };

    if (category.type !== 'OPEX' && isLabour) {
      return { error: 'Só as despesas operacionais podem ser pessoal.' };
    }

    await prisma.category.update({ where: { id }, data: { isLabour } });

    revalidatePath('/dashboard');
    return { success: true };
  } catch (error: unknown) {
    return { error: toClientError('Failed to update category', error, 'write') };
  }
}

/**
 * Retires a category. Not a delete: existing cost entries keep pointing at it,
 * so past months keep their labels and their totals.
 */
export async function deactivateCategory(id: string) {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return { error: owner.error };

    const category = await prisma.category.findFirst({
      where: { id, restaurantId: owner.restaurantId },
      select: { id: true },
    });
    if (!category) return { error: 'Categoria não encontrada' };

    await prisma.category.update({ where: { id }, data: { isActive: false } });

    revalidatePath('/dashboard');
    return { success: true };
  } catch (error: unknown) {
    return { error: toClientError('Failed to deactivate category', error, 'write') };
  }
}

/** All categories including retired ones, for the management screen. */
export async function getAllCategories() {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return { error: owner.error };

    const categories = await prisma.category.findMany({
      where: { restaurantId: owner.restaurantId },
      orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }],
    });

    // How many entries use each, so the UI can warn before retiring one.
    const counts = await prisma.costEntry.groupBy({
      by: ['categoryId'],
      where: { restaurantId: owner.restaurantId, deletedAt: null },
      _count: { _all: true },
    });
    const usage = new Map(counts.map((c) => [c.categoryId, c._count._all]));

    return {
      success: true,
      data: categories.map((c) => ({ ...c, entryCount: usage.get(c.id) ?? 0 })),
    };
  } catch (error: unknown) {
    return { error: toClientError('Failed to fetch categories', error, 'read') };
  }
}
