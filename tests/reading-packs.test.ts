import { describe, it, expect } from 'vitest';
import { withoutBatch } from '@/lib/invoice-categories';
import { fromPrinted, packFromParts, toPack } from '@/lib/line-setup';

describe('packFromParts', () => {
  it('multiplies packs by what each holds', () => {
    expect(packFromParts(6, 18, 'un')).toEqual({ amount: 108, unit: 'un' });
    expect(packFromParts(1, 2.5, 'kg')).toEqual({ amount: 2.5, unit: 'kg' });
  });

  it('refuses what is not a quantity', () => {
    expect(packFromParts(0, 18, 'un')).toBeNull();
    expect(packFromParts(6, Number.NaN, 'un')).toBeNull();
  });

  it('prices one tortilla from the line, which keeps its total', () => {
    const pack = toPack(packFromParts(6, 18, 'un')!);
    const line = fromPrinted({ quantity: 1, unit: 'un', unitPrice: 26.9, total: 26.9 }, pack);
    expect(line).toMatchObject({ quantity: 108, unit: 'un', unitPrice: 0.2491, packFactor: 108 });
  });
});

describe('withoutBatch', () => {
  it('leaves the product when delivery note, batch and expiry go', () => {
    expect(withoutBatch('Tortilha de Trigo ø30Cm Cx. 6*(18*90g) L: 4625180 Qtd: 1,00 Val: 26/12/2025'))
      .toBe('Tortilha de Trigo ø30Cm Cx. 6*(18*90g)');
    expect(withoutBatch('Nº Guia Remessa GRV325003770: SM28 Tropical Delight Cx. 33*150g L: NI052505 Qtd: 1,00 Val: 26/05/2027'))
      .toBe('SM28 Tropical Delight Cx. 33*150g');
  });

  it('makes two purchases of one product the same wording', () => {
    expect(withoutBatch('Tortilha Cx. 6 L: 111 Qtd: 1,00 Val: 01/01/2026'))
      .toBe(withoutBatch('Tortilha Cx. 6 L: 222 Qtd: 3,00 Val: 09/09/2026'));
  });

  it('touches nothing else', () => {
    for (const name of ['AGUA 1.5 L', 'BATATA PALITO 2,5 KG', 'LEITE MCHEF UHT GORDO LT', 'AZEITE 3L']) {
      expect(withoutBatch(name)).toBe(name);
    }
  });
});
