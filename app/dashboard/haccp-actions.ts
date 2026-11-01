'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireOwner, requireMember, isAuthError } from '@/lib/auth-helpers';
import { toClientError } from '@/lib/errors';
import { dayKey } from '@/lib/ai-usage';
import { evaluate, type ChecklistItem, type Answer } from '@/lib/haccp';

/**
 * HACCP records. The owner sets up the sheets; anyone on the team fills them
 * in. Records are never edited or deleted: that is what makes them evidence.
 * Errors are dictionary keys.
 */

function fail(error: string) {
  return { success: false as const, error };
}

const UUID = /^[0-9a-f-]{36}$/i;

/** Accepts only well-formed items, with fresh ids where missing. */
function cleanItems(items: unknown): ChecklistItem[] | null {
  if (!Array.isArray(items) || items.length === 0 || items.length > 40) return null;
  const out: ChecklistItem[] = [];
  for (const raw of items) {
    const i = raw as Partial<ChecklistItem>;
    const label = typeof i.label === 'string' ? i.label.trim().slice(0, 120) : '';
    if (!label || (i.kind !== 'check' && i.kind !== 'temperature')) return null;
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
    out.push({
      id: typeof i.id === 'string' && /^[\w-]{1,40}$/.test(i.id) ? i.id : crypto.randomUUID(),
      label,
      kind: i.kind,
      ...(i.kind === 'temperature' ? { min: num(i.min), max: num(i.max) } : {}),
    });
  }
  return out;
}

export async function getHaccpToday() {
  try {
    const member = await requireMember();
    if (isAuthError(member)) return fail(member.error);
    const since = new Date(Date.now() - 36 * 3_600_000);
    const today = dayKey(new Date());
    const [templates, records] = await Promise.all([
      prisma.checklistTemplate.findMany({
        where: { restaurantId: member.restaurantId, active: true },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        select: { id: true, name: true, items: true },
      }),
      prisma.checklistRecord.findMany({
        where: { restaurantId: member.restaurantId, doneAt: { gte: since } },
        orderBy: { doneAt: 'desc' },
        select: { templateId: true, doneAt: true, doneByName: true, issues: true },
      }),
    ]);
    const todays = records.filter((r) => dayKey(r.doneAt) === today);
    return {
      success: true as const,
      data: {
        canEdit: member.role === 'OWNER',
        templates: templates.map((t) => ({
          id: t.id,
          name: t.name,
          items: t.items as unknown as ChecklistItem[],
          today: todays
            .filter((r) => r.templateId === t.id)
            .map((r) => ({ at: r.doneAt.toISOString(), by: r.doneByName, issues: r.issues })),
        })),
      },
    };
  } catch (error: unknown) {
    return fail(toClientError('Failed to read the HACCP sheets', error, 'read'));
  }
}

export async function saveChecklistTemplate(input: { id?: string; name: string; items: unknown }) {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return fail(owner.error);
    const name = input.name.trim().slice(0, 80);
    const items = cleanItems(input.items);
    if (!name || !items) return fail('haccp.errors.invalidTemplate');
    if (input.id) {
      const updated = await prisma.checklistTemplate.updateMany({
        where: { id: input.id, restaurantId: owner.restaurantId },
        data: { name, items: items as object[] },
      });
      if (updated.count === 0) return fail('haccp.errors.notFound');
    } else {
      const count = await prisma.checklistTemplate.count({ where: { restaurantId: owner.restaurantId } });
      await prisma.checklistTemplate.create({
        data: { restaurantId: owner.restaurantId, name, items: items as object[], sortOrder: count },
      });
    }
    revalidatePath('/dashboard');
    return { success: true as const };
  } catch (error: unknown) {
    return fail(toClientError('Failed to save the sheet', error, 'write'));
  }
}

/** Taken off the list. Never deleted: its past records stay. */
export async function archiveChecklistTemplate(id: string) {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return fail(owner.error);
    const updated = await prisma.checklistTemplate.updateMany({ where: { id, restaurantId: owner.restaurantId }, data: { active: false } });
    if (updated.count === 0) return fail('haccp.errors.notFound');
    return { success: true as const };
  } catch (error: unknown) {
    return fail(toClientError('Failed to archive the sheet', error, 'write'));
  }
}

export async function saveChecklistRecord(input: {
  templateId: string;
  given: Record<string, { ok?: boolean | null; value?: number | null }>;
  notes?: string;
}) {
  try {
    const member = await requireMember();
    if (isAuthError(member)) return fail(member.error);
    if (!UUID.test(input.templateId)) return fail('haccp.errors.notFound');
    const template = await prisma.checklistTemplate.findFirst({
      where: { id: input.templateId, restaurantId: member.restaurantId, active: true },
      select: { id: true, name: true, items: true },
    });
    if (!template) return fail('haccp.errors.notFound');

    const { answers, issues, missing } = evaluate(template.items as unknown as ChecklistItem[], input.given ?? {});
    if (missing > 0) return fail('haccp.errors.incomplete');

    const user = await prisma.user.findUnique({ where: { id: member.userId }, select: { name: true, email: true } });
    await prisma.checklistRecord.create({
      data: {
        restaurantId: member.restaurantId,
        templateId: template.id,
        templateName: template.name,
        answers: answers as unknown as object[],
        issues,
        notes: input.notes?.trim().slice(0, 1000) || null,
        doneById: member.userId,
        doneByName: user?.name || user?.email || null,
      },
    });
    revalidatePath('/dashboard');
    return { success: true as const, data: { issues } };
  } catch (error: unknown) {
    return fail(toClientError('Failed to save the record', error, 'write'));
  }
}

/** A month of records, newest first, for the history and the inspector's export. */
export async function getChecklistRecords(month: string) {
  try {
    const member = await requireMember();
    if (isAuthError(member)) return fail(member.error);
    if (!/^\d{4}-\d{2}$/.test(month)) return fail('haccp.errors.notFound');
    const from = new Date(`${month}-01T00:00:00Z`);
    const to = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1));
    const records = await prisma.checklistRecord.findMany({
      where: { restaurantId: member.restaurantId, doneAt: { gte: from, lt: to } },
      orderBy: { doneAt: 'desc' },
      take: 2000,
      select: { id: true, templateName: true, answers: true, issues: true, notes: true, doneByName: true, doneAt: true },
    });
    return {
      success: true as const,
      data: records.map((r) => ({
        id: r.id,
        template: r.templateName,
        answers: r.answers as unknown as Answer[],
        issues: r.issues,
        notes: r.notes,
        by: r.doneByName,
        doneAt: r.doneAt.toISOString(),
      })),
    };
  } catch (error: unknown) {
    return fail(toClientError('Failed to read the records', error, 'read'));
  }
}
