/**
 * "Precisa de ti": every decision the app is waiting on, in one list.
 *
 * Nothing here is detected for the first time. Overdue payments, purchases
 * counted twice, suppliers recorded twice, lines with no category, documents
 * running out — each was already found somewhere, on its own tab, where an
 * owner had to go and look. This puts them together, worst first, each with
 * what is at stake and a button to where it is fixed.
 *
 * Pure: the server counts, this decides what to show and in what order.
 */

export const INBOX_KINDS = [
  'overdue',
  'duplicateCosts',
  'complianceExpired',
  'uncategorisedLines',
  'uncategorisedCosts',
  'duplicateVendors',
  'complianceExpiring',
] as const;
export type InboxKind = (typeof INBOX_KINDS)[number];

export type InboxSeverity = 'high' | 'medium' | 'low';

/** Where each item is fixed: a dashboard tab, and the view inside it. */
export interface InboxTarget {
  tab: 'accounting' | 'costs' | 'compliance';
  view?: 'payments' | 'tidy' | 'lines' | 'history';
  filter?: 'overdue';
}

export interface InboxCounts {
  overdue: { count: number; total: number };
  duplicateCosts: { count: number; total: number };
  duplicateVendors: number;
  uncategorisedLines: { count: number; total: number };
  uncategorisedCosts: { count: number; total: number };
  complianceExpired: number;
  complianceExpiring: number;
}

export interface InboxItem {
  kind: InboxKind;
  count: number;
  /** Euros at stake, or null when the item is not about money. */
  amount: number | null;
  severity: InboxSeverity;
  target: InboxTarget;
}

const SEVERITY: Record<InboxKind, InboxSeverity> = {
  // Money already late, a cost counted twice, a licence already lapsed:
  // each is wrong today.
  overdue: 'high',
  duplicateCosts: 'high',
  complianceExpired: 'high',
  // The numbers are incomplete until these are sorted.
  uncategorisedLines: 'medium',
  uncategorisedCosts: 'medium',
  // Worth doing, not urgent.
  duplicateVendors: 'low',
  complianceExpiring: 'low',
};

const TARGET: Record<InboxKind, InboxTarget> = {
  overdue: { tab: 'accounting', view: 'payments', filter: 'overdue' },
  duplicateCosts: { tab: 'accounting', view: 'tidy' },
  duplicateVendors: { tab: 'accounting', view: 'tidy' },
  uncategorisedLines: { tab: 'accounting', view: 'lines' },
  uncategorisedCosts: { tab: 'costs', view: 'history' },
  complianceExpired: { tab: 'compliance' },
  complianceExpiring: { tab: 'compliance' },
};

const RANK: Record<InboxSeverity, number> = { high: 0, medium: 1, low: 2 };

/** The items worth showing: nothing at zero, worst first, then most money. */
export function buildInbox(c: InboxCounts): InboxItem[] {
  const raw: Array<{ kind: InboxKind; count: number; amount: number | null }> = [
    { kind: 'overdue', count: c.overdue.count, amount: c.overdue.total },
    { kind: 'duplicateCosts', count: c.duplicateCosts.count, amount: c.duplicateCosts.total },
    { kind: 'duplicateVendors', count: c.duplicateVendors, amount: null },
    { kind: 'uncategorisedLines', count: c.uncategorisedLines.count, amount: c.uncategorisedLines.total },
    { kind: 'uncategorisedCosts', count: c.uncategorisedCosts.count, amount: c.uncategorisedCosts.total },
    { kind: 'complianceExpired', count: c.complianceExpired, amount: null },
    { kind: 'complianceExpiring', count: c.complianceExpiring, amount: null },
  ];

  return raw
    .filter((r) => r.count > 0)
    .map((r) => ({ ...r, severity: SEVERITY[r.kind], target: TARGET[r.kind] }))
    .sort((a, b) =>
      RANK[a.severity] - RANK[b.severity]
      || (b.amount ?? 0) - (a.amount ?? 0)
      || INBOX_KINDS.indexOf(a.kind) - INBOX_KINDS.indexOf(b.kind));
}

/** How many decisions, and how much money, across a list of items. */
export function inboxTotals(items: InboxItem[]): { count: number; amount: number; urgent: number } {
  return {
    count: items.reduce((s, i) => s + i.count, 0),
    amount: Math.round(items.reduce((s, i) => s + (i.amount ?? 0), 0) * 100) / 100,
    urgent: items.filter((i) => i.severity === 'high').reduce((s, i) => s + i.count, 0),
  };
}
