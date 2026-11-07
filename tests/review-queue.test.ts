import { describe, expect, it } from 'vitest';
import { copyKey, documentKey, groupCopies, recommendedCopy, supersededScans, type QueuedData, type QueuedReading } from '@/lib/review-queue';

const data = { vendor: 'MAKRO', vendorTaxId: '502035712', invoiceNumber: 'FAC 06001202501/017420', grandTotal: 149.47 };
const scan = (id: string, proofStatus: string | null, over: Partial<NonNullable<QueuedData>> = {}): QueuedReading => ({
  id,
  proofStatus,
  data: { ...data, ...over },
});
const ids = (groups: QueuedReading[][]) => groups.map((group) => group.map((s) => s.id));

describe('supersededScans', () => {
  it('sets aside every reading of an invoice already saved', () => {
    expect(supersededScans([scan('a', 'failed'), scan('b', 'proved')], [data])).toEqual(['a', 'b']);
  });

  it('leaves copies of an unsaved invoice for the owner to choose between', () => {
    expect(supersededScans([scan('a', 'failed'), scan('b', 'proved')], [])).toEqual([]);
  });

  it('does not act on a different total, supplier or number', () => {
    expect(supersededScans([scan('a', 'failed', { grandTotal: 20 })], [data])).toEqual([]);
    expect(supersededScans([scan('a', 'failed', { vendorTaxId: '999999990' })], [data])).toEqual([]);
    expect(supersededScans([scan('a', 'failed', { invoiceNumber: 'FAC 1/2' })], [data])).toEqual([]);
  });

  it('never touches a reading with nothing to identify it', () => {
    expect(supersededScans([scan('a', 'failed', { invoiceNumber: null })], [{ ...data, invoiceNumber: null }])).toEqual([]);
    expect(documentKey(null)).toBeNull();
    expect(copyKey(null)).toBeNull();
  });
});

describe('groupCopies', () => {
  it('puts copies of an invoice together, the proved one first', () => {
    expect(ids(groupCopies([scan('bad', 'failed'), scan('other', 'partial', { invoiceNumber: 'FT 1/2' }), scan('good', 'proved')])))
      .toEqual([['good', 'bad'], ['other']]);
  });

  it('takes the newest of equally reliable copies first', () => {
    expect(ids(groupCopies([scan('old', 'partial'), scan('new', 'partial')]))).toEqual([['new', 'old']]);
  });

  it('joins copies whose totals differ: a misread total is why they are compared', () => {
    expect(ids(groupCopies([scan('a', 'failed', { grandTotal: 150 }), scan('b', 'proved')]))).toEqual([['b', 'a']]);
  });

  it('keeps readings with no number apart', () => {
    expect(ids(groupCopies([scan('a', 'failed', { invoiceNumber: null }), scan('b', 'failed', { invoiceNumber: '' })])))
      .toEqual([['a'], ['b']]);
  });

  it('does not join the same number from two suppliers', () => {
    expect(groupCopies([scan('a', 'failed'), scan('b', 'failed', { vendorTaxId: '999999990' })])).toHaveLength(2);
  });
});

describe('recommendedCopy', () => {
  it('suggests the only proved copy', () => {
    expect(recommendedCopy([scan('good', 'proved'), scan('bad', 'failed')])).toBe('good');
  });

  it('suggests nothing between equals, or for a single reading', () => {
    expect(recommendedCopy([scan('a', 'proved'), scan('b', 'proved')])).toBeNull();
    expect(recommendedCopy([scan('a', 'failed'), scan('b', null)])).toBeNull();
    expect(recommendedCopy([scan('a', 'proved')])).toBeNull();
  });
});
