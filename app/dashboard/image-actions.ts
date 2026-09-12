'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireAuth, requireOwner, isAuthError } from '@/lib/auth-helpers';
import { saveImage, deleteStoredImage } from '@/lib/uploads';
import { toClientError } from '@/lib/errors';

/**
 * Logo and profile picture uploads.
 *
 * The logo belongs to the restaurant, so only an owner may change it. The
 * profile picture belongs to the person, so any signed-in member may change
 * their own — and only their own: the id comes from the session, never from
 * the form.
 */

export async function uploadRestaurantLogo(formData: FormData) {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return { error: owner.error };

    const file = formData.get('file');
    if (!(file instanceof File)) return { error: 'Nenhum ficheiro recebido.' };

    const result = await saveImage('logos', owner.restaurantId, file);
    if (!result.ok) return { error: result.error };

    const current = await prisma.restaurant.findUnique({
      where: { id: owner.restaurantId },
      select: { logoPath: true },
    });

    await prisma.restaurant.update({
      where: { id: owner.restaurantId },
      data: { logoPath: result.storedPath },
    });

    // Only after the record points at the new file, so a failure mid-way
    // leaves the old logo working rather than none at all.
    await deleteStoredImage(current?.logoPath ?? null);

    revalidatePath('/dashboard');
    return { success: true, logoPath: result.storedPath };
  } catch (error: unknown) {
    return { error: toClientError('Failed to upload logo', error, 'write') };
  }
}

export async function removeRestaurantLogo() {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return { error: owner.error };

    const current = await prisma.restaurant.findUnique({
      where: { id: owner.restaurantId },
      select: { logoPath: true },
    });

    await prisma.restaurant.update({
      where: { id: owner.restaurantId },
      data: { logoPath: null },
    });
    await deleteStoredImage(current?.logoPath ?? null);

    revalidatePath('/dashboard');
    return { success: true };
  } catch (error: unknown) {
    return { error: toClientError('Failed to remove logo', error, 'delete') };
  }
}

export async function uploadProfilePicture(formData: FormData) {
  try {
    const auth = await requireAuth();
    if (isAuthError(auth)) return { error: auth.error };

    const file = formData.get('file');
    if (!(file instanceof File)) return { error: 'Nenhum ficheiro recebido.' };

    const result = await saveImage('avatars', auth.userId, file);
    if (!result.ok) return { error: result.error };

    const current = await prisma.user.findUnique({
      where: { id: auth.userId },
      select: { image: true },
    });

    await prisma.user.update({
      where: { id: auth.userId },
      data: { image: result.storedPath },
    });

    // Google sign-in stores an absolute URL here; only delete files we wrote.
    const previous = current?.image;
    if (previous && !previous.startsWith('http')) {
      await deleteStoredImage(previous);
    }

    revalidatePath('/dashboard');
    return { success: true, imagePath: result.storedPath };
  } catch (error: unknown) {
    return { error: toClientError('Failed to upload profile picture', error, 'write') };
  }
}

export async function removeProfilePicture() {
  try {
    const auth = await requireAuth();
    if (isAuthError(auth)) return { error: auth.error };

    const current = await prisma.user.findUnique({
      where: { id: auth.userId },
      select: { image: true },
    });

    await prisma.user.update({ where: { id: auth.userId }, data: { image: null } });

    if (current?.image && !current.image.startsWith('http')) {
      await deleteStoredImage(current.image);
    }

    revalidatePath('/dashboard');
    return { success: true };
  } catch (error: unknown) {
    return { error: toClientError('Failed to remove profile picture', error, 'delete') };
  }
}
