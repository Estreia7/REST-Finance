'use server';

import { prisma } from '@/lib/prisma';
import { requireOwner, isAuthError } from '@/lib/auth-helpers';
import {
  quarterRange, vatReturn, estimateIrc, paymentsOnAccount,
  DEFAULT_SALES_MIX, type Quarter, type SalesMix,
} from '@/lib/tax-calc';
import {
  ASSUMED_PURCHASE_VAT, DEFAULT_DEDUCTIBILITY, type Region, type DeductibilityKey,
} from '@/lib/tax-rules';

/**
 * The Estado tab's server side.
 *
 * Everything it returns is an estimate, and the UI says so on every screen.
 * The daily takings are recorded as one gross figure, so the split between
 * 13% and 23% comes from proportions the owner sets rather than from the
 * till, and purchase VAT is assumed by cost type rather than read off each
 * invoice. That is enough to tell an owner roughly what is coming before the
 * accountant tells them, which is the point; it is not the return that gets
 * filed.
 */

function fail(error: string) {
  return { success: false as const, error };
}

/**
 * Where the sales mix and the council's derrama rate live.
 *
 * Reuses the AppSetting table rather than adding columns to Restaurant: these
 * are a handful of preferences for one tab, and a migration for them would be
 * a migration to undo the first time the shape changes.
 */
const SETTING_KEY = 'tax.settings';

interface TaxSettings {
  mix: SalesMix;
  region: Region;
  derramaMunicipalRate: number;
  isPme: boolean;
  vatPeriodicity: 'quarterly' | 'monthly';
}

const DEFAULT_SETTINGS: TaxSettings = {
  mix: DEFAULT_SALES_MIX,
  region: 'continente',
  derramaMunicipalRate: 1.5,
  isPme: true,
  vatPeriodicity: 'quarterly',
};

async function readSettings(restaurantId: string): Promise<TaxSettings> {
  const row = await prisma.appSetting.findUnique({
    where: { key: `${SETTING_KEY}.${restaurantId}` },
  });
  if (!row?.value) return DEFAULT_SETTINGS;
  try {
    const parsed = JSON.parse(row.value) as Partial<TaxSettings>;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      mix: { ...DEFAULT_SALES_MIX, ...(parsed.mix ?? {}) },
    };
  } catch {
    // A corrupted preference must not take the whole tab down with it.
    return DEFAULT_SETTINGS;
  }
}

export async function getTaxSettings() {
  const owner = await requireOwner();
  if (isAuthError(owner)) return fail(owner.error);
  return { success: true as const, data: await readSettings(owner.restaurantId) };
}

export async function saveTaxSettings(input: Partial<TaxSettings>) {
  const owner = await requireOwner();
  if (isAuthError(owner)) return fail(owner.error);

  const current = await readSettings(owner.restaurantId);
  const next: TaxSettings = {
    ...current,
    ...input,
    mix: { ...current.mix, ...(input.mix ?? {}) },
  };

  // The statutory ceiling is 1.5%; a council cannot charge above it.
  next.derramaMunicipalRate = Math.min(Math.max(next.derramaMunicipalRate, 0), 1.5);

  const key = `${SETTING_KEY}.${owner.restaurantId}`;
  await prisma.appSetting.upsert({
    where: { key },
    create: { key, value: JSON.stringify(next) },
    update: { value: JSON.stringify(next) },
  });

  return { success: true as const, data: next };
}

// ── IVA ────────────────────────────────────────────────────────────────────

export async function getVatQuarter(year: number, quarter: Quarter) {
  const owner = await requireOwner();
  if (isAuthError(owner)) return fail(owner.error);

  if (!Number.isInteger(year) || year < 2000 || year > 2100) return fail('Ano inválido');
  if (![1, 2, 3, 4].includes(quarter)) return fail('Trimestre inválido');

  const settings = await readSettings(owner.restaurantId);
  const { start, end } = quarterRange(year, quarter);
  const scope = { restaurantId: owner.restaurantId, deletedAt: null };

  const [revenue, costs] = await Promise.all([
    prisma.dailySummary.aggregate({
      where: { ...scope, date: { gte: start, lte: end } },
      _sum: { revenueTotal: true },
    }),
    prisma.costEntry.groupBy({
      by: ['type'],
      where: { ...scope, date: { gte: start, lte: end } },
      _sum: { amount: true },
    }),
  ]);

  const grossRevenue = Number(revenue._sum.revenueTotal ?? 0);

  const purchases = costs.map((row) => {
    const type = row.type as 'COGS' | 'OPEX';
    return {
      // A key, not a sentence: this runs on the server, where the reader's
      // language is not known. The panel translates it on display.
      labelKey: type === 'COGS' ? 'estado.purchaseGoods' : 'estado.purchaseOperating',
      gross: Number(row._sum.amount ?? 0),
      vatRate: ASSUMED_PURCHASE_VAT[type],
      deductibility: DEFAULT_DEDUCTIBILITY[type] as DeductibilityKey,
    };
  });

  const result = vatReturn({
    year,
    quarter,
    grossRevenue,
    mix: settings.mix,
    purchases,
    region: settings.region,
  });

  return {
    success: true as const,
    data: {
      ...result,
      grossRevenue,
      hasData: grossRevenue > 0 || purchases.some((p) => p.gross > 0),
      settings,
    },
  };
}

// ── IRC ────────────────────────────────────────────────────────────────────

export async function getIrcYear(year: number) {
  const owner = await requireOwner();
  if (isAuthError(owner)) return fail(owner.error);

  if (!Number.isInteger(year) || year < 2000 || year > 2100) return fail('Ano inválido');

  const settings = await readSettings(owner.restaurantId);
  const start = new Date(Date.UTC(year, 0, 1));
  const end = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));
  const scope = { restaurantId: owner.restaurantId, deletedAt: null };

  const [revenue, costs] = await Promise.all([
    prisma.dailySummary.aggregate({
      where: { ...scope, date: { gte: start, lte: end } },
      _sum: { revenueTotal: true },
    }),
    prisma.costEntry.aggregate({
      where: { ...scope, date: { gte: start, lte: end } },
      _sum: { amount: true },
    }),
  ]);

  const grossRevenue = Number(revenue._sum.revenueTotal ?? 0);
  const totalCosts = Number(costs._sum.amount ?? 0);

  // IRC is charged on profit net of VAT: the VAT inside the takings was never
  // the restaurant's money. Using the gross figure would overstate the profit
  // by roughly a seventh and the tax with it.
  const { totalNet } = (await import('@/lib/tax-calc')).salesVat(
    grossRevenue,
    settings.mix,
    settings.region
  );

  const accountingProfit = totalNet - totalCosts;

  const estimate = estimateIrc({
    year,
    accountingProfit,
    isPme: settings.isPme,
    derramaMunicipalRate: settings.derramaMunicipalRate,
  });

  const instalments = paymentsOnAccount({
    previousCollecta: estimate.collecta,
    turnover: totalNet,
  });

  return {
    success: true as const,
    data: {
      ...estimate,
      grossRevenue,
      netRevenue: totalNet,
      totalCosts,
      accountingProfit,
      nextYearInstalments: instalments,
      hasData: grossRevenue > 0 || totalCosts > 0,
      settings,
    },
  };
}
