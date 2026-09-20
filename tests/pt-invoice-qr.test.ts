import { describe, it, expect } from 'vitest';
import { parseInvoiceQr, compareWithQr } from '@/lib/pt-invoice-qr';

/**
 * A QR in the shape the Farmácia Godinho Belo receipt carries: a fatura-recibo
 * for €4.56 at 6% VAT, issued 3 September 2026.
 */
const REAL_SHAPE =
  'A:515194077*B:999999990*C:PT*D:FR*E:N*F:20260903*G:FR U005/267376*' +
  'H:JJJN98C3-267376*I1:PT*I2:4.30*I3:0.00*I4:0.00*I7:4.30*I8:0.26*' +
  'N:0.26*O:4.56*Q:aBcD*R:432';

describe('parseInvoiceQr', () => {
  it('reads the fields an invoice QR carries', () => {
    const qr = parseInvoiceQr(REAL_SHAPE);

    expect(qr).not.toBeNull();
    expect(qr!.issuerNif).toBe('515194077');
    expect(qr!.documentType).toBe('FR');
    expect(qr!.documentNumber).toBe('FR U005/267376');
    expect(qr!.atcud).toBe('JJJN98C3-267376');
    expect(qr!.grandTotal).toBe(4.56);
    expect(qr!.totalTaxes).toBe(0.26);
  });

  it('turns the QR date into the form the rest of the app uses', () => {
    // The QR carries YYYYMMDD; everything downstream expects YYYY-MM-DD.
    expect(parseInvoiceQr(REAL_SHAPE)!.date).toBe('2026-09-03');
  });

  it('treats the anonymous-buyer NIF as no buyer at all', () => {
    // 999999990 is the placeholder for "consumidor final", not a real NIF.
    expect(parseInvoiceQr(REAL_SHAPE)!.buyerNif).toBeUndefined();
  });

  it('keeps a real buyer NIF', () => {
    const qr = parseInvoiceQr(REAL_SHAPE.replace('B:999999990', 'B:500100144'));
    expect(qr!.buyerNif).toBe('500100144');
  });

  it('recognises the document types that are money going out', () => {
    for (const type of ['FT', 'FS', 'FR', 'ND']) {
      const qr = parseInvoiceQr(REAL_SHAPE.replace('D:FR', `D:${type}`));
      expect(qr!.isInvoice, type).toBe(true);
      expect(qr!.isCreditNote, type).toBe(false);
    }
  });

  it('marks a credit note, which must not be booked as a cost', () => {
    const qr = parseInvoiceQr(REAL_SHAPE.replace('D:FR', 'D:NC'));
    expect(qr!.isCreditNote).toBe(true);
    expect(qr!.isInvoice).toBe(false);
  });

  it('returns null for a QR that is not an AT invoice', () => {
    // A photograph can easily contain some other QR; that is not an error.
    expect(parseInvoiceQr('https://example.com/promo')).toBeNull();
    expect(parseInvoiceQr('MECARD:N:Someone;;')).toBeNull();
    expect(parseInvoiceQr('')).toBeNull();
  });

  it('returns null when the issuer NIF is missing or malformed', () => {
    // A is mandatory on every AT QR.
    expect(parseInvoiceQr('B:999999990*D:FR*O:4.56')).toBeNull();
    expect(parseInvoiceQr('A:12345*D:FR')).toBeNull();
  });

  it('survives fields arriving in a different order', () => {
    const shuffled = 'O:4.56*A:515194077*F:20260903*D:FT';
    const qr = parseInvoiceQr(shuffled);
    expect(qr!.grandTotal).toBe(4.56);
    expect(qr!.date).toBe('2026-09-03');
  });

  it('keeps a document number containing a colon', () => {
    // Only the FIRST colon separates key from value.
    const qr = parseInvoiceQr('A:515194077*G:FT 1:2026/44*D:FT');
    expect(qr!.documentNumber).toBe('FT 1:2026/44');
  });

  it('keeps every raw pair for debugging a bad read', () => {
    const qr = parseInvoiceQr(REAL_SHAPE);
    expect(qr!.raw.I2).toBe('4.30');
    expect(qr!.raw.R).toBe('432');
  });
});

describe('compareWithQr', () => {
  const qr = parseInvoiceQr(REAL_SHAPE)!;

  it('confirms an extraction that matches the till', () => {
    const comparisons = compareWithQr(
      {
        vendorTaxId: '515194077',
        date: '2026-09-03',
        invoiceNumber: 'FR U005/267376',
        grandTotal: 4.56,
      },
      qr,
    );
    expect(comparisons.every((c) => c.agrees)).toBe(true);
    expect(comparisons).toHaveLength(4);
  });

  it('catches a misread total', () => {
    const comparisons = compareWithQr({ grandTotal: 4.5 }, qr);
    const total = comparisons.find((c) => c.field === 'grandTotal');
    expect(total!.agrees).toBe(false);
    expect(total!.fromQr).toBe(4.56);
  });

  it('tolerates a cent of floating-point drift', () => {
    const comparisons = compareWithQr({ grandTotal: 4.5600000000001 }, qr);
    expect(comparisons.find((c) => c.field === 'grandTotal')!.agrees).toBe(true);
  });

  it('says nothing about fields the QR does not carry', () => {
    // The QR has no supplier name, so there is nothing to compare it to.
    const bare = parseInvoiceQr('A:515194077*D:FT')!;
    const comparisons = compareWithQr({ vendor: 'Anything', grandTotal: 99 }, bare);
    expect(comparisons.map((c) => c.field)).toEqual(['vendorTaxId']);
  });
});
