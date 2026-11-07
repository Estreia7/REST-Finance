import { describe, expect, it } from 'vitest';
import { nifOn, ourNifs, validateNifChange } from '@/lib/restaurant-nif';
import { checkVendorReading } from '@/lib/vendor-reading';

const OLD = '245678905';
const NEW = '516789015';
const changed = { taxId: OLD, newTaxId: NEW, newTaxIdFrom: new Date('2026-11-01T00:00:00Z') };

describe('a business that changed NIF', () => {
  it('counts both NIFs as the restaurant', () => {
    expect(ourNifs(changed)).toEqual([OLD, NEW]);
    expect(ourNifs({ taxId: OLD })).toEqual([OLD]);
    expect(ourNifs({ taxId: null })).toEqual([]);
  });

  it('makes invoices out to the new NIF from the day it starts', () => {
    expect(nifOn(changed, '2026-10-31')).toBe(OLD);
    expect(nifOn(changed, '2026-11-01')).toBe(NEW);
    expect(nifOn(changed, new Date('2026-12-15T10:00:00Z'))).toBe(NEW);
    expect(nifOn({ taxId: OLD }, '2027-01-01')).toBe(OLD);
  });

  it('never files the new company as the supplier', () => {
    const verdict = checkVendorReading(
      { vendor: 'Restaurante Daniel Lda', vendorTaxId: NEW },
      { names: [], taxIds: ourNifs(changed) },
    );
    expect(verdict.vendorTaxId).not.toBe(NEW);
  });
});

describe('the change as typed in Settings', () => {
  const ok = { changed: true, taxId: OLD, newTaxId: NEW, from: '2026-11-01' };

  it('keeps a valid NIF and its first day', () => {
    const r = validateNifChange(ok);
    expect(r).toEqual({ ok: true, newTaxId: NEW, newTaxIdFrom: new Date('2026-11-01T00:00:00.000Z') });
  });

  it('clears both when switched off', () => {
    expect(validateNifChange({ ...ok, changed: false, newTaxId: 'x' })).toEqual({ ok: true, newTaxId: null, newTaxIdFrom: null });
  });

  it('refuses a bad NIF, the same NIF, or no date', () => {
    expect(validateNifChange({ ...ok, newTaxId: '123' })).toEqual({ ok: false, error: 'settings.nifChange.invalid' });
    expect(validateNifChange({ ...ok, newTaxId: OLD })).toEqual({ ok: false, error: 'settings.nifChange.same' });
    expect(validateNifChange({ ...ok, from: '' })).toEqual({ ok: false, error: 'settings.nifChange.dateMissing' });
  });
});
