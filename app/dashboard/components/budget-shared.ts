/**
 * What the budget's views agree on: how a line is named, how a band is
 * painted, and how a typed amount is read.
 *
 * Not a component, so it holds keys and the views translate them.
 */

import type { BudgetSection, PlanLine } from '@/lib/budget';
import type { BudgetCategory } from '../budget-actions';
import { formatMoney } from '@/lib/format';
import type { Section } from './pnl-shared';

/** The budget's bands painted as the P&L paints them, so the two read as one. */
export const SECTION_STYLE: Record<BudgetSection, Section> = {
  REVENUE: 'revenue',
  COGS: 'cogs',
  LABOUR: 'labour',
  OPEX: 'opex',
  OCCUPANCY: 'occupancy',
};

/**
 * A line's name in the interface language.
 *
 * The owner's own wording wins; then the category's name, which is theirs too
 * and never translated; then the channel or "uncategorised", which are ours.
 */
export function lineName(
  line: Pick<PlanLine, 'label' | 'categoryId' | 'channel'>,
  categories: BudgetCategory[],
  t: (key: string) => string
): string {
  if (line.label) return line.label;
  if (line.categoryId) {
    const category = categories.find((c) => c.id === line.categoryId);
    if (category) return category.name;
  }
  if (line.channel) return t(`budget.channel.${line.channel}`);
  return t('annualPnl.line.uncategorised');
}

/** A whole-euro figure for a cell, or a dash for nothing. */
export function cellMoney(value: number): string {
  return value === 0 ? '—' : formatMoney(value);
}

/** Signed, for a variance or an effect: "+€1.200" / "−€800". */
export function signedMoney(value: number): string {
  const rounded = Math.round(value);
  if (rounded === 0) return formatMoney(0);
  return `${rounded > 0 ? '+' : '−'}${formatMoney(Math.abs(rounded))}`;
}

/** Fills `{name}` placeholders in a dictionary string. */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match
  );
}
