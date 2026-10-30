import { describe, it, expect } from 'vitest';
import { buildInbox, inboxTotals, type InboxCounts } from '@/lib/inbox';

const none: InboxCounts = {
  overdue: { count: 0, total: 0 },
  duplicateCosts: { count: 0, total: 0 },
  duplicateVendors: 0,
  bankOpen: { count: 0, total: 0 },
  emailInvoices: { count: 0, total: 0 },
  uncategorisedLines: { count: 0, total: 0 },
  uncategorisedCosts: { count: 0, total: 0 },
  complianceExpired: 0,
  complianceExpiring: 0,
};

describe('buildInbox', () => {
  it('is empty when nothing is waiting', () => {
    expect(buildInbox(none)).toEqual([]);
  });

  it('puts what is wrong today before what is merely untidy', () => {
    const items = buildInbox({
      ...none,
      duplicateVendors: 3,
      uncategorisedLines: { count: 12, total: 900 },
      overdue: { count: 2, total: 150 },
    });
    expect(items.map((i) => i.kind)).toEqual(['overdue', 'uncategorisedLines', 'duplicateVendors']);
  });

  it('orders the same severity by money at stake', () => {
    const items = buildInbox({
      ...none,
      overdue: { count: 1, total: 100 },
      duplicateCosts: { count: 1, total: 800 },
      complianceExpired: 1,
    });
    expect(items.map((i) => i.kind)).toEqual(['duplicateCosts', 'overdue', 'complianceExpired']);
  });

  it('sends each item to where it is fixed', () => {
    const [overdue] = buildInbox({ ...none, overdue: { count: 1, total: 10 } });
    expect(overdue.target).toEqual({ tab: 'accounting', view: 'payments', filter: 'overdue' });
  });
});

describe('inboxTotals', () => {
  it('adds counts and money, and counts the urgent ones apart', () => {
    const items = buildInbox({
      ...none,
      overdue: { count: 2, total: 150.1 },
      uncategorisedCosts: { count: 3, total: 49.95 },
      complianceExpiring: 1,
    });
    expect(inboxTotals(items)).toEqual({ count: 6, amount: 200.05, urgent: 2 });
  });
});
