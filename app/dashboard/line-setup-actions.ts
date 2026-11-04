'use server';

import { prisma } from '@/lib/prisma';
import { requireOwner, isAuthError } from '@/lib/auth-helpers';
import { toClientError } from '@/lib/errors';
import { toDayKey } from '@/lib/payments';
import { normalizeProductName } from '@/lib/price-tracking';
import { lineKey, type CostCategory } from '@/lib/invoice-categories';
import { packSizeOf, reconcileInvoice, rememberedPack } from '@/lib/invoice-matching';
import { rememberLine } from '@/lib/invoice-memory-server';
import { rebalanceInvoice } from '@/lib/invoice-split-server';
import { repriceIngredients } from '@/lib/ingredient-costs-server';
import {
  PACK_UNITS,
  groupWordings,
  ingredientUnitFor,
  restateLine,
  toPack,
  toPackInput,
  type PackInput,
  type WordingGroup,
} from '@/lib/line-setup';

/**
 * The questions an invoice left behind, and their answers.
 *
 * Invoices save at once; see lib/line-setup.ts for why. Each answer is given
 * once per wording and supplier, and rewrites every line already saved under
 * it, so the owner who answers in a month's time loses nothing.
 */

export interface SetupLine extends WordingGroup {
  /** The ingredients it feeds today. */
  ingredientIds: string[];
  /** Ingredients it may be, for offering beside the search. */
  suggestions: Array<{ id: string; name: string }>;
  notIngredient: boolean;
  /** What one purchased unit holds: answered, or read from the wording. */
  pack: PackInput | null;
}

export interface LineSetupData {
  lines: SetupLine[];
  ingredients: Array<{ id: string; name: string; unit: string }>;
  categories: CostCategory[];
}

const notDeleted = { OR: [{ costEntryId: null }, { costEntry: { deletedAt: null } }] };

const lineSelect = {
  productName: true, quantity: true, unit: true, totalPrice: true, packFactor: true, categoryId: true,
  invoiceDate: true, createdAt: true, vendorId: true, vendor: { select: { name: true } },
} as const;

type LineRow = {
  productName: string;
  quantity: { toString(): string };
  unit: string | null;
  totalPrice: { toString(): string };
  packFactor: { toString(): string } | null;
  categoryId: string | null;
  invoiceDate: Date | null;
  createdAt: Date;
  vendorId: string | null;
  vendor: { name: string } | null;
};

/** Everything a card needs about these lines, grouped per wording. */
async function describe(restaurantId: string, rows: LineRow[]): Promise<LineSetupData> {
  const groups = groupWordings(rows.map((r) => ({
    productName: r.productName,
    vendorId: r.vendorId,
    vendorName: r.vendor?.name ?? null,
    categoryId: r.categoryId,
    quantity: Number(r.quantity),
    unit: r.unit,
    total: Number(r.totalPrice),
    packFactor: r.packFactor === null ? null : Number(r.packFactor),
    date: toDayKey(r.invoiceDate ?? r.createdAt),
  })));

  const sourceNames = groups.map((g) => g.sourceName);
  const [ingredients, categoryRows, links, memories] = await Promise.all([
    prisma.ingredient.findMany({
      where: { restaurantId, deletedAt: null },
      select: { id: true, name: true, unit: true },
      orderBy: { name: 'asc' },
    }),
    prisma.category.findMany({
      where: { restaurantId, isActive: true, type: { in: ['COGS', 'OPEX'] } },
      select: { id: true, name: true, type: true },
      orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    }),
    prisma.invoiceItemLink.findMany({
      where: { restaurantId, sourceName: { in: sourceNames } },
      select: { sourceName: true, vendorId: true, ingredientId: true },
    }),
    prisma.invoiceLineMemory.findMany({
      where: { restaurantId, sourceName: { in: sourceNames } },
      select: { sourceName: true, vendorId: true, notIngredient: true, packAmount: true, packUnit: true },
    }),
  ]);

  const live = new Set(ingredients.map((i) => i.id));
  const reconciled = reconcileInvoice(
    groups.map((g) => ({ productName: g.productName, quantity: g.quantity, unit: g.unit ?? undefined, unitPrice: 0, total: g.total })),
    ingredients,
  );
  const decisions = new Map(reconciled.map((r) => [r.productName, r.decision]));

  const lines = groups.map((group): SetupLine => {
    const memory = memories.find((m) => m.sourceName === group.sourceName && m.vendorId === group.vendorId)
      ?? memories.find((m) => m.sourceName === group.sourceName && m.packUnit);
    const linked = links
      .filter((l) => l.sourceName === group.sourceName && l.vendorId === group.vendorId && live.has(l.ingredientId))
      .map((l) => l.ingredientId);

    const decision = decisions.get(group.productName);
    const guessed = !decision || decision.kind === 'new'
      ? []
      : [
          ...(decision.kind === 'linked' ? decision.ingredients : decision.suggestions),
          ...decision.related,
        ];
    const suggestions = [...new Map(guessed.map((s) => [s.id, { id: s.id, name: s.name }])).values()].slice(0, 6);

    const answered = memory?.packUnit ? rememberedPack(memory) : null;
    return {
      ...group,
      ingredientIds: linked,
      suggestions,
      notIngredient: memory?.notIngredient ?? false,
      pack: toPackInput(answered ?? packSizeOf(group.productName)),
    };
  });

  return {
    lines,
    ingredients,
    categories: categoryRows.map((c) => ({ id: c.id, name: c.name, type: c.type as CostCategory['type'] })),
  };
}

/** Every wording still waiting for an answer. */
export async function getLinesToSetup() {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return { error: owner.error };

    const rows = await prisma.invoiceItem.findMany({
      where: { restaurantId: owner.restaurantId, needsSetup: true, ...notDeleted },
      select: lineSelect,
      take: 2000,
    });
    return { success: true as const, data: await describe(owner.restaurantId, rows) };
  } catch (error: unknown) {
    return { error: toClientError('Failed to read the lines to set up', error, 'read') };
  }
}

/** One saved line's wording, to set it up again or correct it. */
export async function getLineSetup(itemId: string) {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return { error: owner.error };

    const item = await prisma.invoiceItem.findFirst({
      where: { id: itemId, restaurantId: owner.restaurantId },
      select: { productName: true, vendorId: true },
    });
    if (!item) return { error: 'accounting.lineNotFound' };

    const rows = await prisma.invoiceItem.findMany({
      where: {
        restaurantId: owner.restaurantId,
        vendorId: item.vendorId,
        productName: { equals: item.productName.trim(), mode: 'insensitive' },
        ...notDeleted,
      },
      select: lineSelect,
      take: 2000,
    });
    return { success: true as const, data: await describe(owner.restaurantId, rows) };
  } catch (error: unknown) {
    return { error: toClientError('Failed to read the line', error, 'read') };
  }
}

/**
 * Applies an answer to a wording: remembered for the next invoice, and
 * written onto every line already saved under it.
 */
export async function saveLineSetup(input: {
  vendorId: string;
  sourceName: string;
  ingredientIds: string[];
  /** Or a new ingredient under this name. */
  newIngredient?: string | null;
  notIngredient: boolean;
  pack: PackInput;
  categoryId: string | null;
}) {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return { error: owner.error };
    const { restaurantId, userId } = owner;

    const vendorId = input.vendorId;
    const sourceName = lineKey(input.sourceName);
    if (!PACK_UNITS.includes(input.pack?.unit)) return { error: 'lineSetup.errors.pack' };
    const pack = toPack(input.pack);
    if (!pack) return { error: 'lineSetup.errors.pack' };

    const [items, category, owned, previous] = await Promise.all([
      prisma.invoiceItem.findMany({
        where: { restaurantId, vendorId, productName: { equals: sourceName, mode: 'insensitive' } },
        select: { id: true, quantity: true, unit: true, totalPrice: true, packFactor: true, costEntryId: true },
      }),
      input.categoryId
        ? prisma.category.findFirst({
            where: { id: input.categoryId, restaurantId, isActive: true, type: { in: ['COGS', 'OPEX'] } },
            select: { id: true, type: true },
          })
        : null,
      // Only this restaurant's: a forged id is dropped, not linked.
      prisma.ingredient.findMany({
        where: { id: { in: input.ingredientIds }, restaurantId, deletedAt: null },
        select: { id: true },
      }),
      prisma.invoiceItemLink.findMany({
        where: { restaurantId, sourceName, vendorId },
        select: { ingredientId: true },
      }),
    ]);
    if (items.length === 0) return { error: 'accounting.lineNotFound' };

    // A running cost is never a kitchen ingredient, whatever was ticked.
    const notIngredient = input.notIngredient || category?.type === 'OPEX';
    const ingredientIds = notIngredient ? [] : owned.map((i) => i.id);
    const newName = notIngredient ? '' : input.newIngredient?.trim() ?? '';
    if (!notIngredient && ingredientIds.length === 0 && !newName) {
      return { error: 'lineSetup.errors.whatIsIt' };
    }

    if (newName) {
      // Reused if there is one by that name: two would split its price history.
      const existing = await prisma.ingredient.findFirst({
        where: { restaurantId, deletedAt: null, name: newName },
        select: { id: true },
      });
      const made = existing ?? await prisma.ingredient.create({
        data: {
          restaurantId,
          name: newName,
          normalizedName: normalizeProductName(newName),
          unit: ingredientUnitFor(input.pack.unit),
        },
        select: { id: true },
      });
      if (!ingredientIds.includes(made.id)) ingredientIds.push(made.id);
    }

    await prisma.invoiceItemLink.deleteMany({
      where: { restaurantId, sourceName, vendorId, ingredientId: { notIn: ingredientIds } },
    });
    for (const ingredientId of ingredientIds) {
      await prisma.invoiceItemLink.upsert({
        where: { restaurantId_sourceName_vendorId_ingredientId: { restaurantId, sourceName, vendorId, ingredientId } },
        create: { restaurantId, sourceName, vendorId, ingredientId },
        update: {},
      });
    }

    await prisma.$transaction(async (tx) => {
      for (const item of items) {
        const restated = notIngredient ? null : restateLine({
          quantity: Number(item.quantity),
          unit: item.unit,
          total: Number(item.totalPrice),
          packFactor: item.packFactor === null ? null : Number(item.packFactor),
        }, pack);
        await tx.invoiceItem.update({
          where: { id: item.id },
          data: {
            needsSetup: false,
            ...(restated ?? {}),
            ...(category ? { categoryId: category.id, categorySource: 'OWNER' as const } : {}),
          },
        });
      }
      if (category) {
        const entries = new Set(items.flatMap((i) => (i.costEntryId ? [i.costEntryId] : [])));
        for (const costEntryId of entries) {
          await rebalanceInvoice(tx, { restaurantId, costEntryId, userId });
        }
      }
    }, { timeout: 30_000 });

    await rememberLine(restaurantId, vendorId, sourceName, category?.id ?? null, notIngredient, notIngredient ? null : pack);

    // Dropped links too: an ingredient that lost this wording needs a new price.
    await repriceIngredients(restaurantId, {
      ingredientIds: [...new Set([...ingredientIds, ...previous.map((l) => l.ingredientId)])],
    });

    return { success: true as const, data: { lines: items.length } };
  } catch (error: unknown) {
    return { error: toClientError('Failed to save the line setup', error, 'write') };
  }
}
