import { describe, it, expect } from 'vitest';
import {
  setupChecklist, checklistProgress, validateRoom, parseAmount, categoryForPreset, type SetupFacts,
} from '@/lib/onboarding';

const empty: SetupFacts = {
  taxId: null, municipalityCode: null, taxSettingsSaved: false,
  seats: null, serviceHoursPerDay: null,
  revenueDays: 0, costEntries: 0, recurringCosts: 0, staffCount: 0, complianceDocs: 0,
};

describe('setupChecklist', () => {
  it('starts with nothing done', () => {
    const items = setupChecklist(empty);
    expect(checklistProgress(items)).toEqual({ done: 0, total: 9 });
  });

  it('needs both seats and hours for the room', () => {
    const half = setupChecklist({ ...empty, seats: 40 });
    expect(half.find((i) => i.key === 'room')?.done).toBe(false);
    const full = setupChecklist({ ...empty, seats: 40, serviceHoursPerDay: 8 });
    expect(full.find((i) => i.key === 'room')?.done).toBe(true);
  });

  it('counts everything once filled', () => {
    const items = setupChecklist({
      taxId: '501234567', municipalityCode: '1312', taxSettingsSaved: true,
      seats: 40, serviceHoursPerDay: 8,
      revenueDays: 3, costEntries: 2, recurringCosts: 1, staffCount: 1, complianceDocs: 1,
    });
    expect(checklistProgress(items)).toEqual({ done: 9, total: 9 });
  });

  it('points the VAT region at the Estado tab', () => {
    expect(setupChecklist(empty).find((i) => i.key === 'vatRegion')?.tab).toBe('estado');
  });
});

describe('validateRoom', () => {
  it('accepts everything empty', () => {
    expect(validateRoom({ seats: '', serviceHoursPerDay: '', monthlyRevenueTarget: '' })).toEqual({
      ok: true, seats: null, serviceHoursPerDay: null, monthlyRevenueTarget: null,
    });
  });

  it('reads a comma decimal for hours and a PT amount for the target', () => {
    expect(validateRoom({ seats: '42', serviceHoursPerDay: '9,5', monthlyRevenueTarget: '30.000,00' })).toEqual({
      ok: true, seats: 42, serviceHoursPerDay: 9.5, monthlyRevenueTarget: 30000,
    });
  });

  it('refuses unbelievable values', () => {
    expect(validateRoom({ seats: '0', serviceHoursPerDay: '', monthlyRevenueTarget: '' })).toMatchObject({ ok: false });
    expect(validateRoom({ seats: '12.5', serviceHoursPerDay: '', monthlyRevenueTarget: '' })).toMatchObject({ ok: false });
    expect(validateRoom({ seats: '', serviceHoursPerDay: '25', monthlyRevenueTarget: '' })).toMatchObject({ ok: false });
    expect(validateRoom({ seats: '', serviceHoursPerDay: '', monthlyRevenueTarget: 'abc' })).toMatchObject({ ok: false });
  });
});

describe('parseAmount', () => {
  it('reads both conventions', () => {
    expect(parseAmount('1.250,50')).toBe(1250.5);
    expect(parseAmount('1250.50')).toBe(1250.5);
    expect(parseAmount('900 €')).toBe(900);
  });

  it('reads a dot before three digits as thousands, the Portuguese way', () => {
    expect(parseAmount('1.200')).toBe(1200);
    expect(parseAmount('25.000')).toBe(25000);
    expect(parseAmount('1.250.000')).toBe(1250000);
    // Not a thousands group: a decimal.
    expect(parseAmount('12.5')).toBe(12.5);
    expect(parseAmount('60.50')).toBe(60.5);
  });

  it('skips blank and non-positive rows', () => {
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('0')).toBeNull();
    expect(parseAmount('-5')).toBeNull();
  });
});

describe('categoryForPreset', () => {
  const defaults = [
    { id: 'food', name: 'Comida', type: 'COGS' },
    { id: 'wages', name: 'Ordenados', type: 'OPEX', isLabour: true },
    { id: 'ss', name: 'Segurança Social', type: 'OPEX', isLabour: true },
    { id: 'rent', name: 'Renda', type: 'OPEX', isOccupancy: true },
    { id: 'water', name: 'Água', type: 'OPEX' },
  ];

  it('matches the default names, accents or not', () => {
    expect(categoryForPreset('rent', defaults)).toBe('rent');
    expect(categoryForPreset('socialSecurity', defaults)).toBe('ss');
    expect(categoryForPreset('water', defaults)).toBe('water');
  });

  it('falls back to the flag when the owner renamed it', () => {
    const renamed = [{ id: 'occ', name: 'Aluguer', type: 'OPEX', isOccupancy: true }];
    expect(categoryForPreset('rent', renamed)).toBe('occ');
  });

  it('gives none rather than a wrong guess', () => {
    expect(categoryForPreset('gas', defaults)).toBeNull();
  });
});
