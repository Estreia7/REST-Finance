/**
 * The tax position of any stretch of dates.
 *
 * The Estado tab works in quarters, because that is how VAT is filed. A
 * report is a month or a year, which is neither — so the pieces the quarter
 * is built from are gathered here, and both callers use them.
 *
 * Kept out of `tax-actions.ts` because that file is `'use server'`: a route
 * handler cannot import from it, and copying the assembly into the PDF route
 * is how the report and the Estado tab would quietly come to disagree about
 * how much VAT a month carried.
 *
 * Everything here is an estimate, and anything showing it must say so. Sales
 * VAT is read off the till wherever the takings were imported from it, since
 * that export carries each category's net figure. Purchase VAT is assumed by
 * cost type, not read off each invoice.
 */
import { prisma } from '@/lib/prisma';
import {
  salesVat,
  purchaseVat,
  splitTillSales,
  DEFAULT_SALES_MIX,
  type SalesMix,
  type TillSalesLine,
  type PurchaseGroup,
} from '@/lib/tax-calc';
import {
  ASSUMED_PURCHASE_VAT,
  DEFAULT_DEDUCTIBILITY,
  IVA_RATES,
  type Region,
  type DeductibilityKey,
} from '@/lib/tax-rules';
import {
  findMunicipality,
  resolveDerrama,
  derramaTableFor,
  isDerramaChoice,
  type DerramaChoice,
} from '@/lib/derrama';

/** Where the Estado tab keeps the mix and the council's rate. */
export const TAX_SETTING_KEY = 'tax.settings';

export interface TaxSettings {
  mix: SalesMix;
  region: Region;
  /** The rate typed by hand: used until a council is chosen, or when asked to. */
  derramaMunicipalRate: number;
  /** Which of the council's rates applies. See lib/derrama.ts. */
  derramaChoice: DerramaChoice;
  isPme: boolean;
  vatPeriodicity: 'quarterly' | 'monthly';
}

export const DEFAULT_TAX_SETTINGS: TaxSettings = {
  mix: DEFAULT_SALES_MIX,
  region: 'continente',
  derramaMunicipalRate: 1.5,
  derramaChoice: 'general',
  isPme: true,
  vatPeriodicity: 'quarterly',
};

export async function readTaxSettings(restaurantId: string): Promise<TaxSettings> {
  const row = await prisma.appSetting.findUnique({
    where: { key: `${TAX_SETTING_KEY}.${restaurantId}` },
  });
  if (!row?.value) return DEFAULT_TAX_SETTINGS;
  try {
    const parsed = JSON.parse(row.value) as Partial<TaxSettings>;
    return {
      ...DEFAULT_TAX_SETTINGS,
      ...parsed,
      mix: { ...DEFAULT_SALES_MIX, ...(parsed.mix ?? {}) },
      derramaChoice: isDerramaChoice(parsed.derramaChoice) ? parsed.derramaChoice : 'general',
    };
  } catch {
    // A corrupted preference must not take the caller down with it.
    return DEFAULT_TAX_SETTINGS;
  }
}

/**
 * A period's takings, split into what the till already taxed and what the
 * sales mix has to estimate.
 */
export async function readSalesForPeriod(
  restaurantId: string,
  start: Date,
  end: Date,
  region: Region,
): Promise<{ grossRevenue: number; tillLines: TillSalesLine[]; estimatedGross: number }> {
  const [days, rows] = await Promise.all([
    prisma.dailySummary.findMany({
      where: { restaurantId, deletedAt: null, date: { gte: start, lte: end } },
      select: { date: true, revenueTotal: true },
    }),
    prisma.dailyCategoryRevenue.findMany({
      where: { restaurantId, date: { gte: start, lte: end }, revenueNet: { not: null } },
      select: { date: true, revenue: true, revenueNet: true, category: { select: { name: true } } },
    }),
  ]);

  const grossRevenue = days.reduce((s, d) => s + Number(d.revenueTotal), 0);

  const { tillLines, estimatedGross } = splitTillSales({
    days: days.map((d) => ({ date: d.date.toISOString().slice(0, 10), gross: Number(d.revenueTotal) })),
    rows: rows.map((r) => ({
      date: r.date.toISOString().slice(0, 10),
      label: r.category.name,
      gross: Number(r.revenue),
      net: r.revenueNet === null ? null : Number(r.revenueNet),
    })),
    maxRate: IVA_RATES[region].normal,
  });

  return { grossRevenue, tillLines, estimatedGross };
}

/**
 * Takings net of VAT — the "volume de negócios" councils set their derrama
 * thresholds on. The till's own net figure where there is one; the sales mix
 * only for takings it did not break down.
 */
export function netTurnover(
  sales: { tillLines: TillSalesLine[]; estimatedGross: number },
  settings: Pick<TaxSettings, 'mix' | 'region'>,
): number {
  return (
    sales.tillLines.reduce((s, l) => s + l.net, 0) +
    salesVat(sales.estimatedGross, settings.mix, settings.region).totalNet
  );
}

/**
 * The derrama municipal a tax period is estimated with, and everything the
 * tax screen needs to explain it. One function, so the Estado tab and the
 * annual report can never disagree about the rate.
 */
export async function derramaForYear(
  restaurantId: string,
  settings: TaxSettings,
  taxYear: number,
) {
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { municipalityCode: true },
  });
  const municipality = findMunicipality(restaurant?.municipalityCode);
  const resolved = resolveDerrama({
    municipalityCode: municipality?.code,
    choice: settings.derramaChoice,
    manualRate: settings.derramaMunicipalRate,
    taxYear,
  });
  const { table, exact } = derramaTableFor(taxYear);
  const council = municipality ? table.byCode[municipality.code] ?? null : null;
  // The table is named even when the owner typed their own rate, so the
  // options can still be offered against it.
  return { municipality, resolved, council, table: { year: table.taxYear, exact } };
}

/** Purchases grouped the way the deductibility rules expect. */
export async function readPurchasesForPeriod(
  restaurantId: string,
  start: Date,
  end: Date,
): Promise<PurchaseGroup[]> {
  const costs = await prisma.costEntry.groupBy({
    by: ['type'],
    where: { restaurantId, deletedAt: null, date: { gte: start, lte: end } },
    _sum: { amount: true },
  });

  return costs.map((row) => {
    const type = row.type as 'COGS' | 'OPEX';
    return {
      labelKey: type === 'COGS' ? 'estado.purchaseGoods' : 'estado.purchaseOperating',
      gross: Number(row._sum.amount ?? 0),
      vatRate: ASSUMED_PURCHASE_VAT[type],
      deductibility: DEFAULT_DEDUCTIBILITY[type] as DeductibilityKey,
    };
  });
}

export interface PeriodVat {
  /** VAT charged on sales. */
  outputVat: number;
  /** VAT on purchases that may be reclaimed. */
  deductibleVat: number;
  /** Positive is owed to the state; negative is a credit carried forward. */
  balance: number;
  payable: number;
  credit: number;
  /** Takings the till itself broke down, so the VAT on them is read not guessed. */
  tillGross: number;
  /** Takings the mix had to estimate from. Zero when the till covered it all. */
  estimatedGross: number;
}

/**
 * The VAT position of an arbitrary period.
 *
 * `vatReturn` in `tax-calc` is tied to a quarter because that is the unit a
 * return is filed in. A report covers a month or a year, so the same parts
 * are assembled here without pretending the period is a quarter it is not.
 */
export async function vatForPeriod(
  restaurantId: string,
  start: Date,
  end: Date,
): Promise<PeriodVat> {
  const settings = await readTaxSettings(restaurantId);
  const [sales, purchases] = await Promise.all([
    readSalesForPeriod(restaurantId, start, end, settings.region),
    readPurchasesForPeriod(restaurantId, start, end),
  ]);

  const estimated = salesVat(sales.estimatedGross, settings.mix, settings.region);
  const deducted = purchaseVat(purchases);

  const outputVat = sales.tillLines.reduce((s, l) => s + l.vat, 0) + estimated.totalVat;
  const balance = outputVat - deducted.totalDeductible;

  return {
    outputVat,
    deductibleVat: deducted.totalDeductible,
    balance,
    // A negative balance is a credit carried forward, not a negative payment.
    payable: Math.max(0, balance),
    credit: Math.max(0, -balance),
    tillGross: sales.tillLines.reduce((s, l) => s + l.gross, 0),
    estimatedGross: sales.estimatedGross,
  };
}
