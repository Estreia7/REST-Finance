'use server';

import { prisma } from '@/lib/prisma';
import { requireOwner, isAuthError } from '@/lib/auth-helpers';

export async function getVendors() {
  const owner = await requireOwner();
  if (isAuthError(owner)) return { success: false as const, error: owner.error };

  const vendors = await prisma.vendor.findMany({
    where: { restaurantId: owner.restaurantId, isActive: true },
    orderBy: { name: 'asc' },
  });

  return { success: true as const, data: vendors };
}

export async function findOrCreateVendor(name: string, taxId?: string) {
  const owner = await requireOwner();
  if (isAuthError(owner)) return { success: false as const, error: owner.error };

  const trimmedName = name.trim();
  if (!trimmedName) return { success: false as const, error: 'Nome do fornecedor é obrigatório' };

  const vendor = await prisma.vendor.upsert({
    where: {
      restaurantId_name: {
        restaurantId: owner.restaurantId,
        name: trimmedName,
      },
    },
    update: {
      isActive: true,
      ...(taxId ? { taxId } : {}),
    },
    create: {
      restaurantId: owner.restaurantId,
      name: trimmedName,
      taxId: taxId || null,
    },
  });

  return { success: true as const, data: vendor };
}

export async function createVendor(data: { name: string; taxId?: string }) {
  const owner = await requireOwner();
  if (isAuthError(owner)) return { success: false as const, error: owner.error };

  const trimmedName = data.name.trim();
  if (!trimmedName) return { success: false as const, error: 'Nome do fornecedor é obrigatório' };

  try {
    const vendor = await prisma.vendor.create({
      data: {
        restaurantId: owner.restaurantId,
        name: trimmedName,
        taxId: data.taxId || null,
      },
    });

    return { success: true as const, data: vendor };
  } catch (error: any) {
    if (error.code === 'P2002') {
      return { success: false as const, error: 'Já existe um fornecedor com este nome' };
    }
    return { success: false as const, error: 'Erro ao criar fornecedor' };
  }
}

export async function updateVendor(vendorId: string, data: { name?: string; taxId?: string }) {
  const owner = await requireOwner();
  if (isAuthError(owner)) return { success: false as const, error: owner.error };

  try {
    const vendor = await prisma.vendor.update({
      where: { id: vendorId, restaurantId: owner.restaurantId },
      data: {
        ...(data.name ? { name: data.name.trim() } : {}),
        ...(data.taxId !== undefined ? { taxId: data.taxId || null } : {}),
      },
    });

    return { success: true as const, data: vendor };
  } catch (error: any) {
    if (error.code === 'P2002') {
      return { success: false as const, error: 'Já existe um fornecedor com este nome' };
    }
    return { success: false as const, error: 'Erro ao atualizar fornecedor' };
  }
}

export async function deactivateVendor(vendorId: string) {
  const owner = await requireOwner();
  if (isAuthError(owner)) return { success: false as const, error: owner.error };

  await prisma.vendor.update({
    where: { id: vendorId, restaurantId: owner.restaurantId },
    data: { isActive: false },
  });

  return { success: true as const };
}
