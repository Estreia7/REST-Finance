'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireOwner, isAuthError } from '@/lib/auth-helpers';
import { toClientError } from '@/lib/errors';
import { TAX_SETTING_KEY } from '@/lib/tax-period';
import type { Region } from '@/lib/tax-rules';
import {
  validateRoom, parseAmount, categoryForPreset, setupChecklist,
  FIXED_COST_PRESETS, type FixedCostKey, type RoomInput, type SetupFacts,
} from '@/lib/onboarding';
import { updateRestaurantSettings, createCostEntry, getCategories } from '@/app/dashboard/actions';
import { saveTaxSettings } from '@/app/dashboard/tax-actions';

/**
 * The first-run wizard's server side, and the dashboard checklist.
 *
 * Every step saves through the action the rest of the app already uses for
 * the same thing (restaurant settings, tax settings, a recurring cost), so a
 * value set here and one set later in Settings can never be stored two ways.
 *
 * Errors are dictionary keys, never sentences.
 */

function fail(error: string) {
  return { success: false as const, error };
}

const REGIONS: Region[] = ['continente', 'madeira', 'acores'];
const dismissKey = (restaurantId: string) => `onboarding.checklistDismissed.${restaurantId}`;

export async function saveRestaurantStep(input: {
  name: string;
  taxId: string;
  municipalityCode: string | null;
  region: Region;
}) {
  if (!REGIONS.includes(input.region)) return fail('onboarding.restaurant.regionInvalid');
  const name = input.name.trim();
  if (!name) return fail('onboarding.restaurant.nameRequired');

  const saved = await updateRestaurantSettings({
    name: name.slice(0, 120),
    taxId: input.taxId.trim() || null,
    municipalityCode: input.municipalityCode,
  });
  if (saved && 'error' in saved && saved.error) return fail(saved.error);

  const tax = await saveTaxSettings({ region: input.region });
  if (!tax.success) return fail(tax.error);
  return { success: true as const };
}

export async function saveRoomStep(input: RoomInput) {
  const room = validateRoom(input);
  if (!room.ok) return fail(room.error);

  const saved = await updateRestaurantSettings({
    seats: room.seats,
    serviceHoursPerDay: room.serviceHoursPerDay,
    monthlyRevenueTarget: room.monthlyRevenueTarget,
  });
  if (saved && 'error' in saved && saved.error) return fail(saved.error);
  return { success: true as const };
}

/**
 * Books each filled row as a monthly cost from the first of this month, on
 * the 1st, until stopped — the same as ticking "repeat every month" on the
 * cost form.
 *
 * A direct debit pays itself every month, this one included. Anything else is
 * to pay from next month on; this month's is booked as already paid, with no
 * method, because an owner setting up at the end of the month has paid the
 * rent, and showing it overdue on their first screen would be wrong.
 */
export async function saveFixedCostsStep(
  rows: Array<{ key: FixedCostKey; amount: string; label: string; directDebit: boolean }>,
) {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return fail(owner.error);

    const filled = rows
      .filter((r) => FIXED_COST_PRESETS.some((p) => p.key === r.key))
      .map((r) => ({ ...r, value: parseAmount(r.amount) }))
      .filter((r): r is typeof r & { value: number } => r.value !== null);
    if (filled.length === 0) return { success: true as const, data: { booked: 0 } };

    // Creates the default categories on a brand-new restaurant.
    const cats = await getCategories('OPEX');
    const categories = cats && 'data' in cats && Array.isArray(cats.data)
      ? (cats.data as Array<{ id: string; name: string; type: string; isLabour?: boolean; isOccupancy?: boolean }>)
      : [];

    const now = new Date();
    const firstOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    let booked = 0;
    for (const row of filled) {
      const result = await createCostEntry({
        date: firstOfMonth,
        type: 'OPEX',
        categoryId: categoryForPreset(row.key, categories) ?? undefined,
        amount: row.value,
        description: row.label.slice(0, 200),
        recurring: { dayOfMonth: 1, months: null },
        ...(row.directDebit && { payment: { paid: true, method: 'DIRECT_DEBIT' as const } }),
      });
      if (!result.success) return fail(result.error ?? 'onboarding.fixedCosts.failed');
      if (!row.directDebit) {
        await prisma.costEntry.updateMany({
          where: { id: result.data.id, restaurantId: owner.restaurantId },
          data: { paidAt: firstOfMonth },
        });
      }
      booked++;
    }
    return { success: true as const, data: { booked } };
  } catch (error: unknown) {
    return fail(toClientError('Failed to save fixed costs', error, 'write'));
  }
}

/** Ends the wizard, whether finished or skipped: skipping counts as seen. */
export async function finishOnboarding() {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return fail(owner.error);
    await prisma.restaurant.update({
      where: { id: owner.restaurantId },
      data: { onboardingCompleted: true },
    });
    revalidatePath('/dashboard');
    return { success: true as const };
  } catch (error: unknown) {
    return fail(toClientError('Failed to finish onboarding', error, 'write'));
  }
}

/** What the dashboard checklist shows, or null once dismissed. */
export async function getSetupChecklist() {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return fail(owner.error);
    const id = owner.restaurantId;

    const [restaurant, taxRow, dismissed, revenueDays, costEntries, recurringCosts, staffCount, complianceDocs] =
      await Promise.all([
        prisma.restaurant.findUnique({
          where: { id },
          select: { taxId: true, municipalityCode: true, seats: true, serviceHoursPerDay: true },
        }),
        prisma.appSetting.findUnique({ where: { key: `${TAX_SETTING_KEY}.${id}` }, select: { key: true } }),
        prisma.appSetting.findUnique({ where: { key: dismissKey(id) }, select: { key: true } }),
        prisma.dailySummary.count({ where: { restaurantId: id, deletedAt: null } }),
        prisma.costEntry.count({ where: { restaurantId: id, deletedAt: null } }),
        prisma.recurringCost.count({ where: { restaurantId: id } }),
        prisma.membership.count({ where: { restaurantId: id, role: 'STAFF', active: true } }),
        prisma.complianceDoc.count({ where: { restaurantId: id, deletedAt: null } }),
      ]);

    if (dismissed || !restaurant) return { success: true as const, data: null };

    const facts: SetupFacts = {
      taxId: restaurant.taxId,
      municipalityCode: restaurant.municipalityCode,
      taxSettingsSaved: Boolean(taxRow),
      seats: restaurant.seats,
      serviceHoursPerDay: restaurant.serviceHoursPerDay ? Number(restaurant.serviceHoursPerDay) : null,
      revenueDays, costEntries, recurringCosts, staffCount, complianceDocs,
    };
    return { success: true as const, data: setupChecklist(facts) };
  } catch (error: unknown) {
    return fail(toClientError('Failed to read setup checklist', error, 'read'));
  }
}

export async function dismissSetupChecklist() {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return fail(owner.error);
    const key = dismissKey(owner.restaurantId);
    await prisma.appSetting.upsert({
      where: { key },
      create: { key, value: new Date().toISOString() },
      update: { value: new Date().toISOString() },
    });
    return { success: true as const };
  } catch (error: unknown) {
    return fail(toClientError('Failed to dismiss checklist', error, 'write'));
  }
}
