import { describe, it, expect } from 'vitest';
import {
  findDuplicates,
  scoreMatch,
  significantWords,
  type InvoiceCost,
  type OrphanCost,
} from '@/lib/duplicate-costs';

// The case that prompted this: an old scan of a Makro invoice, read as a
// single cost with a misread year, and the same paper scanned again since.
const OLD_MAKRO: OrphanCost = {
  id: 'old',
  description:
    'MAKRO CASH & CARRY PORTUGAL, S.A. - COSTELINHA/PIAÇOS PORCO 1, TOPPING S. JPS HELADO, ' +
    "TOPPING MORANGO 1KG CART D'OR, TOPPING CHOCOLATE 1KG CART D'O, MC MOL.ESPECIOSA TBH. 1.1 KG",
  amount: 65.32,
  dateKey: '2020-10-26',
  vendorId: null,
};

const MAKRO_INVOICE: InvoiceCost = {
  id: 'inv',
  invoiceNumber: 'FAC 06205202601/020250',
  vendorId: 'makro',
  vendorName: 'MAKRO CASH & CARRY PORTUGAL, S.A.',
  dateKey: '2026-10-06',
  amount: 65.32,
  lineNames: [
    'COSTELINHA/PIAÇOS PORCO 1',
    'TOPPING S. JPS GELADO',
    "TOPPING MORANGO 1KG CART D'OR",
    "TOPPING CHOCOLATE 1KG CART D'O",
    'MC MOL.ESPECIOSA TBH. 1.1 KG',
  ],
};

describe('significantWords', () => {
  it('drops units, numbers, accents and the legal tail of a name', () => {
    expect(significantWords('Piaços PORCO 1KG, Lda')).toEqual(['piacos', 'porco', '1kg']);
  });
});

describe('scoreMatch', () => {
  it('pairs an old scan with the invoice whose lines it names, whatever the year', () => {
    const match = scoreMatch(OLD_MAKRO, MAKRO_INVOICE);
    expect(match).toMatchObject({ orphanId: 'old', invoiceId: 'inv', lines: 5 });
    expect(match!.matched).toBe(5);
  });

  it('tolerates the tax between the line total and the paid total', () => {
    expect(scoreMatch(OLD_MAKRO, { ...MAKRO_INVOICE, amount: 57 })).not.toBeNull();
  });

  it('refuses a different supplier selling the same products', () => {
    const recheio = { ...MAKRO_INVOICE, vendorId: 'recheio', vendorName: 'RECHEIO-ALBUFEIRA' };
    expect(scoreMatch(OLD_MAKRO, recheio)).toBeNull();
  });

  it('refuses when both name a supplier and they differ', () => {
    expect(scoreMatch({ ...OLD_MAKRO, vendorId: 'other' }, MAKRO_INVOICE)).toBeNull();
  });

  it('refuses amounts too far apart to be the same purchase', () => {
    expect(scoreMatch(OLD_MAKRO, { ...MAKRO_INVOICE, amount: 300 })).toBeNull();
  });

  it('does not pair on one product in common', () => {
    const orphan = { ...OLD_MAKRO, description: 'MAKRO - TOPPING MORANGO 1KG, AGUA 1.5L, PAPEL COZINHA' };
    expect(scoreMatch(orphan, MAKRO_INVOICE)).toBeNull();
  });

  it('ignores a cost typed by hand with no products named', () => {
    expect(scoreMatch({ ...OLD_MAKRO, description: 'Compras Makro' }, MAKRO_INVOICE)).toBeNull();
  });
});

describe('findDuplicates', () => {
  it('gives each invoice to one old cost only, the closest', () => {
    const twin = { ...OLD_MAKRO, id: 'twin', amount: 80 };
    const pairs = findDuplicates([twin, OLD_MAKRO], [MAKRO_INVOICE]);
    expect(pairs).toEqual([expect.objectContaining({ orphanId: 'old', invoiceId: 'inv' })]);
  });

  it('pairs nothing when nothing matches', () => {
    expect(findDuplicates([{ ...OLD_MAKRO, description: 'Renda' }], [MAKRO_INVOICE])).toEqual([]);
  });
});
