/**
 * VAT and IRC arithmetic.
 *
 * Pure, so the parts that are easy to get wrong can be tested without a
 * database: extracting VAT from a gross figure, the quarter a date falls in,
 * the two-band IRC rate, and the autonomous taxation a loss-making year still
 * owes.
 *
 * Everything here is an estimate and the UI says so. The restaurant's daily
 * takings are recorded as one gross figure, so the split between 13% and 23%
 * comes from the proportions the owner gives rather than from the till. That
 * is honest and useful — it tells them roughly what is coming — and it is not
 * the return their accountant files.
 */

import {
  IVA_RATES,
  SALES_VAT_CLASSES,
  DEDUCTIBILITY,
  ASSUMED_PURCHASE_VAT,
  ircForYear,
  DERRAMA_MUNICIPAL_MAX,
  TRIBUTACAO_AUTONOMA,
  PAGAMENTOS_POR_CONTA,
  VAT_DEADLINES,
  LOSS_CARRYFORWARD_CAP,
  type Region,
  type SalesVatClass,
  type DeductibilityKey,
  type VatDeadline,
} from './tax-rules';

// ── Periods ────────────────────────────────────────────────────────────────

export type Quarter = 1 | 2 | 3 | 4;

export function quarterOf(date: Date): Quarter {
  return (Math.floor(date.getUTCMonth() / 3) + 1) as Quarter;
}

/** First and last instant of a quarter, as UTC dates. */
export function quarterRange(year: number, quarter: Quarter): { start: Date; end: Date } {
  const startMonth = (quarter - 1) * 3;
  return {
    start: new Date(Date.UTC(year, startMonth, 1)),
    end: new Date(Date.UTC(year, startMonth + 3, 0, 23, 59, 59, 999)),
  };
}

export function quarterLabel(year: number, quarter: Quarter, language: 'pt' | 'en' = 'pt'): string {
  const months = [
    ['Janeiro', 'Março'], ['Abril', 'Junho'], ['Julho', 'Setembro'], ['Outubro', 'Dezembro'],
  ];
  const en = [
    ['January', 'March'], ['April', 'June'], ['July', 'September'], ['October', 'December'],
  ];
  const pair = language === 'pt' ? months[quarter - 1] : en[quarter - 1];
  return language === 'pt'
    ? `${quarter}.º trimestre ${year} · ${pair[0]} a ${pair[1]}`
    : `Q${quarter} ${year} · ${pair[0]} to ${pair[1]}`;
}

/** The filing deadline for a quarter, or null when that year is not tabulated. */
export function deadlineFor(year: number, quarter: Quarter): VatDeadline | null {
  return VAT_DEADLINES[year]?.find((d) => d.quarter === quarter) ?? null;
}

/**
 * Days until a deadline; negative once it has passed.
 * `today` is injectable so the countdown can be tested.
 */
export function daysUntil(isoDate: string, today: Date = new Date()): number {
  const target = new Date(`${isoDate}T00:00:00Z`).getTime();
  const now = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.round((target - now) / 86_400_000);
}

// ── VAT extraction ─────────────────────────────────────────────────────────

/**
 * The VAT inside a gross amount.
 *
 * By division, never by taking a percentage of the gross: at 23%, 123 € gross
 * contains 23 € of VAT, not 28.29 €. The same arithmetic as the menu
 * calculator, and the same error it exists to avoid.
 */
export function vatFromGross(gross: number, rate: number): number {
  if (!Number.isFinite(gross) || !Number.isFinite(rate)) return 0;
  return gross - gross / (1 + rate / 100);
}

export function netFromGross(gross: number, rate: number): number {
  if (!Number.isFinite(gross) || !Number.isFinite(rate)) return 0;
  return gross / (1 + rate / 100);
}

/** How the restaurant's takings split across VAT classes. Shares are percentages. */
export type SalesMix = Record<SalesVatClass, number>;

/**
 * A sensible opening assumption for a Portuguese restaurant.
 *
 * Roughly three quarters food, the rest drink, with alcohol the larger part
 * of that. It is a starting point the owner corrects, not a claim about their
 * business, and every figure derived from it is labelled an estimate.
 */
export const DEFAULT_SALES_MIX: SalesMix = {
  food: 72,
  softDrink: 12,
  refrigerante: 4,
  alcohol: 12,
};

export interface SalesVatLine {
  key: SalesVatClass;
  label: string;
  rate: number;
  sharePercent: number;
  gross: number;
  net: number;
  vat: number;
}

/**
 * Output VAT on a quarter's takings, split by rate.
 *
 * The shares are normalised rather than trusted to total 100: an owner typing
 * four numbers into four boxes will not always make them add up, and silently
 * inventing or losing revenue would be worse than rescaling.
 */
export function salesVat(
  grossRevenue: number,
  mix: SalesMix,
  region: Region = 'continente'
): { lines: SalesVatLine[]; totalVat: number; totalNet: number } {
  const rates = IVA_RATES[region];
  const totalShare = SALES_VAT_CLASSES.reduce((s, c) => s + (mix[c.key] || 0), 0);

  const lines = SALES_VAT_CLASSES.map((cls) => {
    const share = totalShare > 0 ? (mix[cls.key] || 0) / totalShare : 0;
    const rate = rates[cls.band];
    const gross = grossRevenue * share;
    const vat = vatFromGross(gross, rate);
    return {
      key: cls.key,
      label: cls.label,
      rate,
      sharePercent: share * 100,
      gross,
      net: gross - vat,
      vat,
    };
  });

  return {
    lines,
    totalVat: lines.reduce((s, l) => s + l.vat, 0),
    totalNet: lines.reduce((s, l) => s + l.net, 0),
  };
}

export interface PurchaseGroup {
  /** Cost category or type, as shown to the owner. */
  label: string;
  /** Gross spend in the period. */
  gross: number;
  /** VAT rate assumed on this spend. */
  vatRate: number;
  /** How much of that VAT article 21.º allows back. */
  deductibility: DeductibilityKey;
}

export interface PurchaseVatLine extends PurchaseGroup {
  vatCharged: number;
  vatDeductible: number;
}

/**
 * Input VAT, after article 21.º.
 *
 * The deductible figure is what can be reclaimed; the charged figure is what
 * was paid. Showing both makes the restriction visible — an owner who sees
 * only the deductible number has no way to notice they are losing VAT on a
 * category that could be reclassified.
 */
export function purchaseVat(groups: PurchaseGroup[]): {
  lines: PurchaseVatLine[];
  totalCharged: number;
  totalDeductible: number;
} {
  const lines = groups.map((g) => {
    const vatCharged = vatFromGross(g.gross, g.vatRate);
    return {
      ...g,
      vatCharged,
      vatDeductible: vatCharged * DEDUCTIBILITY[g.deductibility].rate,
    };
  });

  return {
    lines,
    totalCharged: lines.reduce((s, l) => s + l.vatCharged, 0),
    totalDeductible: lines.reduce((s, l) => s + l.vatDeductible, 0),
  };
}

export interface VatReturn {
  year: number;
  quarter: Quarter;
  salesLines: SalesVatLine[];
  purchaseLines: PurchaseVatLine[];
  outputVat: number;
  deductibleVat: number;
  /** Positive means owed to the state; negative is a credit carried forward. */
  balance: number;
  payable: number;
  credit: number;
  deadline: VatDeadline | null;
}

export function vatReturn(input: {
  year: number;
  quarter: Quarter;
  grossRevenue: number;
  mix: SalesMix;
  purchases: PurchaseGroup[];
  region?: Region;
}): VatReturn {
  const sales = salesVat(input.grossRevenue, input.mix, input.region ?? 'continente');
  const purchases = purchaseVat(input.purchases);
  const balance = sales.totalVat - purchases.totalDeductible;

  return {
    year: input.year,
    quarter: input.quarter,
    salesLines: sales.lines,
    purchaseLines: purchases.lines,
    outputVat: sales.totalVat,
    deductibleVat: purchases.totalDeductible,
    balance,
    // A negative balance is not a negative payment: it is a credit, which
    // carries forward by default rather than being refunded.
    payable: Math.max(0, balance),
    credit: Math.max(0, -balance),
    deadline: deadlineFor(input.year, input.quarter),
  };
}

// ── IRC ────────────────────────────────────────────────────────────────────

export interface IrcInput {
  year: number;
  /** Accounting profit before tax. */
  accountingProfit: number;
  /** Expenses added back because they are not deductible. */
  addBacks?: number;
  /** Losses carried forward from earlier years. */
  lossesCarriedForward?: number;
  /** Whether the company qualifies for the reduced PME rate. */
  isPme?: boolean;
  /** The council's rate, capped at the statutory maximum. */
  derramaMunicipalRate?: number;
  /** Vehicle running costs subject to autonomous taxation. */
  vehicleExpenses?: number;
  /** Acquisition cost of the vehicle, which decides the bracket. */
  vehicleValue?: number;
  representationExpenses?: number;
  undocumentedExpenses?: number;
  /** Instalments already paid during the year. */
  paymentsOnAccount?: number;
}

export interface IrcEstimate {
  year: number;
  taxableProfit: number;
  lossesUsed: number;
  taxableIncome: number;
  /** The PME tranche and the rest, priced separately. */
  bands: Array<{ label: string; amount: number; rate: number; tax: number }>;
  collecta: number;
  derramaMunicipal: number;
  derramaEstadual: number;
  autonomousTax: number;
  autonomousLines: Array<{ label: string; base: number; rate: number; tax: number }>;
  totalTax: number;
  paymentsOnAccount: number;
  /** Positive is owed; negative is recoverable. */
  balance: number;
  /** True when the year is a loss but tax is still due on autonomous items. */
  taxDespiteLoss: boolean;
}

export function estimateIrc(input: IrcInput): IrcEstimate {
  const rules = ircForYear(input.year);

  const taxableProfit = input.accountingProfit + (input.addBacks ?? 0);

  // Losses offset at most 65% of taxable profit, and only against a profit.
  const available = input.lossesCarriedForward ?? 0;
  const lossesUsed =
    taxableProfit > 0 ? Math.min(available, taxableProfit * LOSS_CARRYFORWARD_CAP) : 0;

  const taxableIncome = Math.max(0, taxableProfit - lossesUsed);

  const bands: IrcEstimate['bands'] = [];
  if (taxableIncome > 0) {
    if (input.isPme !== false) {
      const first = Math.min(taxableIncome, rules.pmeLimit);
      bands.push({
        label: `Até ${rules.pmeLimit.toLocaleString('pt-PT')} €`,
        amount: first,
        rate: rules.pme,
        tax: first * (rules.pme / 100),
      });
      const rest = taxableIncome - first;
      if (rest > 0) {
        bands.push({
          label: `Acima de ${rules.pmeLimit.toLocaleString('pt-PT')} €`,
          amount: rest,
          rate: rules.standard,
          tax: rest * (rules.standard / 100),
        });
      }
    } else {
      bands.push({
        label: 'Taxa geral',
        amount: taxableIncome,
        rate: rules.standard,
        tax: taxableIncome * (rules.standard / 100),
      });
    }
  }

  const collecta = bands.reduce((s, b) => s + b.tax, 0);

  // Derrama municipal falls on taxable profit, not on the collecta.
  const derramaRate = Math.min(input.derramaMunicipalRate ?? 0, DERRAMA_MUNICIPAL_MAX);
  const derramaMunicipal = taxableProfit > 0 ? taxableProfit * (derramaRate / 100) : 0;

  const derramaEstadual = 0; // Only above €1.5M; not reached by a restaurant.

  // Autonomous taxation is charged on the expense whether or not the year
  // made a profit — the part owners are least ready for.
  const isLoss = taxableProfit < 0;
  const aggravation =
    isLoss && !rules.lossAggravationSuspended ? TRIBUTACAO_AUTONOMA.lossAggravation : 0;

  const autonomousLines: IrcEstimate['autonomousLines'] = [];

  if ((input.vehicleExpenses ?? 0) > 0) {
    const value = input.vehicleValue ?? 0;
    const bracket =
      TRIBUTACAO_AUTONOMA.vehicle.find((b) => value < b.under) ??
      TRIBUTACAO_AUTONOMA.vehicle[TRIBUTACAO_AUTONOMA.vehicle.length - 1];
    const rate = bracket.rate + aggravation;
    autonomousLines.push({
      label: 'Despesas com viaturas',
      base: input.vehicleExpenses!,
      rate,
      tax: input.vehicleExpenses! * (rate / 100),
    });
  }

  if ((input.representationExpenses ?? 0) > 0) {
    const rate = TRIBUTACAO_AUTONOMA.representation + aggravation;
    autonomousLines.push({
      label: 'Despesas de representação',
      base: input.representationExpenses!,
      rate,
      tax: input.representationExpenses! * (rate / 100),
    });
  }

  if ((input.undocumentedExpenses ?? 0) > 0) {
    const rate = TRIBUTACAO_AUTONOMA.undocumented + aggravation;
    autonomousLines.push({
      label: 'Despesas não documentadas',
      base: input.undocumentedExpenses!,
      rate,
      tax: input.undocumentedExpenses! * (rate / 100),
    });
  }

  const autonomousTax = autonomousLines.reduce((s, l) => s + l.tax, 0);
  const totalTax = collecta + derramaMunicipal + derramaEstadual + autonomousTax;
  const paid = input.paymentsOnAccount ?? 0;

  return {
    year: input.year,
    taxableProfit,
    lossesUsed,
    taxableIncome,
    bands,
    collecta,
    derramaMunicipal,
    derramaEstadual,
    autonomousTax,
    autonomousLines,
    totalTax,
    paymentsOnAccount: paid,
    balance: totalTax - paid,
    taxDespiteLoss: isLoss && autonomousTax > 0,
  };
}

/**
 * Next year's instalments, from this year's tax.
 *
 * The pagamento especial por conta is deliberately absent: it was abolished
 * by Lei n.º 12/2022 and several guides still describe it.
 */
export function paymentsOnAccount(input: {
  previousCollecta: number;
  withholdings?: number;
  turnover: number;
}): { total: number; perInstalment: number; exempt: boolean } {
  const net = Math.max(0, input.previousCollecta - (input.withholdings ?? 0));

  if (net <= PAGAMENTOS_POR_CONTA.exemptBelow) {
    return { total: 0, perInstalment: 0, exempt: true };
  }

  const rate =
    input.turnover > PAGAMENTOS_POR_CONTA.turnoverLimit
      ? PAGAMENTOS_POR_CONTA.higherRate
      : PAGAMENTOS_POR_CONTA.lowerRate;

  const total = net * rate;
  return {
    total,
    // Rounded up to the euro, as the code requires.
    perInstalment: Math.ceil(total / PAGAMENTOS_POR_CONTA.instalments),
    exempt: false,
  };
}
