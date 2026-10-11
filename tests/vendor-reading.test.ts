import { describe, it, expect } from 'vitest';
import { looksLikeCustomer, checkVendorReading, takesLongerName, normaliseName } from '@/lib/vendor-reading';

const smash = { names: ['Smash and Dough', 'Daniel'], taxIds: [] };

describe('looksLikeCustomer', () => {
  it('catches the owner read as the supplier', () => {
    // The real case: FR 26202304/0000049479, issued to the owner by name.
    expect(looksLikeCustomer('DANIEL MARQUES ARAÚJO', smash)).toBe(true);
    expect(looksLikeCustomer('Daniel Marques Araújo', { names: ['Daniel Araújo'], taxIds: [] })).toBe(true);
  });

  it('catches the restaurant read as the supplier', () => {
    expect(looksLikeCustomer('SMASH AND DOUGH', smash)).toBe(true);
  });

  it('leaves real suppliers alone, even ones that share a first name', () => {
    expect(looksLikeCustomer('RECHEIO-ALBUFEIRA', smash)).toBe(false);
    expect(looksLikeCustomer('Talho do Daniel', smash)).toBe(false);
    expect(looksLikeCustomer('Daniel Carnes Lda', smash)).toBe(false);
    expect(looksLikeCustomer('', smash)).toBe(false);
  });
});

describe('checkVendorReading', () => {
  it('drops the customer NIF, and takes the QR issuer instead', () => {
    expect(checkVendorReading({ vendor: 'X', vendorTaxId: '123456789' }, { names: [], taxIds: ['123456789'] }, { issuerNif: '500145415' }))
      .toEqual({ vendorTaxId: '500145415', doubt: 'customerNif' });
  });

  it('recognises the QR buyer as the customer', () => {
    expect(checkVendorReading({ vendor: 'X', vendorTaxId: '234567890' }, { names: [], taxIds: [] }, { buyerNif: '234567890' }))
      .toEqual({ vendorTaxId: undefined, doubt: 'customerNif' });
  });

  it('keeps a good NIF but flags the customer name', () => {
    expect(checkVendorReading({ vendor: 'DANIEL MARQUES ARAÚJO', vendorTaxId: '500145415' }, smash, { issuerNif: '500145415' }))
      .toEqual({ vendorTaxId: '500145415', doubt: 'customerName' });
  });

  it('passes a clean reading', () => {
    expect(checkVendorReading({ vendor: 'RECHEIO-ALBUFEIRA', vendorTaxId: '500145415' }, smash))
      .toEqual({ vendorTaxId: '500145415', doubt: null });
  });
});

describe('takesLongerName', () => {
  it('takes a fuller reading of the same name', () => {
    expect(takesLongerName('PROFUNDA ORIGEM', "PROFUNDA ORIGEM - Profunda D'Origem-Comércio Carnes, Lda")).toBe(true);
  });

  it('never lets a different, longer name rename a supplier', () => {
    expect(takesLongerName('RECHEIO-ALBUFEIRA', 'DANIEL MARQUES ARAÚJO')).toBe(false);
    expect(takesLongerName('Makro', 'Makro')).toBe(false);
  });

  it('compares without accents or punctuation', () => {
    expect(normaliseName('Araújo, Lda.')).toBe('araujo lda');
  });
});
