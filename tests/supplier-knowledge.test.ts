import { describe, it, expect } from 'vitest';
import {
  cleanTaxId,
  groupLearning,
  kindOf,
  readerNote,
  rulesFor,
  type LearnedCorrection,
  type SupplierRule,
} from '@/lib/supplier-knowledge';

const correction = (over: Partial<LearnedCorrection> = {}): LearnedCorrection => ({
  taxId: '500000000',
  vendorName: 'Recheio',
  restaurantId: 'r1',
  productName: 'COGUMELO',
  field: 'line',
  readValue: '1 x 3.69 = 3.69',
  savedValue: '0.905 kg x 3.69 = 3.34',
  createdAt: new Date('2026-11-04'),
  ...over,
});

const rule = (over: Partial<SupplierRule> = {}): SupplierRule => ({
  id: 'k1',
  taxId: '500000000',
  vendorName: 'Recheio',
  docType: null,
  note: 'Weighed goods print the kilos in the quantity column.',
  source: null,
  active: true,
  ...over,
});

describe('kindOf', () => {
  it('sees a line that turned out to be sold by weight', () => {
    expect(kindOf(correction())).toBe('weighed');
  });

  it('calls a line that kept its unit a misread price', () => {
    expect(kindOf(correction({ readValue: '2 kg x 5 = 10', savedValue: '2 kg x 4 = 8' }))).toBe('prices');
  });

  it('learns nothing about layout from a category', () => {
    expect(kindOf(correction({ field: 'category' }))).toBeNull();
  });
});

describe('groupLearning', () => {
  it('counts restaurants, so a pattern seen by several clients shows', () => {
    const [row] = groupLearning([correction(), correction({ restaurantId: 'r2' })], []);
    expect(row.corrections).toBe(2);
    expect(row.restaurants).toBe(2);
  });

  it('waits for a second correction before suggesting anything', () => {
    expect(groupLearning([correction()], [])[0].suggestions).toEqual([]);
    expect(groupLearning([correction(), correction()], [])[0].suggestions).toEqual([{ kind: 'weighed', seen: 2 }]);
  });

  it('does not offer again what already became a rule', () => {
    const rows = groupLearning([correction(), correction()], [rule({ source: 'weighed' })]);
    expect(rows[0].suggestions).toEqual([]);
  });

  it('keeps a supplier that has rules and no recent corrections', () => {
    expect(groupLearning([], [rule()])[0].vendorName).toBe('Recheio');
  });

  it('keeps suppliers apart by NIF, however the name was read', () => {
    const rows = groupLearning([correction(), correction({ taxId: '500000001', vendorName: 'Makro' })], []);
    expect(rows).toHaveLength(2);
  });
});

describe('rulesFor', () => {
  it('applies a rule for all kinds of document, and one for this kind', () => {
    const rules = [rule({ note: 'all' }), rule({ note: 'receipts', docType: 'FS' }), rule({ note: 'invoices', docType: 'FT' })];
    expect(rulesFor(rules, 'FS')).toEqual(['all', 'receipts']);
  });

  it('leaves out a rule that was switched off', () => {
    expect(rulesFor([rule({ active: false })], 'FT')).toEqual([]);
  });

  it('applies only general rules when the kind of document is not known', () => {
    expect(rulesFor([rule({ note: 'all' }), rule({ note: 'invoices', docType: 'FT' })], undefined)).toEqual(['all']);
  });
});

describe('readerNote', () => {
  it('says nothing when nothing is known', () => {
    expect(readerNote([])).toBe('');
  });

  it('never lets a rule stand in for the page', () => {
    const note = readerNote(['Kilos are in the quantity column.']);
    expect(note).toContain('- Kilos are in the quantity column.');
    expect(note).toContain('report only what is printed');
  });
});

describe('cleanTaxId', () => {
  it('keeps nine digits and refuses anything else', () => {
    expect(cleanTaxId('PT 500 000 000')).toBe('500000000');
    expect(cleanTaxId('123')).toBeNull();
    expect(cleanTaxId(null)).toBeNull();
  });
});
