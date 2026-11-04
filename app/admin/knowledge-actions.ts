'use server';

import { requireAdmin, isAuthError } from '@/lib/auth-helpers';
import { prisma } from '@/lib/prisma';
import { toClientError } from '@/lib/errors';
import { cleanTaxId, groupLearning, type LearnedCorrection } from '@/lib/supplier-knowledge';

/**
 * The administrator's side of what the reader learns per supplier.
 *
 * Reads the corrections of every restaurant, because that is the point of the
 * layer, and shows them only here. See lib/supplier-knowledge.ts.
 */

/** How far back corrections count: a supplier's till changes with time. */
const WINDOW_DAYS = 180;

const NOTE_MIN = 10;
const NOTE_MAX = 500;
const DOC_TYPES = ['FT', 'FR', 'FS'];

export async function getSupplierKnowledge() {
  try {
    const admin = await requireAdmin();
    if (isAuthError(admin)) return { error: admin.error };

    const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000);
    const [rows, rules] = await Promise.all([
      prisma.scanCorrection.findMany({
        where: { createdAt: { gte: since }, vendor: { taxId: { not: null } } },
        select: {
          restaurantId: true, productName: true, field: true, readValue: true, savedValue: true,
          createdAt: true, vendor: { select: { name: true, taxId: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 5000,
      }),
      prisma.supplierKnowledge.findMany({
        select: { id: true, taxId: true, vendorName: true, docType: true, note: true, source: true, active: true },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const corrections = rows.flatMap((r): LearnedCorrection[] => {
      const taxId = cleanTaxId(r.vendor?.taxId);
      if (!taxId) return [];
      return [{
        taxId,
        vendorName: r.vendor?.name ?? taxId,
        restaurantId: r.restaurantId,
        productName: r.productName,
        field: r.field,
        readValue: r.readValue,
        savedValue: r.savedValue,
        createdAt: r.createdAt,
      }];
    });

    return { success: true as const, data: { suppliers: groupLearning(corrections, rules), windowDays: WINDOW_DAYS } };
  } catch (error: unknown) {
    return { error: toClientError('Failed to read the supplier knowledge', error, 'read') };
  }
}

/** Approves a rule: from now on the reader is told this about the supplier. */
export async function saveSupplierRule(input: {
  taxId: string;
  vendorName: string;
  docType: string | null;
  note: string;
  source: string | null;
}) {
  try {
    const admin = await requireAdmin();
    if (isAuthError(admin)) return { error: admin.error };

    const taxId = cleanTaxId(input.taxId);
    const note = input.note.trim();
    if (!taxId) return { error: 'admin.knowledge.errors.taxId' };
    if (note.length < NOTE_MIN || note.length > NOTE_MAX) return { error: 'admin.knowledge.errors.note' };
    if (input.docType !== null && !DOC_TYPES.includes(input.docType)) return { error: 'admin.knowledge.errors.note' };

    const rule = await prisma.supplierKnowledge.create({
      data: {
        taxId,
        vendorName: input.vendorName.trim().slice(0, 200),
        docType: input.docType,
        note,
        source: input.source,
        createdById: admin.userId,
      },
      select: { id: true },
    });
    await prisma.auditLog.create({
      data: { action: 'admin.knowledge.rule.add', actorUserId: admin.userId, metadata: { taxId, ruleId: rule.id } },
    });
    return { success: true as const };
  } catch (error: unknown) {
    return { error: toClientError('Failed to save the rule', error, 'write') };
  }
}

/** A rule that misleads the reader is switched off at once, for every client. */
export async function setSupplierRuleActive(input: { id: string; active: boolean }) {
  try {
    const admin = await requireAdmin();
    if (isAuthError(admin)) return { error: admin.error };

    const rule = await prisma.supplierKnowledge.update({
      where: { id: input.id },
      data: { active: input.active },
      select: { taxId: true },
    });
    await prisma.auditLog.create({
      data: {
        action: input.active ? 'admin.knowledge.rule.on' : 'admin.knowledge.rule.off',
        actorUserId: admin.userId,
        metadata: { taxId: rule.taxId, ruleId: input.id },
      },
    });
    return { success: true as const };
  } catch (error: unknown) {
    return { error: toClientError('Failed to change the rule', error, 'write') };
  }
}
