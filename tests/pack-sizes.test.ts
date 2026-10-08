import { describe, it, expect } from 'vitest';
import { packSizeOf, packConversion, rememberedPack, packColumns } from '@/lib/invoice-matching';
import { costPerIngredientUnit, lineUnitOf } from '@/lib/ingredient-costs';
import { diffReading, formatPack } from '@/lib/scan-corrections';
import { summariseBrain, weekOf } from '@/lib/brain-summary';

/** The line that started this: one 2,5 kg bag at 6,25. */
const sweetPotato = {
  productName: 'BATATA DOCE 2,5K',
  quantity: 1,
  unit: 'un',
  unitPrice: 6.25,
  total: 6.25,
};

describe('packSizeOf', () => {
  it('reads a bare K as kilos', () => {
    expect(packSizeOf('BATATA DOCE 2,5K')).toEqual({ amount: 2.5, unit: 'kg' });
    expect(packSizeOf('CEBOLA 5 K')).toEqual({ amount: 5, unit: 'kg' });
    expect(packSizeOf('FARINHA 1KGR')).toEqual({ amount: 1, unit: 'kg' });
  });

  it('reads a multipack as what one pack holds', () => {
    expect(packSizeOf('SUPER BOCK 6X33CL')).toEqual({ amount: 1.98, unit: 'L' });
    expect(packSizeOf('AGUA LUSO 12 x 1,5L')).toEqual({ amount: 18, unit: 'L' });
  });

  it('still reads what it read before', () => {
    expect(packSizeOf('KETCHUP 5,7KG HEINZ')).toEqual({ amount: 5.7, unit: 'kg' });
    expect(packSizeOf("CART D'OR 1KG CX 6")).toEqual({ amount: 1, unit: 'kg' });
    expect(packSizeOf('NATAS 200ML')).toEqual({ amount: 0.2, unit: 'L' });
  });

  it('does not read names and strengths as sizes', () => {
    expect(packSizeOf('SMASHIE 2.0')).toBeNull();
    expect(packSizeOf('PIMENTA 25G')).toBeNull();
    expect(packSizeOf('PACK DE OFERTA')).toBeNull();
  });
});

describe('packConversion', () => {
  it('settles a bag when the reader and the label agree', () => {
    const c = packConversion({ ...sweetPotato, packSize: { amount: 2.5, unit: 'kg' } });
    expect(c?.origin).toBe('reader');
    expect(c?.certain).toMatchObject({ quantity: 2.5, unit: 'kg', unitPrice: 2.5 });
  });

  it('asks when only the label states a size other than one', () => {
    const c = packConversion(sweetPotato);
    expect(c?.origin).toBe('description');
    expect(c?.certain).toBeNull();
    expect(c?.asWeight).toMatchObject({ quantity: 2.5, unitPrice: 2.5 });
  });

  it('asks when the reader and the label disagree', () => {
    const c = packConversion({ ...sweetPotato, packSize: { amount: 25, unit: 'kg' } });
    expect(c?.certain).toBeNull();
  });

  it('settles from the owner\'s earlier answer, and stays quiet when they chose packages', () => {
    const fromMemory = packConversion({ ...sweetPotato, productName: 'BATATA DOCE SACO' }, { amount: 2.5, unit: 'kg' });
    expect(fromMemory?.origin).toBe('memory');
    expect(fromMemory?.certain).toMatchObject({ quantity: 2.5, unitPrice: 2.5 });
    expect(packConversion(sweetPotato, 'packages')).toBeNull();
  });

  it('leaves a line billed by weight alone', () => {
    expect(packConversion({ ...sweetPotato, unit: 'kg', quantity: 2.5, unitPrice: 2.5 })).toBeNull();
  });
});

describe('remembered pack columns', () => {
  it('round-trips both answers', () => {
    expect(rememberedPack(packColumns({ amount: 2.5, unit: 'kg' }))).toEqual({ amount: 2.5, unit: 'kg' });
    expect(rememberedPack(packColumns('packages'))).toBe('packages');
    expect(rememberedPack({ packAmount: null, packUnit: null })).toBeNull();
  });
});

describe('costPerIngredientUnit', () => {
  it('prices a bag per kilo from its size — never the bag as a kilo', () => {
    expect(costPerIngredientUnit('kg', sweetPotato)).toBe(2.5);
  });

  it('converts grams and litres to the ingredient unit', () => {
    expect(costPerIngredientUnit('kg', { productName: 'X', quantity: 500, unit: 'g', unitPrice: 0.01, total: 5 })).toBe(10);
    expect(costPerIngredientUnit('L', { productName: 'X', quantity: 2, unit: 'L', unitPrice: 1.5, total: 3 })).toBe(1.5);
  });

  it('refuses a price it cannot state in the ingredient unit', () => {
    expect(costPerIngredientUnit('kg', { ...sweetPotato, productName: 'BATATA DOCE SACO' })).toBeNull();
    expect(costPerIngredientUnit('un', { productName: 'X', quantity: 3.84, unit: 'kg', unitPrice: 5.49, total: 21.08 })).toBeNull();
    expect(costPerIngredientUnit('kg', sweetPotato, 'packages')).toBeNull();
  });

  it('uses the size the owner gave when the label has none', () => {
    expect(costPerIngredientUnit('kg', { ...sweetPotato, productName: 'BATATA DOCE SACO' }, { amount: 2.5, unit: 'kg' })).toBe(2.5);
  });

  it('recovers the price from the total when the printed one is misread', () => {
    expect(costPerIngredientUnit('kg', { productName: 'X', quantity: 2, unit: 'kg', unitPrice: 99, total: 10 })).toBe(5);
  });

  it('reads supplier units', () => {
    expect(lineUnitOf('KG')).toBe('kg');
    expect(lineUnitOf('Un.')).toBe('un');
    expect(lineUnitOf('')).toBe('un');
    expect(lineUnitOf('metro')).toBeNull();
  });
});

describe('diffReading', () => {
  const reading = {
    vendor: 'MAKRO',
    date: '2026-10-07',
    grandTotal: 31.33,
    suggestedType: 'COGS',
    items: [
      { product: 'BATATA DOCE 2,5K', quantity: 1, unit: 'un', unitPrice: 6.25, total: 6.25, category: 'Comida' },
      { product: 'LIXIVIA 5L', quantity: 1, unit: 'un', unitPrice: 2.5, total: 2.5, category: 'Comida' },
      { product: 'NATAS', quantity: 2, unit: 'un', unitPrice: 9, total: 4, category: 'Comida' },
    ],
  };

  it('records nothing when the reading was saved as read', () => {
    expect(diffReading(reading, {
      vendor: 'Makro', date: '2026-10-07', total: 31.33, type: 'COGS',
      lines: [{ productName: 'BATATA DOCE 2,5K', categoryName: 'comida', categorySource: 'SUGGESTED' }],
    })).toEqual([]);
  });

  it('records what the owner and the memory changed, and who did it', () => {
    const out = diffReading(reading, {
      vendor: 'MAKRO', date: '2026-10-08', total: 31.33, type: 'COGS',
      lines: [
        { productName: 'BATATA DOCE 2,5K', categoryName: 'Comida', pack: { amount: 2.5, unit: 'kg' }, packDecidedBy: 'owner' },
        { productName: 'LIXIVIA 5L', categoryName: 'Limpeza', categorySource: 'MEMORY' },
        { productName: 'NATAS', categoryName: 'Comida', categorySource: 'OWNER' },
      ],
    });
    expect(out).toContainEqual({ productName: null, field: 'date', readValue: '2026-10-07', savedValue: '2026-10-08', fixedBy: 'owner' });
    expect(out).toContainEqual({ productName: 'BATATA DOCE 2,5K', field: 'pack', readValue: null, savedValue: '2.5 kg', fixedBy: 'owner' });
    expect(out).toContainEqual({ productName: 'LIXIVIA 5L', field: 'category', readValue: 'Comida', savedValue: 'Limpeza', fixedBy: 'memory' });
    expect(out).toContainEqual({ productName: 'NATAS', field: 'unitPrice', readValue: '9', savedValue: '2', fixedBy: 'check' });
  });

  it('counts a size read and kept as right', () => {
    const read = { items: [{ ...reading.items[0], packAmount: 2.5, packUnit: 'kg' }] };
    expect(diffReading(read, {
      vendor: '', date: '2026-10-07', total: 0, type: 'COGS',
      lines: [{ productName: 'BATATA DOCE 2,5K', categoryName: null, pack: { amount: 2.5, unit: 'kg' }, packDecidedBy: 'check' }],
    }).filter((c) => c.field === 'pack')).toEqual([]);
  });

  it('formats packs the way the console shows them', () => {
    expect(formatPack({ amount: 1.98, unit: 'L' })).toBe('1.98 L');
    expect(formatPack('packages')).toBe('un');
    expect(formatPack(null)).toBeNull();
  });
});

describe('summariseBrain', () => {
  const at = (iso: string) => new Date(iso);

  it('works out how much it knew and how much was accepted as read', () => {
    const s = summariseBrain({
      memories: [
        { sourceName: 'batata doce 2,5k', vendorId: 'v1', vendorName: 'Makro', categoryName: 'Comida', notIngredient: false, packAmount: 2.5, packUnit: 'kg', confirmations: 3, lastSeenAt: at('2026-10-08T10:00:00Z') },
        { sourceName: 'lixivia 5l', vendorId: 'v1', vendorName: 'Makro', categoryName: 'Limpeza', notIngredient: true, packAmount: null, packUnit: null, confirmations: 1, lastSeenAt: at('2026-10-01T10:00:00Z') },
      ],
      links: [{ sourceName: 'batata doce 2,5k', vendorId: 'v1', ingredientName: 'Batata doce' }],
      items: [
        { categorySource: 'MEMORY', createdAt: at('2026-10-08T10:00:00Z'), receiptScanId: 's1' },
        { categorySource: 'OWNER', createdAt: at('2026-10-08T10:00:00Z'), receiptScanId: 's1' },
        { categorySource: 'SUGGESTED', createdAt: at('2026-10-01T10:00:00Z'), receiptScanId: null },
        { categorySource: null, createdAt: at('2026-10-01T10:00:00Z'), receiptScanId: null },
      ],
      scans: [{ id: 's1', reviewedAt: at('2026-10-08T10:05:00Z') }, { id: 's2', reviewedAt: null }],
      corrections: [
        { receiptScanId: 's1', productName: 'NATAS', field: 'category', readValue: 'A', savedValue: 'B', fixedBy: 'owner', vendorName: 'Makro', createdAt: at('2026-10-08T10:05:00Z') },
        { receiptScanId: 's1', productName: null, field: 'date', readValue: 'x', savedValue: 'y', fixedBy: 'owner', vendorName: 'Makro', createdAt: at('2026-10-08T10:05:00Z') },
      ],
      attention: [],
    });

    expect(s.knowledge).toEqual({ wordings: 2, withCategory: 2, notIngredient: 1, withPack: 1, linked: 1 });
    expect(s.efficacy.memoryRate).toBe(0.25);
    expect(s.efficacy).toMatchObject({ scans: 2, reviewed: 1, reviewedLines: 2, correctedLines: 1, acceptedRate: 0.5 });
    expect(s.efficacy.weekly.map((w) => w.week)).toEqual(['2026-09-28', '2026-10-05']);
    expect(s.byField.map((f) => f.field)).toEqual(['category', 'date']);
    expect(s.entries[0]).toMatchObject({ sourceName: 'batata doce 2,5k', pack: '2.5 kg', ingredients: ['Batata doce'] });
  });

  it('starts weeks on Monday', () => {
    expect(weekOf(new Date('2026-10-11T12:00:00Z'))).toBe('2026-10-05'); // a Sunday
    expect(weekOf(new Date('2026-10-05T12:00:00Z'))).toBe('2026-10-05');
  });
});
