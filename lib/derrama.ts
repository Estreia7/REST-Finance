/**
 * Derrama municipal: what each council charges on taxable profit, and which
 * of its rates applies to this restaurant.
 *
 * The rates come from the Tax Authority's yearly circular (for the 2025 tax
 * period, Ofício Circulado 20288 of 2026-02-02), one table per tax period.
 * A council sets a general rate of up to 1.5% and may add reduced rates or
 * exemptions — most often for a turnover under €150,000 in the previous
 * period. 90 of the 308 councils charge nothing at all.
 *
 * The owner picks the council once, in the restaurant's settings, and then
 * which of its rates applies, on the tax screen. Their choice is stored, not
 * the number, so a new year's table reaches the estimate on its own.
 */

import { MUNICIPALITIES, type Municipality } from './municipalities';
import { DERRAMA_2025 } from './derrama-2025';

export type DerramaCriterion = 'turnover' | 'jobs' | 'sector' | 'other';

export interface DerramaRule {
  kind: 'reduced' | 'exempt';
  /** Percent of taxable profit; 0 for an exemption. */
  rate: number;
  criterion: DerramaCriterion | null;
  /** The council's condition, word for word from the circular. */
  scope: string;
  /**
   * Set only when the condition is purely "turnover in the previous period
   * not above €X", so it can be compared with the restaurant's own figure.
   */
  turnoverMax: number | null;
}

export interface MunicipalDerrama {
  /** Null when the council charges no derrama for the period. */
  generalRate: number | null;
  rules: DerramaRule[];
}

export interface DerramaTable {
  taxYear: number;
  /** Where the table comes from, for the owner and for whoever updates it. */
  source: string;
  byCode: Record<string, MunicipalDerrama>;
}

/** The legal ceiling (Lei 73/2013, art. 18.º). */
export const DERRAMA_MUNICIPAL_CEILING = 1.5;

const TABLES: DerramaTable[] = [DERRAMA_2025];

/**
 * The table for a tax period: that year's if published, otherwise the most
 * recent one before it (the circular comes out early the following year, so
 * the current year is always estimated on last year's rates), otherwise the
 * earliest there is.
 */
export function derramaTableFor(taxYear: number): { table: DerramaTable; exact: boolean } {
  const sorted = [...TABLES].sort((a, b) => a.taxYear - b.taxYear);
  const exact = sorted.find((t) => t.taxYear === taxYear);
  if (exact) return { table: exact, exact: true };
  const before = sorted.filter((t) => t.taxYear < taxYear).pop();
  return { table: before ?? sorted[0], exact: false };
}

export function findMunicipality(code: string | null | undefined): Municipality | null {
  if (!code) return null;
  return MUNICIPALITIES.find((m) => m.code === code) ?? null;
}

/**
 * The owner's answer to "which of the council's rates is yours?".
 *   general — the council's general rate (the default: it never understates)
 *   rule:Y:i — rule i of tax period Y's table
 *   manual  — a rate typed by hand, for whoever knows better than the table
 */
export type DerramaChoice = 'general' | 'manual' | `rule:${number}:${number}`;

export function isDerramaChoice(value: unknown): value is DerramaChoice {
  return value === 'general' || value === 'manual' ||
    (typeof value === 'string' && /^rule:\d{4}:\d{1,2}$/.test(value));
}

export function ruleChoice(taxYear: number, index: number): DerramaChoice {
  return `rule:${taxYear}:${index}`;
}

export type DerramaSource =
  | 'manual'        // no council chosen, or the owner typed the rate
  | 'none'          // the council charges no derrama this period
  | 'general'
  | 'rule';

export interface ResolvedDerrama {
  rate: number;
  source: DerramaSource;
  /** The table that was read, when one was. */
  tableYear: number | null;
  /** False when the period's own table is not out yet and an older one was used. */
  exactYear: boolean;
  /** The rule applied, when `source` is "rule". */
  rule: DerramaRule | null;
  /** The chosen rule belongs to another year's table; fell back to general. */
  choiceOutdated: boolean;
}

/** The rate the estimate uses, and why. */
export function resolveDerrama(input: {
  municipalityCode: string | null | undefined;
  choice: DerramaChoice | undefined;
  manualRate: number;
  taxYear: number;
}): ResolvedDerrama {
  const manual = clampRate(input.manualRate);
  const base = { tableYear: null, exactYear: false, rule: null, choiceOutdated: false };

  if (!input.municipalityCode || input.choice === 'manual') {
    return { ...base, rate: manual, source: 'manual' };
  }

  const { table, exact } = derramaTableFor(input.taxYear);
  const council = table.byCode[input.municipalityCode];
  if (!council) return { ...base, rate: manual, source: 'manual' };

  const found = { tableYear: table.taxYear, exactYear: exact };

  // A council that charges nothing charges nothing, whatever was chosen.
  if (council.generalRate === null) {
    return { ...base, ...found, rate: 0, source: 'none' };
  }

  const general = { ...base, ...found, rate: clampRate(council.generalRate), source: 'general' as const };

  const match = input.choice?.match(/^rule:(\d{4}):(\d+)$/);
  if (!match) return general;

  const [, year, index] = match;
  if (Number(year) !== table.taxYear) return { ...general, choiceOutdated: true };

  const rule = council.rules[Number(index)];
  if (!rule) return { ...general, choiceOutdated: true };

  return {
    ...base,
    ...found,
    rate: rule.kind === 'exempt' ? 0 : clampRate(rule.rate),
    source: 'rule',
    rule,
  };
}

function clampRate(rate: number): number {
  if (!Number.isFinite(rate)) return 0;
  return Math.min(Math.max(rate, 0), DERRAMA_MUNICIPAL_CEILING);
}

/**
 * Whether a turnover-only rule's condition is met by the turnover the app
 * holds for the previous period. Null when the rule is not that kind, or
 * when there is no turnover on record to judge by.
 */
export function turnoverRuleMet(rule: DerramaRule, previousTurnover: number | null): boolean | null {
  if (rule.turnoverMax === null || previousTurnover === null || previousTurnover <= 0) return null;
  return previousTurnover <= rule.turnoverMax;
}
