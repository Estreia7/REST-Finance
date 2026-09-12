'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireOwner, isAuthError } from '@/lib/auth-helpers';
import { saveDocument, deleteStoredImage } from '@/lib/uploads';
import { toClientError } from '@/lib/errors';
import { EXPIRY_WARNING_DAYS, statusFor } from '@/lib/compliance';

/**
 * Compliance documents: insurance, licences, certificates.
 *
 * Owner-only, enforced here rather than by hiding the UI. These are the
 * restaurant's legal and insurance records, and staff have no business
 * reading them.
 *
 * Documents are soft deleted. An expired policy is still the record of what
 * was in force at the time, which is exactly what gets asked for after an
 * incident.
 */

const DOC_TYPES = [
  'INSURANCE',
  'HACCP',
  'FIRE_SAFETY',
  'ASAE_LICENCE',
  'HYGIENE_CERT',
  'WASTE_CONTRACT',
  'PEST_CONTROL',
  'OTHER',
] as const;

const metadataSchema = z.object({
  type: z.enum(DOC_TYPES, { message: 'Tipo de documento inválido' }),
  name: z.string().trim().min(2, 'Nome demasiado curto').max(120, 'Nome demasiado longo'),
  reference: z.string().trim().max(80).optional().nullable(),
  issuedAt: z.coerce.date().optional().nullable(),
  expiresAt: z.coerce.date().optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
});

/** Cap per restaurant, so storage cannot grow without bound. */
const MAX_DOCS = 200;

export async function uploadComplianceDoc(formData: FormData) {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return { error: owner.error };

    const file = formData.get('file');
    if (!(file instanceof File)) return { error: 'Nenhum ficheiro recebido.' };

    const raw = {
      type: formData.get('type'),
      name: formData.get('name'),
      reference: formData.get('reference') || null,
      issuedAt: formData.get('issuedAt') || null,
      expiresAt: formData.get('expiresAt') || null,
      notes: formData.get('notes') || null,
    };

    const parsed = metadataSchema.safeParse(raw);
    if (!parsed.success) {
      return { error: parsed.error.errors[0]?.message ?? 'Dados inválidos' };
    }

    // A document that expired before it was issued is a typo, and the expiry
    // warnings would be nonsense.
    if (parsed.data.issuedAt && parsed.data.expiresAt && parsed.data.expiresAt < parsed.data.issuedAt) {
      return { error: 'A data de validade é anterior à data de emissão.' };
    }

    const count = await prisma.complianceDoc.count({
      where: { restaurantId: owner.restaurantId, deletedAt: null },
    });
    if (count >= MAX_DOCS) {
      return { error: `Limite de ${MAX_DOCS} documentos atingido.` };
    }

    const saved = await saveDocument(owner.restaurantId, file);
    if (!saved.ok) return { error: saved.error };

    const doc = await prisma.complianceDoc.create({
      data: {
        restaurantId: owner.restaurantId,
        type: parsed.data.type,
        name: parsed.data.name,
        reference: parsed.data.reference ?? null,
        filePath: saved.storedPath,
        mimeType: saved.kind === 'pdf' ? 'application/pdf' : `image/${saved.kind}`,
        sizeBytes: saved.sizeBytes,
        issuedAt: parsed.data.issuedAt ?? null,
        expiresAt: parsed.data.expiresAt ?? null,
        notes: parsed.data.notes ?? null,
        uploadedById: owner.userId,
      },
    });

    revalidatePath('/dashboard');
    return { success: true, data: { id: doc.id } };
  } catch (error: unknown) {
    return { error: toClientError('Failed to upload compliance document', error, 'write') };
  }
}

export async function updateComplianceDoc(
  id: string,
  input: {
    name: string;
    reference?: string | null;
    issuedAt?: string | null;
    expiresAt?: string | null;
    notes?: string | null;
  }
) {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return { error: owner.error };

    // Scoped fetch first: a forged id from another restaurant must not resolve.
    const existing = await prisma.complianceDoc.findFirst({
      where: { id, restaurantId: owner.restaurantId, deletedAt: null },
      select: { id: true, type: true },
    });
    if (!existing) return { error: 'Documento não encontrado' };

    const parsed = metadataSchema.safeParse({ ...input, type: existing.type });
    if (!parsed.success) {
      return { error: parsed.error.errors[0]?.message ?? 'Dados inválidos' };
    }

    if (parsed.data.issuedAt && parsed.data.expiresAt && parsed.data.expiresAt < parsed.data.issuedAt) {
      return { error: 'A data de validade é anterior à data de emissão.' };
    }

    await prisma.complianceDoc.update({
      where: { id },
      data: {
        name: parsed.data.name,
        reference: parsed.data.reference ?? null,
        issuedAt: parsed.data.issuedAt ?? null,
        expiresAt: parsed.data.expiresAt ?? null,
        notes: parsed.data.notes ?? null,
      },
    });

    revalidatePath('/dashboard');
    return { success: true };
  } catch (error: unknown) {
    return { error: toClientError('Failed to update compliance document', error, 'write') };
  }
}

/**
 * Removes a document from the list.
 *
 * Soft delete, and the file stays on disk: an expired policy is still proof
 * of what was in force, and deleting the record of a past insurance is not
 * something a single click should do irreversibly.
 */
export async function deleteComplianceDoc(id: string) {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return { error: owner.error };

    const existing = await prisma.complianceDoc.findFirst({
      where: { id, restaurantId: owner.restaurantId, deletedAt: null },
      select: { id: true, name: true },
    });
    if (!existing) return { error: 'Documento não encontrado' };

    await prisma.complianceDoc.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await prisma.auditLog.create({
      data: {
        restaurantId: owner.restaurantId,
        action: 'compliance.document.delete',
        actorUserId: owner.userId,
        metadata: { documentId: id, name: existing.name },
      },
    });

    revalidatePath('/dashboard');
    return { success: true };
  } catch (error: unknown) {
    return { error: toClientError('Failed to delete compliance document', error, 'delete') };
  }
}

export async function getComplianceDocs() {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return { error: owner.error };

    const docs = await prisma.complianceDoc.findMany({
      where: { restaurantId: owner.restaurantId, deletedAt: null },
      orderBy: [{ expiresAt: 'asc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        type: true,
        name: true,
        reference: true,
        filePath: true,
        mimeType: true,
        sizeBytes: true,
        issuedAt: true,
        expiresAt: true,
        notes: true,
        createdAt: true,
      },
    });

    const now = new Date();
    return {
      success: true,
      data: docs.map((d) => ({ ...d, status: statusFor(d.expiresAt, now) })),
    };
  } catch (error: unknown) {
    return { error: toClientError('Failed to fetch compliance documents', error, 'read') };
  }
}

/**
 * Documents that are expired or close to it, for the dashboard warning.
 *
 * This is the part that earns its keep: a licence nobody renewed is only a
 * problem on the day an inspector asks.
 */
export async function getExpiringDocs() {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return { error: owner.error };

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + EXPIRY_WARNING_DAYS);

    const docs = await prisma.complianceDoc.findMany({
      where: {
        restaurantId: owner.restaurantId,
        deletedAt: null,
        expiresAt: { not: null, lte: cutoff },
      },
      orderBy: { expiresAt: 'asc' },
      select: { id: true, type: true, name: true, expiresAt: true },
    });

    const now = new Date();
    return {
      success: true,
      data: docs.map((d) => ({ ...d, status: statusFor(d.expiresAt, now) })),
    };
  } catch (error: unknown) {
    return { error: toClientError('Failed to fetch expiring documents', error, 'read') };
  }
}
