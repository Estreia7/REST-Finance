'use server';

import { prisma } from '@/lib/prisma';
import { requireOwner, isAuthError } from '@/lib/auth-helpers';
import {
  quarterRange, vatReturn, estimateIrc, paymentsOnAccount, salesVat, splitTillSales,
  DEFAULT_SALES_MIX, type Quarter, type SalesMix,
} from '@/lib/tax-calc';
import {
  ASSUMED_PURCHASE_VAT, DEFAULT_DEDUCTIBILITY, IVA_RATES, type Region, type DeductibilityKey,
} from '@/lib/tax-rules';
import {
  readTaxSettings, DEFAULT_TAX_SETTINGS, readSalesForPeriod, TAX_SETTING_KEY, type TaxSettings,
} from '@/lib/tax-period';

/**
 * The Estado tab's server side.
 *
 * Everything it returns is an estimate, and the UI says so on every screen.
 * Sales VAT is read off the till wherever the takings were imported from it,
 * since the export carries each category's net figure; only takings typed in
 * as one daily total fall back to proportions the owner sets. Purchase VAT is
 * still assumed by cost type rather than read off each invoice. That is
 * enough to tell an owner roughly what is coming before the accountant tells
 * them, which is the point; it is not the return that gets filed.
 */

function fail(error: string) {
  return { success: false as const, error };
}

/**
 * The settings and the period readers live in lib/tax-period.ts, so the
 * monthly report and this tab can never disagree about how much VAT a
 * stretch of dates carried. Re-exported under the old names to keep the
 * rest of this file unchanged.
 */
const readSettings = readTaxSettings;
const DEFAULT_SETTINGS = DEFAULT_TAX_SETTINGS;

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

  const key = `${TAX_SETTING_KEY}.${owner.restaurantId}`;
  await prisma.appSetting.upsert({
    where: { key },
    create: { key, value: JSON.stringify(next) },
    update: { value: JSON.stringify(next) },
  });

  return { success: true as const, data: next };
}

// ── Sales ──────────────────────────────────────────────────────────────────

const readSales = readSalesForPeriod;

// ── IVA ────────────────────────────────────────────────────────────────────

export async function getVatQuarter(year: number, quarter: Quarter) {
  const owner = await requireOwner();
  if (isAuthError(owner)) return fail(owner.error);

  if (!Number.isInteger(year) || year < 2000 || year > 2100) return fail('Ano inválido');
  if (![1, 2, 3, 4].includes(quarter)) return fail('Trimestre inválido');

  const settings = await readSettings(owner.restaurantId);
  const { start, end } = quarterRange(year, quarter);
  const scope = { restaurantId: owner.restaurantId, deletedAt: null };

  const [sales, costs] = await Promise.all([
    readSales(owner.restaurantId, start, end, settings.region),
    prisma.costEntry.groupBy({
      by: ['type'],
      where: { ...scope, date: { gte: start, lte: end } },
      _sum: { amount: true },
    }),
  ]);

  const { grossRevenue } = sales;

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
    grossRevenue: sales.estimatedGross,
    tillLines: sales.tillLines,
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

  const [sales, costs] = await Promise.all([
    readSales(owner.restaurantId, start, end, settings.region),
    prisma.costEntry.aggregate({
      where: { ...scope, date: { gte: start, lte: end } },
      _sum: { amount: true },
    }),
  ]);

  const { grossRevenue } = sales;
  const totalCosts = Number(costs._sum.amount ?? 0);

  // IRC is charged on profit net of VAT: the VAT inside the takings was never
  // the restaurant's money. Using the gross figure would overstate the profit
  // by roughly a seventh and the tax with it. The till's own net figure where
  // there is one; the mix only for takings it did not break down.
  const totalNet =
    sales.tillLines.reduce((s, l) => s + l.net, 0) +
    salesVat(sales.estimatedGross, settings.mix, settings.region).totalNet;

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
      /** Takings whose VAT came from the mix rather than the till. */
      estimatedGross: sales.estimatedGross,
      totalCosts,
      accountingProfit,
      nextYearInstalments: instalments,
      hasData: grossRevenue > 0 || totalCosts > 0,
      settings,
    },
  };
}
