import { describe, it, expect } from 'vitest';
import {
  guessLineCategory,
  splitInvoiceTotal,
  nextConfirmations,
  lineKey,
  type LineMemory,
} from '@/lib/invoice-categories';

const FOOD = 'cat-food';
const DRINK = 'cat-drink';
const CLEAN = 'cat-clean';
const POWER = 'cat-power';
const GAS = 'cat-gas';
const active = new Set([FOOD, DRINK, CLEAN, POWER, GAS]);

const MAKRO = 'v-makro';
const RECHEIO = 'v-recheio';
const EDP = 'v-edp';

function memory(over: Partial<LineMemory> & { sourceName: string }): LineMemory {
  return {
    vendorId: MAKRO,
    categoryId: FOOD,
    notIngredient: false,
    confirmations: 1,
    ...over,
    sourceName: lineKey(over.sourceName),
  };
}

describe('guessLineCategory', () => {
  it('takes a remembered wording as known, ahead of the reader', () => {
    const guess = guessLineCategory('COCA COLA 33CL', {
      vendorId: MAKRO,
      memories: [memory({ sourceName: 'coca cola 33cl', categoryId: DRINK })],
      active,
      readerCategoryId: FOOD,
    });
    expect(guess).toEqual({ categoryId: DRINK, origin: 'memory', notIngredient: false });
  });

  it('remembers a wording from another supplier too', () => {
    const guess = guessLineCategory('COCA COLA 33CL', {
      vendorId: RECHEIO,
      memories: [memory({ sourceName: 'coca cola 33cl', categoryId: DRINK })],
      active,
    });
    expect(guess.origin).toBe('memory');
    expect(guess.categoryId).toBe(DRINK);
  });

  it("prefers this supplier's answer over another's", () => {
    const guess = guessLineCategory('CAFE GRAO', {
      vendorId: RECHEIO,
      memories: [
        memory({ sourceName: 'cafe grao', vendorId: MAKRO, categoryId: FOOD, confirmations: 9 }),
        memory({ sourceName: 'cafe grao', vendorId: RECHEIO, categoryId: DRINK }),
      ],
      active,
    });
    expect(guess.categoryId).toBe(DRINK);
  });

  it('ignores a memory pointing at a category switched off', () => {
    const guess = guessLineCategory('LIXIVIA 5L', {
      vendorId: MAKRO,
      memories: [memory({ sourceName: 'lixivia 5l', categoryId: 'cat-gone' })],
      active,
      readerCategoryId: CLEAN,
    });
    expect(guess).toMatchObject({ categoryId: CLEAN, origin: 'reader' });
  });

  it('suggests from a wording that is nearly the same', () => {
    const guess = guessLineCategory('SUPER BOCK MINI 20CL', {
      vendorId: MAKRO,
      memories: [memory({ sourceName: 'super bock 33cl', categoryId: DRINK })],
      active,
      readerCategoryId: FOOD,
    });
    expect(guess).toMatchObject({ categoryId: DRINK, origin: 'similar' });
  });

  it('does not call sparkling water gas because they share one word', () => {
    const guess = guessLineCategory('AGUA COM GAS 1L', {
      vendorId: MAKRO,
      memories: [memory({ sourceName: 'gas', categoryId: GAS })],
      active,
      readerCategoryId: DRINK,
    });
    expect(guess).toMatchObject({ categoryId: DRINK, origin: 'reader' });
  });

  it("follows a supplier's habit once it has one", () => {
    const guess = guessLineCategory('Termo fixo potencia', {
      vendorId: EDP,
      memories: [
        memory({ sourceName: 'energia ativa vazio', vendorId: EDP, categoryId: POWER, confirmations: 2 }),
        memory({ sourceName: 'energia ativa ponta', vendorId: EDP, categoryId: POWER }),
      ],
      active,
      readerCategoryId: GAS,
    });
    expect(guess).toMatchObject({ categoryId: POWER, origin: 'vendor' });
  });

  it('has no habit for a cash-and-carry that sells everything', () => {
    const guess = guessLineCategory('GUARDANAPOS', {
      vendorId: MAKRO,
      memories: [
        memory({ sourceName: 'bacon fatiado', categoryId: FOOD, confirmations: 5 }),
        memory({ sourceName: 'sumol laranja', categoryId: DRINK, confirmations: 3 }),
      ],
      active,
      readerCategoryId: CLEAN,
    });
    expect(guess).toMatchObject({ categoryId: CLEAN, origin: 'reader' });
  });

  it('says nothing rather than guess when nobody knows', () => {
    expect(guessLineCategory('XPTO', { vendorId: null, memories: [], active })).toEqual({
      categoryId: null,
      origin: 'none',
      notIngredient: null,
    });
  });

  it('remembers that a wording is not an ingredient', () => {
    const guess = guessLineCategory('TARA GRADE', {
      vendorId: MAKRO,
      memories: [memory({ sourceName: 'tara grade', categoryId: DRINK, notIngredient: true })],
      active,
    });
    expect(guess.notIngredient).toBe(true);
  });
});

describe('nextConfirmations', () => {
  it('grows when the same answer is given again', () => {
    expect(nextConfirmations({ categoryId: FOOD, confirmations: 2 }, FOOD)).toBe(3);
  });
  it('starts again when the answer changes', () => {
    expect(nextConfirmations({ categoryId: FOOD, confirmations: 7 }, DRINK)).toBe(1);
  });
  it('starts at one for something new', () => {
    expect(nextConfirmations(null, FOOD)).toBe(1);
  });
});

describe('splitInvoiceTotal', () => {
  const sum = (parts: { amount: number }[]) =>
    Math.round(parts.reduce((s, p) => s + p.amount, 0) * 100) / 100;

  it('keeps an invoice of one category whole', () => {
    const parts = splitInvoiceTotal(
      [{ categoryId: FOOD, total: 10 }, { categoryId: FOOD, total: 20 }],
      33.9,
    );
    expect(parts).toEqual([{ categoryId: FOOD, amount: 33.9, lines: [0, 1] }]);
  });

  it('shares the total in proportion to each category', () => {
    const parts = splitInvoiceTotal(
      [
        { categoryId: FOOD, total: 60 },
        { categoryId: DRINK, total: 30 },
        { categoryId: CLEAN, total: 10 },
        { categoryId: FOOD, total: 0 },
      ],
      123,
    );
    expect(parts).toEqual([
      { categoryId: FOOD, amount: 73.8, lines: [0, 3] },
      { categoryId: DRINK, amount: 36.9, lines: [1] },
      { categoryId: CLEAN, amount: 12.3, lines: [2] },
    ]);
  });

  it('adds up to the cent however the shares round', () => {
    const parts = splitInvoiceTotal(
      [
        { categoryId: FOOD, total: 1 },
        { categoryId: DRINK, total: 1 },
        { categoryId: CLEAN, total: 1 },
      ],
      100,
    );
    expect(sum(parts)).toBe(100);
    expect(parts.map((p) => p.amount).sort()).toEqual([33.33, 33.33, 33.34]);
  });

  it('folds a category that comes to nothing into the largest', () => {
    const parts = splitInvoiceTotal(
      [
        { categoryId: FOOD, total: 80 },
        { categoryId: DRINK, total: 20 },
        { categoryId: null, total: -5 },
      ],
      95,
    );
    expect(parts).toHaveLength(2);
    expect(parts[0]).toMatchObject({ categoryId: FOOD, lines: [0, 2] });
    expect(sum(parts)).toBe(95);
  });

  it('keeps a credit note whole', () => {
    const parts = splitInvoiceTotal(
      [{ categoryId: FOOD, total: -10 }, { categoryId: DRINK, total: -5 }],
      -18.45,
    );
    expect(parts).toHaveLength(1);
    expect(parts[0].amount).toBe(-18.45);
  });

  it('puts the biggest part first', () => {
    const parts = splitInvoiceTotal(
      [{ categoryId: CLEAN, total: 5 }, { categoryId: FOOD, total: 95 }],
      100,
    );
    expect(parts[0].categoryId).toBe(FOOD);
  });
});
