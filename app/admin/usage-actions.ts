'use server';

import { requireAdmin, isAuthError } from '@/lib/auth-helpers';
import { prisma } from '@/lib/prisma';
import { toClientError } from '@/lib/errors';
import { MODEL_PRICES } from '@/lib/ai-models';
import { SCANNER_MODEL } from '@/lib/scanners/claude-scanner';
import { periodStart, summariseUsage, USAGE_PERIODS, type UsagePeriod } from '@/lib/ai-usage';

/**
 * What the AI costs, on which model, and who is spending it.
 *
 * Read from the usage log, which every scan and every bench run writes to.
 * Aggregated in memory: a few hundred calls a month is nothing to sum, and
 * the per-owner roll-up needs memberships that a SQL GROUP BY would have to
 * join anyway.
 */
export async function getAiUsage(period: UsagePeriod) {
  try {
    const admin = await requireAdmin();
    if (isAuthError(admin)) return { error: admin.error };
    if (!USAGE_PERIODS.includes(period)) return { error: 'errors.generic' };

    const from = periodStart(period);
    const rows = await prisma.aiUsage.findMany({
      where: from ? { createdAt: { gte: from } } : undefined,
      select: {
        restaurantId: true, userId: true, source: true, model: true,
        inputTokens: true, outputTokens: true, costUsd: true, durationMs: true,
        succeeded: true, stopReason: true, createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    const restaurantIds = [...new Set(rows.map((r) => r.restaurantId).filter((id): id is string => !!id))];
    const restaurants = restaurantIds.length
      ? await prisma.restaurant.findMany({
          where: { id: { in: restaurantIds } },
          select: {
            id: true,
            name: true,
            memberships: {
              where: { role: 'OWNER' },
              select: { user: { select: { id: true, name: true, email: true } } },
              orderBy: { createdAt: 'asc' },
            },
          },
        })
      : [];

    const summary = summariseUsage(
      rows.map((r) => ({ ...r, costUsd: Number(r.costUsd) })),
      restaurants.map((r) => ({ id: r.id, name: r.name, owners: r.memberships.map((m) => m.user) })),
      period,
    );

    return {
      success: true,
      data: {
        summary,
        currentModel: SCANNER_MODEL,
        // The price list as the console should show it: the model in use
        // first, then whatever older rows still name.
        prices: Object.entries(MODEL_PRICES)
          .map(([model, price]) => ({ model, ...price }))
          .sort((a, b) => Number(b.model === SCANNER_MODEL) - Number(a.model === SCANNER_MODEL)),
        /** When logging began, so an empty early history is not misread. */
        firstLoggedAt: (await prisma.aiUsage.findFirst({
          orderBy: { createdAt: 'asc' }, select: { createdAt: true },
        }))?.createdAt ?? null,
      },
    };
  } catch (error: unknown) {
    return { error: toClientError('Failed to read AI usage', error, 'read') };
  }
}
