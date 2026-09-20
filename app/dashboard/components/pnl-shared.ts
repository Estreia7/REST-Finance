/**
 * What the annual statement's two views agree on.
 *
 * The desktop shows twelve months across; the phone shows one month top to
 * bottom. They are genuinely different presentations — not one layout with
 * breakpoints — but they must never disagree about what a band is, what
 * colour it carries, or what a figure means. So the shape and the styling
 * live here and both views import them.
 */

export type Line = {
  /**
   * The line's own name.
   *
   * Detail rows carry the owner's own category names, which are never
   * translated. The standard statement lines carry `labelKey` instead and the
   * views translate it, so "Custo das mercadorias vendidas" reads as "Cost of
   * goods sold" without a `t()` call in a non-React module.
   */
  label: string;
  /** Dictionary key under `annualPnl.line`, on the standard lines only. */
  labelKey?: string;
  months: number[];
  total: number;
  percentOfRevenue: number | null;
  drill: {
    kind: 'revenue' | 'cogs' | 'opex';
    categoryId?: string;
    channel?: 'total' | 'dineIn' | 'takeaway';
  } | null;
};

export type Annual = {
  year: number;
  revenue: Line;
  dineIn: Line;
  takeaway: Line;
  /**
   * Revenue by menu category, where the POS import has supplied it. Empty for
   * a restaurant that enters a day's takings by hand, because a total says
   * nothing about what was sold.
   */
  revenueLines: Line[];
  cogs: Line;
  cogsLines: Line[];
  labour: Line;
  labourLines: Line[];
  primeCost: Line;
  opex: Line;
  opexLines: Line[];
  controllableIncome: Line;
  occupancy: Line;
  occupancyLines: Line[];
  netIncome: Line;
};

/**
 * The months, as dictionary keys rather than words.
 *
 * This module is imported by both views and is not a component, so it holds
 * keys and the views translate them. The index is the month, January first.
 */
export const MONTH_KEYS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
] as const;

/**
 * How each band of the statement is painted.
 *
 * Colour here means "which part of the statement is this", never "is this good
 * or bad" — a red row would collide with the compliance indicators, and on a
 * P&L a large cost figure is not itself a problem. The tints are deliberately
 * pale: the figures are the content, and a band that competes with them has
 * gone too far.
 */
export type Section = 'revenue' | 'cogs' | 'labour' | 'opex' | 'occupancy' | 'result';

export const SECTION: Record<
  Section,
  { head: string; body: string; bodySolid: string; accent: string; rule: string }
> = {
  revenue: {
    head: 'bg-pnl-revenue-bg text-pnl-revenue',
    body: 'bg-pnl-revenue-bg/40',
    // Pinned columns need an opaque fill: a translucent tint lets the months
    // scroll underneath and print through the figures.
    bodySolid: 'bg-[hsl(var(--pnl-revenue-bg))]',
    accent: 'bg-pnl-revenue',
    rule: 'border-pnl-revenue/25',
  },
  cogs: {
    head: 'bg-pnl-cogs-bg text-pnl-cogs',
    body: 'bg-pnl-cogs-bg/40',
    bodySolid: 'bg-[hsl(var(--pnl-cogs-bg))]',
    accent: 'bg-pnl-cogs',
    rule: 'border-pnl-cogs/25',
  },
  labour: {
    head: 'bg-pnl-labour-bg text-pnl-labour',
    body: 'bg-pnl-labour-bg/40',
    bodySolid: 'bg-[hsl(var(--pnl-labour-bg))]',
    accent: 'bg-pnl-labour',
    rule: 'border-pnl-labour/25',
  },
  opex: {
    head: 'bg-pnl-opex-bg text-pnl-opex',
    body: 'bg-pnl-opex-bg/40',
    bodySolid: 'bg-[hsl(var(--pnl-opex-bg))]',
    accent: 'bg-pnl-opex',
    rule: 'border-pnl-opex/25',
  },
  occupancy: {
    head: 'bg-pnl-occupancy-bg text-pnl-occupancy',
    body: 'bg-pnl-occupancy-bg/40',
    bodySolid: 'bg-[hsl(var(--pnl-occupancy-bg))]',
    accent: 'bg-pnl-occupancy',
    rule: 'border-pnl-occupancy/25',
  },
  result: {
    head: 'bg-pnl-result-bg text-foreground',
    body: 'bg-pnl-result-bg/50',
    bodySolid: 'bg-[hsl(var(--pnl-result-bg))]',
    accent: 'bg-accent',
    rule: 'border-border',
  },
};

/** Reuses the lamp tokens, so a red here means what a red means elsewhere. */
export const HEALTH_DOT: Record<string, string> = {
  good: 'bg-lamp-success',
  watch: 'bg-lamp-warning',
  bad: 'bg-lamp-danger',
  unknown: 'bg-muted-foreground/30',
};

export const HEALTH_TEXT: Record<string, string> = {
  good: 'text-success',
  watch: 'text-warning',
  bad: 'text-danger',
  unknown: 'text-muted-foreground',
};
