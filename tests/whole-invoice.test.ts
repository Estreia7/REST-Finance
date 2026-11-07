import { describe, expect, it } from 'vitest';
import { issuesOfWholeInvoice, isWholeInvoice } from '@/lib/whole-invoice';
import { canSaveUnseen } from '@/lib/invoice-checks';

describe('isWholeInvoice', () => {
  it('takes a running cost with nothing to sell in it', () => {
    expect(isWholeInvoice({ type: 'OPEX', lines: [{ type: 'OPEX' }, { type: null }, {}] })).toBe(true);
  });

  it('leaves an invoice with food among the cleaning', () => {
    expect(isWholeInvoice({ type: 'OPEX', lines: [{ type: 'OPEX' }, { type: 'COGS' }] })).toBe(false);
  });

  it('leaves a line that already prices an ingredient', () => {
    expect(isWholeInvoice({ type: 'OPEX', lines: [{ type: 'OPEX', linked: true }] })).toBe(false);
  });

  it('leaves anything that goes into what is sold', () => {
    expect(isWholeInvoice({ type: 'COGS', lines: [{ type: 'OPEX' }] })).toBe(false);
  });
});

describe('issuesOfWholeInvoice', () => {
  const issues = [{ kind: 'doesNotAddUp' as const }, { kind: 'linesOverTotal' as const }, { kind: 'noTotal' as const }];

  it('drops the lines missing the document when the total is vouched for', () => {
    expect(issuesOfWholeInvoice(issues, true)).toEqual([{ kind: 'noTotal' }]);
  });

  it('keeps them when nothing else says what the total is', () => {
    expect(issuesOfWholeInvoice(issues, false)).toEqual(issues);
  });
});

describe('canSaveUnseen for an invoice that counts by its total', () => {
  const checks = { knownVendorId: 'v', qrRead: true, wholeInvoice: true, issues: [] };

  it('goes in on the QR alone, whatever became of its lines', () => {
    expect(canSaveUnseen({ vendor: 'PAULO GUIA', lines: 6, checks })).toBe(true);
  });

  it('still needs the QR', () => {
    expect(canSaveUnseen({ vendor: 'PAULO GUIA', lines: 6, checks: { ...checks, qrRead: false } })).toBe(false);
  });

  it('does not extend to other invoices', () => {
    expect(canSaveUnseen({ vendor: 'MAKRO', lines: 6, checks: { ...checks, wholeInvoice: false } })).toBe(false);
  });
});
