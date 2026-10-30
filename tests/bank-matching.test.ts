import { describe, it, expect } from 'vitest';
import {
  classifyMove, methodFromDescription, suggestMatches, autoMatches, namesVendor, citesInvoice,
  type OpenCost, type BankMove,
} from '@/lib/bank-matching';

const cost = (over: Partial<OpenCost>): OpenCost => ({
  id: 'c1', restaurantId: 'r1', dateKey: '2026-09-01', dueKey: '2026-10-01', amount: 100,
  vendorId: 'v1', vendorName: 'Gondocer Bebidas Lda', invoiceNumber: 'FT 2026/4471', description: null,
  ...over,
});
const move = (over: Partial<BankMove>): BankMove => ({
  id: 'm1', dateKey: '2026-09-24', amount: -100, description: 'TRF P/ GONDOCER BEBIDAS LDA', ...over,
});

describe('classifyMove', () => {
  it('separates payments from income, fees and cash', () => {
    expect(classifyMove({ amount: 50, description: 'TPA SIBS' })).toBe('INCOME');
    expect(classifyMove({ amount: -5.2, description: 'COMISSAO MANUTENCAO CONTA' })).toBe('FEE');
    expect(classifyMove({ amount: -0.21, description: 'IMPOSTO DO SELO' })).toBe('FEE');
    expect(classifyMove({ amount: -200, description: 'LEVANTAMENTO ATM AV REPUBLICA' })).toBe('CASH');
    expect(classifyMove({ amount: -100, description: 'TRF P/ TALHO CENTRAL' })).toBe('PAYMENT');
  });
});

describe('methodFromDescription', () => {
  it('reads how the bank says it paid', () => {
    expect(methodFromDescription('DD EDP COMERCIAL')).toBe('DIRECT_DEBIT');
    expect(methodFromDescription('TRF P/ MAKRO')).toBe('TRANSFER');
    expect(methodFromDescription('PAG SERV 21440')).toBe('MULTIBANCO');
  });
});

describe('names and numbers', () => {
  it('finds the supplier by one distinctive word, ignoring the legal form', () => {
    expect(namesVendor('TRF P/ GONDOCER', 'Gondocer Bebidas, Lda')).toBe(true);
    expect(namesVendor('TRF P/ OUTRO LDA', 'Gondocer Bebidas, Lda')).toBe(false);
  });

  it('finds the invoice number', () => {
    expect(citesInvoice('TRF FT 4471', 'FT 2026/4471')).toBe(true);
    expect(citesInvoice('TRF FT 4472', 'FT 2026/4471')).toBe(false);
  });
});

describe('suggestMatches', () => {
  it('is certain about one invoice of that amount from the named supplier', () => {
    const [s] = suggestMatches(move({}), [cost({})]);
    expect(s).toMatchObject({ costIds: ['c1'], confidence: 'certain' });
  });

  it('is only likely on the amount alone', () => {
    const [s] = suggestMatches(move({ description: 'TRF 000123' }), [cost({})]);
    expect(s.confidence).toBe('likely');
  });

  it('does not match a different amount, or one far outside the dates', () => {
    expect(suggestMatches(move({}), [cost({ amount: 100.01 })])).toEqual([]);
    expect(suggestMatches(move({ dateKey: '2027-03-01' }), [cost({})])).toEqual([]);
  });

  it('finds one transfer paying three invoices from the same supplier', () => {
    const costs = [
      cost({ id: 'a', amount: 40 }),
      cost({ id: 'b', amount: 35.5 }),
      cost({ id: 'c', amount: 24.5 }),
      cost({ id: 'x', amount: 12, vendorId: 'v2', vendorName: 'Outro' }),
    ];
    const [s] = suggestMatches(move({}), costs);
    expect(s.costIds.sort()).toEqual(['a', 'b', 'c']);
  });

  it('suggests nothing for fees or income', () => {
    expect(suggestMatches(move({ description: 'COMISSAO', amount: -100 }), [cost({})])).toEqual([]);
    expect(suggestMatches(move({ amount: 100 }), [cost({})])).toEqual([]);
  });

  it('lowers its confidence when two invoices fit equally', () => {
    const [s] = suggestMatches(move({ description: 'TRF 000123' }), [cost({ id: 'a' }), cost({ id: 'b' })]);
    expect(s.confidence).toBe('possible');
  });
});

describe('autoMatches', () => {
  it('only confirms certain matches', () => {
    const result = autoMatches(
      [move({ id: 'm1' }), move({ id: 'm3', description: 'TRF 1', amount: -60 })],
      [cost({ id: 'c1' }), cost({ id: 'c2', amount: 60 })],
    );
    expect(result).toEqual([{ moveId: 'm1', costIds: ['c1'] }]);
  });

  it('leaves two movements wanting the same invoice for the owner', () => {
    const result = autoMatches(
      [move({ id: 'm1' }), move({ id: 'm2', dateKey: '2026-09-25' })],
      [cost({ id: 'c1' })],
    );
    expect(result).toEqual([]);
  });
});
