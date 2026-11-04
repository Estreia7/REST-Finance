import { describe, it, expect } from 'vitest';
import {
  toPack,
  toPackInput,
  restateLine,
  printedQuantity,
  lineNeedsSetup,
  groupWordings,
  unusualPrice,
  type SavedLine,
} from '@/lib/line-setup';
import { rememberedPack, packColumns, packConversion } from '@/lib/invoice-matching';

describe('toPack', () => {
  it('stores grams and millilitres as kilos and litres', () => {
    expect(toPack({ amount: 500, unit: 'g' })).toEqual({ amount: 0.5, unit: 'kg' });
    expect(toPack({ amount: 330, unit: 'ml' })).toEqual({ amount: 0.33, unit: 'L' });
  });

  it('keeps units per package, and one in each is just counting', () => {
    expect(toPack({ amount: 4, unit: 'un' })).toEqual({ amount: 4, unit: 'un' });
    expect(toPack({ amount: 1, unit: 'un' })).toBe('packages');
  });

  it('refuses anything that is not a quantity', () => {
    expect(toPack({ amount: 0, unit: 'kg' })).toBeNull();
    expect(toPack({ amount: NaN, unit: 'un' })).toBeNull();
  });
});

describe('toPackInput', () => {
  it('says it the way a person would', () => {
    expect(toPackInput({ amount: 0.5, unit: 'kg' })).toEqual({ amount: 500, unit: 'g' });
    expect(toPackInput({ amount: 2.5, unit: 'kg' })).toEqual({ amount: 2.5, unit: 'kg' });
    expect(toPackInput('packages')).toEqual({ amount: 1, unit: 'un' });
    expect(toPackInput(null)).toBeNull();
  });
});

describe('units per package in the memory', () => {
  it('survives being stored and read back', () => {
    const columns = packColumns({ amount: 4, unit: 'un' });
    expect(rememberedPack(columns)).toEqual({ amount: 4, unit: 'un' });
  });

  it('still reads an old "count it in packages" answer', () => {
    expect(rememberedPack({ packAmount: null, packUnit: 'un' })).toBe('packages');
  });

  it('restates the next invoice without asking', () => {
    const line = { productName: 'PAO HAMBURGUER', quantity: 6, unit: 'un', unitPrice: 1.5, total: 9 };
    const conversion = packConversion(line, { amount: 4, unit: 'un' });
    expect(conversion?.certain?.quantity).toBe(24);
    expect(conversion?.certain?.unit).toBe('un');
    expect(conversion?.certain?.unitPrice).toBe(0.375);
  });
});

describe('restateLine', () => {
  const buns = { quantity: 6, unit: 'un', total: 9, packFactor: null };
  const lettuce = { quantity: 4, unit: 'un', total: 4.32, packFactor: null };

  it('turns six bought with four in each into twenty-four', () => {
    expect(restateLine(buns, { amount: 4, unit: 'un' })).toEqual({
      quantity: 24, unit: 'un', unitPrice: 0.375, packFactor: 4,
    });
  });

  it('turns four lettuces of 500 g into two kilos', () => {
    expect(restateLine(lettuce, { amount: 0.5, unit: 'kg' })).toEqual({
      quantity: 2, unit: 'kg', unitPrice: 2.16, packFactor: 0.5,
    });
  });

  it('never multiplies twice when an answer is corrected', () => {
    const first = restateLine(buns, { amount: 4, unit: 'un' })!;
    const second = restateLine({ ...first, total: 9 }, { amount: 6, unit: 'un' })!;
    expect(second.quantity).toBe(36);
    expect(second.packFactor).toBe(6);
  });

  it('goes back to the printed count when told to count packages', () => {
    const first = restateLine(buns, { amount: 4, unit: 'un' })!;
    expect(restateLine({ ...first, total: 9 }, 'packages')).toEqual({
      quantity: 6, unit: 'un', unitPrice: 1.5, packFactor: null,
    });
  });

  it('leaves weighed lines and fractional counts alone', () => {
    expect(restateLine({ quantity: 3, unit: 'kg', total: 9, packFactor: null }, { amount: 2, unit: 'kg' })).toBeNull();
    expect(restateLine({ quantity: 2.5, unit: 'un', total: 9, packFactor: null }, { amount: 2, unit: 'un' })).toBeNull();
  });

  it('has nothing to do for a line already counted in packages', () => {
    expect(restateLine(buns, 'packages')).toBeNull();
  });

  it('recovers the printed quantity', () => {
    expect(printedQuantity({ quantity: 24, packFactor: 4 })).toBe(6);
    expect(printedQuantity({ quantity: 6, packFactor: null })).toBe(6);
  });
});

describe('lineNeedsSetup', () => {
  const base = {
    linked: true, notIngredient: false, runningCost: false, unit: 'un',
    packAnswered: false, packSettled: null, ingredientUnits: ['un'],
  };

  it('leaves alone what is already known', () => {
    expect(lineNeedsSetup(base)).toBe(false);
    expect(lineNeedsSetup({ ...base, linked: false, notIngredient: true })).toBe(false);
    expect(lineNeedsSetup({ ...base, linked: false, runningCost: true })).toBe(false);
    expect(lineNeedsSetup({ ...base, unit: 'kg', ingredientUnits: ['kg'] })).toBe(false);
    expect(lineNeedsSetup({ ...base, packAnswered: true, ingredientUnits: ['kg'] })).toBe(false);
    expect(lineNeedsSetup({ ...base, packSettled: true, ingredientUnits: ['kg'] })).toBe(false);
  });

  it('asks about a wording nobody has identified', () => {
    expect(lineNeedsSetup({ ...base, linked: false })).toBe(true);
  });

  it('asks when a size was only guessed', () => {
    expect(lineNeedsSetup({ ...base, packSettled: false })).toBe(true);
  });

  it('asks when a unit bought feeds something measured by weight', () => {
    expect(lineNeedsSetup({ ...base, ingredientUnits: ['kg'] })).toBe(true);
  });
});

describe('unusualPrice', () => {
  it('names the usual price when this one is far from it', () => {
    expect(unusualPrice(9, [4, 4.1, 3.9])).toBe(4);
  });

  it('stays quiet within 30%, and with too little history', () => {
    expect(unusualPrice(4.5, [4, 4.1, 3.9])).toBeNull();
    expect(unusualPrice(9, [4])).toBeNull();
  });
});

describe('groupWordings', () => {
  const line = (over: Partial<SavedLine>): SavedLine => ({
    productName: 'PAO HAMB', vendorId: 'v1', vendorName: 'Makro', categoryId: null,
    quantity: 6, unit: 'un', total: 9, packFactor: null, date: '2026-11-01', ...over,
  });

  it('shows one entry per wording and supplier, however many invoices', () => {
    const groups = groupWordings([
      line({ total: 9, date: '2026-10-01' }),
      line({ productName: 'pao hamb ', total: 12, quantity: 8, date: '2026-11-01' }),
      line({ vendorId: 'v2', vendorName: 'Outro', total: 5 }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ spent: 21, lines: 2, quantity: 8, total: 12, vendorId: 'v1' });
  });

  it('puts the most money first', () => {
    const groups = groupWordings([
      line({ productName: 'SAL', total: 2 }),
      line({ productName: 'CARNE', total: 80 }),
    ]);
    expect(groups.map((g) => g.productName)).toEqual(['CARNE', 'SAL']);
  });

  it('shows what was printed, not what it was restated to', () => {
    const [group] = groupWordings([line({ quantity: 24, packFactor: 4 })]);
    expect(group.quantity).toBe(6);
  });
});
