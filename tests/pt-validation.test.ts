import { describe, it, expect } from 'vitest';
import { isValidNif, isValidIsoDate, checkExtraction } from '@/lib/pt-validation';

/**
 * The NIF check digit is the one field on a Portuguese invoice that can be
 * verified without the paper in hand, so it is worth being sure the
 * arithmetic is right rather than plausible.
 */
describe('isValidNif', () => {
  it('accepts a real published NIF', () => {
    // Farmácia Godinho Belo, from the receipt photographed during testing.
    expect(isValidNif('515194077')).toBe(true);
  });

  it('accepts well-known public NIFs', () => {
    // Autoridade Tributária's own number, and two widely published ones.
    expect(isValidNif('600084779')).toBe(true); // Estado / AT
    expect(isValidNif('500100144')).toBe(true); // company-form NIF
  });

  it('rejects a number whose check digit is wrong', () => {
    // Same as the valid one above with the last digit changed.
    expect(isValidNif('515194078')).toBe(false);
    expect(isValidNif('515194070')).toBe(false);
  });

  it('rejects transposed digits, the usual OCR failure', () => {
    // 515194077 with two digits swapped: still nine digits, still a company
    // prefix, but the checksum no longer holds.
    expect(isValidNif('515194707')).toBe(false);
  });

  it('rejects anything that is not nine digits', () => {
    expect(isValidNif('51519407')).toBe(false);
    expect(isValidNif('5151940770')).toBe(false);
    expect(isValidNif('')).toBe(false);
  });

  it('rejects a leading digit no NIF is issued under', () => {
    // 4 alone is not an issued prefix (45 is, but 40 is not).
    expect(isValidNif('400000000')).toBe(false);
  });

  it('ignores punctuation and spacing', () => {
    expect(isValidNif('515 194 077')).toBe(true);
    expect(isValidNif('515-194-077')).toBe(true);
  });
});

describe('isValidIsoDate', () => {
  it('accepts a real date in the requested format', () => {
    expect(isValidIsoDate('2026-09-03')).toBe(true);
  });

  it('rejects a day that does not exist', () => {
    // `new Date` rolls this into March rather than failing, which is the
    // trap this function exists to avoid.
    expect(isValidIsoDate('2026-02-30')).toBe(false);
    expect(isValidIsoDate('2026-13-01')).toBe(false);
  });

  it('rejects the day-first form a Portuguese document prints', () => {
    // If this ever passes, the extractor is returning the raw printed date.
    expect(isValidIsoDate('03/09/2026')).toBe(false);
  });

  it('accepts a leap day in a leap year and rejects it otherwise', () => {
    expect(isValidIsoDate('2024-02-29')).toBe(true);
    expect(isValidIsoDate('2026-02-29')).toBe(false);
  });
});

describe('checkExtraction', () => {
  it('passes a clean invoice', () => {
    expect(
      checkExtraction({
        date: '2026-09-03',
        vendorTaxId: '515194077',
        grandTotal: 4.56,
        items: [{ product: 'Ben-u-ron', quantity: 1, unitPrice: 4.56, total: 4.56 }],
      }),
    ).toEqual([]);
  });

  it('flags a NIF that fails its own check digit', () => {
    const warnings = checkExtraction({ vendorTaxId: '515194078' });
    expect(warnings).toHaveLength(1);
    expect(warnings[0].code).toBe('invalidNif');
  });

  it('says nothing about a NIF that was not on the page', () => {
    // An omitted field is the extractor behaving correctly, not an error.
    expect(checkExtraction({ vendorTaxId: '' })).toEqual([]);
    expect(checkExtraction({})).toEqual([]);
  });

  it('flags a date that is not the ISO form asked for', () => {
    const warnings = checkExtraction({ date: '03/09/2026' });
    expect(warnings[0].code).toBe('invalidDate');
  });

  it('flags a date in the future, the usual shape of a misread year', () => {
    const warnings = checkExtraction({ date: '2099-01-01' });
    expect(warnings[0].code).toBe('futureDate');
  });

  it('flags lines that do not add up to the stated total', () => {
    const warnings = checkExtraction({
      grandTotal: 100,
      items: [
        { product: 'a', quantity: 1, unitPrice: 30, total: 30 },
        { product: 'b', quantity: 1, unitPrice: 20, total: 20 },
      ],
    });
    expect(warnings.map((w) => w.code)).toContain('totalMismatch');
  });

  it('tolerates rounding across many lines', () => {
    const warnings = checkExtraction({
      grandTotal: 0.3,
      items: [
        { product: 'a', quantity: 1, unitPrice: 0.1, total: 0.1 },
        { product: 'b', quantity: 1, unitPrice: 0.1, total: 0.1 },
        { product: 'c', quantity: 1, unitPrice: 0.1, total: 0.1 },
      ],
    });
    // 0.1 + 0.1 + 0.1 is 0.30000000000000004 in binary floating point.
    expect(warnings.map((w) => w.code)).not.toContain('totalMismatch');
  });

  it('flags money that came back negative', () => {
    const warnings = checkExtraction({ dineInRevenue: -120 });
    expect(warnings[0].code).toBe('negativeAmount');
  });

  it('checks a daily report without inventing invoice warnings', () => {
    expect(
      checkExtraction({
        date: '2026-09-03',
        dineInRevenue: 820.5,
        takeawayRevenue: 130,
        dineInTickets: 41,
        takeawayTickets: 9,
      }),
    ).toEqual([]);
  });
});
