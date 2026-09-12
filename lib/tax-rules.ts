/**
 * Portuguese tax rules, as dated data rather than constants.
 *
 * Every rate here has changed recently or is legislated to change: IVA's
 * scope moved in 2024, IRC fell in 2024, 2025 and 2026 and is already in law
 * to fall again in 2027 and 2028. A rate written into a calculation is a rate
 * that will quietly be wrong next January, so each one carries the year it
 * applies to and the lookup picks by year.
 *
 * Sources are named against each figure. A tax rule without a citation is
 * indistinguishable from a guess, and the person checking this a year from now
 * needs to know where to verify it.
 *
 * This is not tax advice, and the app must say so: the owner's contabilista
 * certificado signs off on the real return. The purpose here is to let an
 * owner see roughly what is coming before the accountant tells them.
 */

export type Region = 'continente' | 'acores' | 'madeira';

/**
 * IVA rates by region.
 *
 * Source: Código do IVA, Listas I e II; regional rates per art. 18.º n.º 3.
 * Verified September 2026; unchanged by OE2026.
 */
export const IVA_RATES: Record<Region, { normal: number; intermedia: number; reduzida: number }> = {
  continente: { normal: 23, intermedia: 13, reduzida: 6 },
  acores: { normal: 16, intermedia: 9, reduzida: 4 },
  madeira: { normal: 22, intermedia: 12, reduzida: 5 },
};

/**
 * What a restaurant charges on what it sells.
 *
 * The important and widely-mis-stated part: OE2024 (Lei n.º 82/2023) cut the
 * exclusions in verba 3.1 da Lista II from five categories down to two. Since
 * 1 January 2024 juices, nectars and carbonated water are charged at the
 * intermediate rate, not the normal one — only alcohol and refrigerantes
 * remain at 23%. Confirmed by Ofício Circulado n.º 25018 of 10 January 2024.
 * Much published guidance still carries the pre-2024 list.
 *
 * Takeaway is the same rate as dining in, and has been since 2016 (verba
 * 1.8). The belief that takeaway is 23% is common and wrong.
 */
export type SalesVatClass = 'food' | 'softDrink' | 'refrigerante' | 'alcohol';

export const SALES_VAT_CLASSES: Array<{
  key: SalesVatClass;
  label: string;
  hint: string;
  /** Which of the three regional rates applies. */
  band: 'normal' | 'intermedia' | 'reduzida';
}> = [
  {
    key: 'food',
    label: 'Refeições e comida',
    hint: 'Pratos, sobremesas, pão servido à mesa. Take-away conta igual ao consumo no local.',
    band: 'intermedia',
  },
  {
    key: 'softDrink',
    label: 'Café, águas e sumos',
    hint: 'Café, chá, água (lisa ou com gás), sumos e néctares. Desde 2024 estão à taxa intermédia.',
    band: 'intermedia',
  },
  {
    key: 'refrigerante',
    label: 'Refrigerantes',
    hint: 'Coca-Cola, gasosas e água tónica. A água tónica conta como refrigerante para a AT.',
    band: 'normal',
  },
  {
    key: 'alcohol',
    label: 'Bebidas alcoólicas',
    hint: 'Vinho, cerveja, destilados.',
    band: 'normal',
  },
];

/**
 * How much of the VAT on a purchase can be reclaimed.
 *
 * Article 21.º CIVA excludes several categories outright. The carve-out in
 * n.º 2 is what makes a restaurant work: food and drink bought to be sold on
 * is fully deductible, because selling it is the object of the business. The
 * same invoice for the same food is 0% deductible when it is entertainment.
 *
 * That is why this cannot be inferred from the supplier and has to be a
 * property of the cost category the owner chose.
 */
export type DeductibilityKey = 'full' | 'fuel50' | 'none';

export const DEDUCTIBILITY: Record<
  DeductibilityKey,
  { rate: number; label: string; hint: string }
> = {
  full: {
    rate: 1,
    label: '100% dedutível',
    hint: 'Mercadorias para revenda, renda, luz, água, equipamento, refeições do pessoal.',
  },
  fuel50: {
    rate: 0.5,
    label: '50% dedutível',
    hint: 'Gasóleo, GPL e gás natural. A gasolina não dá direito a dedução nenhuma.',
  },
  none: {
    rate: 0,
    label: 'Não dedutível',
    hint: 'Deslocações e estadias, representação, gasolina, viaturas de turismo (art. 21.º CIVA).',
  },
};

/**
 * Where a cost type lands by default.
 *
 * COGS is a restaurant's stock for resale, which is the article 21.º n.º 2
 * exception and fully deductible. OPEX is mixed — rent and electricity are
 * deductible, travel and entertainment are not — so it defaults to full and
 * the owner corrects the exceptions. Defaulting OPEX to zero would understate
 * every deduction and alarm an owner over nothing.
 */
export const DEFAULT_DEDUCTIBILITY: Record<'COGS' | 'OPEX', DeductibilityKey> = {
  COGS: 'full',
  OPEX: 'full',
};

/**
 * The VAT rate a restaurant pays on what it buys.
 *
 * Unlike sales, purchases span every rate — food at 6%, some at 13%, services
 * and equipment at 23%. Without VAT recorded per invoice there is no way to
 * know, so this is the assumption the estimate rests on, and the UI says so.
 */
export const ASSUMED_PURCHASE_VAT: Record<'COGS' | 'OPEX', number> = {
  // Ingredients are mostly at the reduced rate, with some at intermediate.
  COGS: 6,
  // Rent is exempt, but electricity, gas and most services are at 23%.
  OPEX: 23,
};

// ── IVA periodicity and deadlines ──────────────────────────────────────────

/**
 * Turnover threshold that decides monthly versus quarterly filing.
 * Art. 41.º CIVA. Below it, quarterly is the default.
 */
export const QUARTERLY_THRESHOLD = 650_000;

export type VatPeriodicity = 'quarterly' | 'monthly';

/**
 * When a quarter's return is due.
 *
 * The statutory rule is the 20th of the second month following, with payment
 * on the 25th. Two things break a naive calculation of that:
 *
 *   - Obligations falling due in August move to September (art. 57.º-A LGT),
 *     so Q2 is not 20 August.
 *   - Deadlines do not roll off weekends automatically; AT issues a despacho.
 *
 * So the dates are tabulated per year rather than computed, and the table is
 * the thing to update each year against AT's published calendar. Computing
 * them would be wrong in a way that is invisible until someone misses a
 * filing.
 */
export interface VatDeadline {
  quarter: 1 | 2 | 3 | 4;
  /** ISO date the declaration is due. */
  submit: string;
  /** ISO date payment is due. */
  pay: string;
}

export const VAT_DEADLINES: Record<number, VatDeadline[]> = {
  2026: [
    { quarter: 1, submit: '2026-05-20', pay: '2026-05-25' },
    // Deferred out of August, then off the Sunday: 21 September, not 20 August.
    { quarter: 2, submit: '2026-09-21', pay: '2026-09-25' },
    { quarter: 3, submit: '2026-11-20', pay: '2026-11-25' },
    { quarter: 4, submit: '2027-02-22', pay: '2027-02-25' },
  ],
  2027: [
    { quarter: 1, submit: '2027-05-20', pay: '2027-05-25' },
    { quarter: 2, submit: '2027-09-20', pay: '2027-09-27' },
    { quarter: 3, submit: '2027-11-22', pay: '2027-11-25' },
    { quarter: 4, submit: '2028-02-21', pay: '2028-02-25' },
  ],
};

/** Refund thresholds, art. 22.º CIVA. Below these the credit carries forward. */
export const VAT_REFUND = {
  /** After 12 months of credit, above this amount. */
  standard: 250,
  /** Sooner than 12 months, above this amount. */
  early: 3_000,
};

// ── IRC ────────────────────────────────────────────────────────────────────

/**
 * IRC rates by year.
 *
 * 2026 figures are Lei n.º 73-A/2025 (OE2026), enacted. 2027 and 2028 are
 * already legislated, which is exactly why this is a table: writing 19% into
 * a calculation guarantees a wrong answer in fifteen months.
 *
 * A restaurant will normally qualify as a PME, so the first tranche rate is
 * the one that matters.
 */
export interface IrcYear {
  /** Rate on taxable income above the PME tranche. */
  standard: number;
  /** Reduced rate for PMEs on the first tranche. */
  pme: number;
  /** Size of that first tranche, in euros. */
  pmeLimit: number;
  /**
   * Whether the extra 10 points on autonomous taxation for a loss-making year
   * is suspended. Renewed year by year in each budget law, so it is data.
   */
  lossAggravationSuspended: boolean;
}

export const IRC_BY_YEAR: Record<number, IrcYear> = {
  2024: { standard: 21, pme: 17, pmeLimit: 50_000, lossAggravationSuspended: false },
  2025: { standard: 20, pme: 16, pmeLimit: 50_000, lossAggravationSuspended: true },
  2026: { standard: 19, pme: 15, pmeLimit: 50_000, lossAggravationSuspended: true },
  // Legislated in Lei n.º 73-A/2025. The suspension beyond 2026 is not yet
  // law, so it is assumed lapsed rather than optimistically carried forward.
  2027: { standard: 18, pme: 15, pmeLimit: 50_000, lossAggravationSuspended: false },
  2028: { standard: 17, pme: 15, pmeLimit: 50_000, lossAggravationSuspended: false },
};

/** The most recent year we hold rates for, for anything beyond the table. */
export function ircForYear(year: number): IrcYear {
  if (IRC_BY_YEAR[year]) return IRC_BY_YEAR[year];
  const years = Object.keys(IRC_BY_YEAR).map(Number).sort((a, b) => a - b);
  const latest = years[years.length - 1];
  return IRC_BY_YEAR[year > latest ? latest : years[0]];
}

/**
 * Derrama municipal.
 *
 * Each council sets its own, up to 1.5%, on taxable profit. Many exempt or
 * reduce it below a turnover threshold. There is no national table worth
 * shipping, so the rate is the owner's to enter — with the ceiling enforced.
 */
export const DERRAMA_MUNICIPAL_MAX = 1.5;

/**
 * Derrama estadual, on taxable profit above 1.5M.
 * Included for completeness; a single restaurant will not reach it.
 */
export const DERRAMA_ESTADUAL_BANDS = [
  { from: 1_500_000, to: 7_500_000, rate: 3 },
  { from: 7_500_000, to: 35_000_000, rate: 5 },
  { from: 35_000_000, to: Infinity, rate: 9 },
];

/**
 * Autonomous taxation, art. 88.º CIRC.
 *
 * Vehicle brackets were raised by €10,000 in OE2025. These are charged on the
 * expense regardless of whether the company made a profit, which is what
 * surprises owners: a loss-making year still produces a tax bill.
 */
export const TRIBUTACAO_AUTONOMA = {
  vehicle: [
    { under: 37_500, rate: 8 },
    { under: 45_000, rate: 25 },
    { under: Infinity, rate: 32 },
  ],
  undocumented: 50,
  representation: 10,
  /** Extra points when the year closes at a tax loss, unless suspended. */
  lossAggravation: 10,
};

/**
 * Pagamentos por conta, art. 105.º CIRC.
 *
 * The pagamento especial por conta was abolished by Lei n.º 12/2022 and is
 * deliberately absent. Several guides still describe it; it no longer exists.
 */
export const PAGAMENTOS_POR_CONTA = {
  /** Share of last year's net collecta, for turnover at or below the limit. */
  lowerRate: 0.8,
  higherRate: 0.95,
  turnoverLimit: 500_000,
  /** No instalments due when last year's net collecta was this small. */
  exemptBelow: 200,
  instalments: 3,
  /** Day and month of each instalment. */
  dueDates: [
    { month: 7, day: 31 },
    { month: 9, day: 30 },
    { month: 12, day: 15 },
  ],
};

/**
 * Modelo 22 deadline.
 *
 * Statutorily 31 May, but AT extended it in consecutive years — for tax year
 * 2025 it moved twice, ending at 30 June 2026. Held as a default that can be
 * overridden rather than as a fact.
 */
export const MODELO22 = { month: 5, day: 31 };

/** Carried-forward losses offset at most this share of taxable profit. */
export const LOSS_CARRYFORWARD_CAP = 0.65;
