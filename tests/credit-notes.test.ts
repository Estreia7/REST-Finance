import { describe, it, expect } from 'vitest';
import { automaticMatch, creditCandidates, isCreditNoteNumber, type InvoiceCandidate } from '@/lib/credit-notes';

const invoice = (over: Partial<InvoiceCandidate>): InvoiceCandidate => ({
  costEntryId: 'a', invoiceNumber: 'FT 1/1', date: '2026-10-01', amount: 41.35, ...over,
});
const credit = { amount: 41.35, date: '2026-10-10' };

describe('isCreditNoteNumber', () => {
  it('knows a credit note by its number', () => {
    expect(isCreditNoteNumber('NC NC.2026/1')).toBe(true);
    expect(isCreditNoteNumber(' nc 2026/5')).toBe(true);
  });

  it('is not fooled by an invoice', () => {
    expect(isCreditNoteNumber('FT NC.2026/1')).toBe(false);
    expect(isCreditNoteNumber('NCX 1')).toBe(false);
    expect(isCreditNoteNumber(null)).toBe(false);
  });
});

describe('creditCandidates', () => {
  it('keeps invoices of the same value, newest first', () => {
    const found = creditCandidates(credit, [
      invoice({ costEntryId: 'old', date: '2026-09-01' }),
      invoice({ costEntryId: 'new', date: '2026-10-05' }),
      invoice({ costEntryId: 'other', amount: 54.38 }),
    ]);
    expect(found.map((i) => i.costEntryId)).toEqual(['new', 'old']);
  });

  it('never cancels an invoice dated after the credit note', () => {
    expect(creditCandidates(credit, [invoice({ date: '2026-10-11' })])).toEqual([]);
  });

  it('accepts one issued on the same day', () => {
    expect(creditCandidates(credit, [invoice({ date: '2026-10-10' })])).toHaveLength(1);
  });

  it('never matches another credit note', () => {
    expect(creditCandidates(credit, [invoice({ invoiceNumber: 'NC 2026/1' })])).toEqual([]);
  });
});

describe('automaticMatch', () => {
  it('takes the one invoice of that value', () => {
    expect(automaticMatch(credit, [invoice({ costEntryId: 'x' })])?.costEntryId).toBe('x');
  });

  it('asks when two invoices have the same value', () => {
    expect(automaticMatch(credit, [invoice({ costEntryId: 'x' }), invoice({ costEntryId: 'y' })])).toBeNull();
  });

  it('waits when there is none', () => {
    expect(automaticMatch(credit, [])).toBeNull();
  });
});
