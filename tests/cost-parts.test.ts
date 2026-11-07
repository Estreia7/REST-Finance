import { describe, it, expect } from 'vitest';
import { byInvoice, invoiceParts } from '@/lib/cost-parts';

const cost = (id: string, amount: number, splitFromId: string | null = null, date = '2026-11-06') =>
  ({ id, amount, splitFromId, date: new Date(date) });

describe('invoiceParts', () => {
  // FAC 06205202601/024430: five categories, 231,41 in all.
  const makro = [cost('m', 196.11), cost('a', 2.93, 'm'), cost('b', 4.72, 'm'), cost('c', 7.65, 'm'), cost('d', 20, 'm')];

  it('adds the parts up to the invoice', () => {
    const parts = invoiceParts(makro);
    expect(parts.get('m')).toEqual({ part: 1, parts: 5, total: 231.41 });
    expect(parts.get('a')).toEqual({ part: 5, parts: 5, total: 231.41 });
  });

  it('says nothing about a cost that stands alone', () => {
    expect(invoiceParts([cost('x', 116.64)]).size).toBe(0);
  });

  it('keeps two invoices apart', () => {
    const parts = invoiceParts([...makro, cost('r', 44.57), cost('s', 9.54, 'r'), cost('t', 8.47, 'r')]);
    expect(parts.get('t')).toEqual({ part: 3, parts: 3, total: 62.58 });
    expect(parts.get('d')?.total).toBe(231.41);
  });
});

describe('byInvoice', () => {
  it('keeps the parts of an invoice together, the largest first', () => {
    const rows = [cost('a', 2.93, 'm'), cost('s', 9.54, 'r'), cost('m', 196.11), cost('r', 44.57), cost('d', 20, 'm')];
    expect(byInvoice(rows).map((r) => r.id)).toEqual(['m', 'd', 'a', 'r', 's']);
  });

  it('stays newest first', () => {
    const rows = [cost('old', 500, null, '2026-11-01'), cost('new', 1, null, '2026-11-06')];
    expect(byInvoice(rows).map((r) => r.id)).toEqual(['new', 'old']);
  });
});
