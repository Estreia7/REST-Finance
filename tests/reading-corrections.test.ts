import { describe, it, expect } from 'vitest';
import { changedLines, correctedItems, linesOfReading } from '@/lib/reading-corrections';
import { issueFocus } from '@/lib/invoice-checks';
import { deckPose, isDrawn, isThrow, tiltFor, wrap } from '@/components/ui/card-deck-utils';
import type { ScanItem } from '@/lib/document-scanner';

const beer: ScanItem = {
  product: 'CERVEJA', quantity: 2, unit: 'un', unitPrice: 5, total: 10, vatRate: 23, grossTotal: 12.3,
  category: 'Bebidas', discount: 1, discountLabel: 'Promo',
};
const salad: ScanItem = { product: 'ALFACE', quantity: 1, unitPrice: 3, total: 3, vatRate: 6, packAmount: 2.5, packUnit: 'kg' };

describe('a reading corrected before it is saved', () => {
  it('comes back unchanged when nothing was touched', () => {
    const items = [beer, salad];
    expect(correctedItems(items, linesOfReading(items))).toEqual(items);
    expect(changedLines(items, linesOfReading(items))).toEqual([]);
  });

  it('keeps the category and the discount of a line whose figures changed', () => {
    const [line] = linesOfReading([beer]);
    const [item] = correctedItems([beer], [{ ...line, quantity: 3, total: 15 }]);
    expect(item).toMatchObject({ quantity: 3, total: 15, category: 'Bebidas', discount: 1, discountLabel: 'Promo' });
  });

  it('works the value with VAT out again when the value moved, never keeps the printed one', () => {
    const [line] = linesOfReading([beer]);
    expect(correctedItems([beer], [{ ...line, total: 20 }])[0].grossTotal).toBe(24.6);
    expect(correctedItems([beer], [{ ...line, total: 20, vatRate: null }])[0].grossTotal).toBeUndefined();
  });

  it('follows each line by its place, through a removed line and a new one', () => {
    const lines = linesOfReading([beer, salad]).slice(1);
    const added = { productName: 'SAL', quantity: 1, unit: 'un', unitPrice: 1, total: 1, vatRate: 23, pack: null };
    const items = correctedItems([beer, salad], [...lines, added]);
    expect(items.map((i) => i.product)).toEqual(['ALFACE', 'SAL']);
    expect(items[0].packAmount).toBe(2.5);
    expect(items[1].category).toBeUndefined();
  });

  it('stores a pack in the units a saved line understands', () => {
    const [line] = linesOfReading([beer]);
    const item = correctedItems([beer], [{ ...line, pack: { amount: 500, unit: 'g' } }])[0];
    expect(item).toMatchObject({ packAmount: 0.5, packUnit: 'kg' });
    expect(correctedItems([beer], [{ ...line, pack: { amount: 1, unit: 'un' } }])[0].packAmount).toBeUndefined();
  });

  it('tells the reader only what it read wrong', () => {
    const [first, second] = linesOfReading([beer, salad]);
    expect(changedLines([beer, salad], [{ ...first, total: 12, quantity: 2, unitPrice: 6 }, second])).toEqual([
      { productName: 'CERVEJA', readValue: '2 un x 5 = 10', savedValue: '2 un x 6 = 12' },
    ]);
  });
});

describe('what a doubtful reading needs first', () => {
  const kinds = (...list: string[]) => list.map((kind) => ({ kind })) as Parameters<typeof issueFocus>[0];

  it('points at the figures when only the figures are wrong', () => {
    expect(issueFocus(kinds('doesNotAddUp'))).toBe('figures');
    expect(issueFocus(kinds('linesOverTotal'))).toBe('figures');
    expect(issueFocus(kinds('totalVsVatTable', 'cannotVerify'))).toBe('figures');
  });

  it('asks for a photo when the photo explains the figures', () => {
    expect(issueFocus(kinds('covered', 'doesNotAddUp'))).toBe('photo');
    expect(issueFocus(kinds('qrUnread'))).toBe('photo');
  });

  it('asks for a page only when one is missing, ahead of anything else', () => {
    expect(issueFocus(kinds('cutOff', 'doesNotAddUp', 'missingPages'))).toBe('pages');
  });
});

describe('the deck', () => {
  it('wraps both ways round the pile', () => {
    expect(wrap(-1, 4)).toBe(3);
    expect(wrap(4, 4)).toBe(0);
    expect(wrap(3, 0)).toBe(0);
  });

  it('draws the pile and the card a step back pulls up, not the whole queue', () => {
    expect([0, 1, 2, 3, 4, 48, 49].map((d) => isDrawn(d, 50))).toEqual([true, true, true, true, false, false, true]);
  });

  it('keeps the top card straight, and every card straight when motion is reduced', () => {
    expect(deckPose(0, 3).rot).toBe(0);
    expect(deckPose(2, 3).rot).toBe(3);
    expect(deckPose(2, 3, true).rot).toBe(0);
    expect(deckPose(4, 3).opacity).toBe(0);
  });

  it('tilts each card the same way every time, within the limit', () => {
    expect(tiltFor(5, 4)).toBe(tiltFor(5, 4));
    for (let i = 0; i < 20; i++) expect(Math.abs(tiltFor(i, 4))).toBeLessThanOrEqual(4);
  });

  it('takes a long drag or a quick flick as a throw, and a nudge as neither', () => {
    expect(isThrow(120, 0, 400)).toBe(true);
    expect(isThrow(30, 0.8, 400)).toBe(true);
    expect(isThrow(30, 0.1, 400)).toBe(false);
    expect(isThrow(10, 2, 400)).toBe(false);
  });
});
