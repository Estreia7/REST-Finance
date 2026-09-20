import { describe, it, expect } from 'vitest';
import {
  parseFamiliaSheet,
  parsePtNumber,
  parsePtDate,
  toFamilia,
  ImportFormatError,
  type SheetRow,
} from '@/lib/zonesoft-import';

/**
 * Every fixture here is copied from the client's real 2025 export, so the
 * parser is tested against the format ZoneSoft actually produces rather than
 * one invented to suit the code.
 */

const HEADER = ['Data', 'Descrição', 'Quantidade', 'Valor Total S/IVA', 'Valor Total'];

/** 2 January 2025, exactly as the report prints it. Totals 240,700€. */
const JAN_2: SheetRow[] = [
  ['02-01-2025', 'BEBIDAS/', '1,000', '0,000€', '0,000€'],
  ['02-01-2025', 'BEBIDAS/SUMOS E AGUAS', '4,000', '6,179€', '7,600€'],
  ['02-01-2025', 'BEBIDAS/SMOOTIES', '1,000', '3,902€', '4,800€'],
  ['02-01-2025', 'CAFETARIA/MILKSHAKES', '4,000', '10,088€', '11,400€'],
  ['02-01-2025', 'COMIDAS/SMASHIES', '16,000', '162,389€', '183,500€'],
  ['02-01-2025', 'COMIDAS/ESPECIAIS', '1,000', '7,522€', '8,500€'],
  ['02-01-2025', 'DESCONTINUADOS/', '6,000', '12,599€', '14,700€'],
  ['02-01-2025', 'INGREDIENTES/', '59,000', '0,000€', '0,000€'],
  ['02-01-2025', 'MENUS/', '1,000', '8,130€', '10,000€'],
  ['02-01-2025', 'MOLHOS/', '19,000', '0,000€', '0,000€'],
  ['02-01-2025', 'PRODUTOS MAIN MENU/', '1,000', '0,163€', '0,200€'],
].map((cells, index) => ({ index: index + 2, cells }));

describe('parsePtNumber', () => {
  it('reads the euro amounts the export prints', () => {
    expect(parsePtNumber('183,500€')).toBe(183.5);
    expect(parsePtNumber('0,000€')).toBe(0);
    expect(parsePtNumber('16,000')).toBe(16);
  });

  it('handles thousands separators', () => {
    // The yearly total line: "60 085,550€" and "1.234,56€".
    expect(parsePtNumber('1.234,56€')).toBeCloseTo(1234.56, 2);
    expect(parsePtNumber('60 085,550€')).toBeCloseTo(60085.55, 2);
  });

  it('takes a number straight through, as a spreadsheet hands it back', () => {
    expect(parsePtNumber(183.5)).toBe(183.5);
  });

  it('returns null rather than zero for an unreadable cell', () => {
    // Zero would be silently summed and understate the day.
    expect(parsePtNumber('')).toBeNull();
    expect(parsePtNumber('n/a')).toBeNull();
    expect(parsePtNumber(null)).toBeNull();
  });
});

describe('parsePtDate', () => {
  it('reads the day-first form the export prints', () => {
    expect(parsePtDate('02-01-2025')).toBe('2025-01-02');
    expect(parsePtDate('31-12-2025')).toBe('2025-12-31');
  });

  it('accepts a real Date, as a spreadsheet may supply', () => {
    expect(parsePtDate(new Date(Date.UTC(2025, 0, 2)))).toBe('2025-01-02');
  });

  it('rejects a day that does not exist', () => {
    expect(parsePtDate('30-02-2025')).toBeNull();
    expect(parsePtDate('32-01-2025')).toBeNull();
  });

  it('rejects the ISO form, which would mean the columns are swapped', () => {
    expect(parsePtDate('2025-01-02')).toBeNull();
  });
});

describe('toFamilia', () => {
  it('rolls a sub-família up into its família', () => {
    expect(toFamilia('COMIDAS/SMASHIES')).toBe('COMIDAS');
    expect(toFamilia('BEBIDAS/SUMOS E AGUAS')).toBe('BEBIDAS');
  });

  it('reads a família filed under itself', () => {
    expect(toFamilia('MENUS/')).toBe('MENUS');
  });

  it('keeps a multi-word família whole', () => {
    expect(toFamilia('PRODUTOS MAIN MENU/')).toBe('PRODUTOS MAIN MENU');
  });
});

describe('parseFamiliaSheet', () => {
  it('reconciles a real day to the cent', () => {
    // 240,700€ is what the daily report says for 2 January. If the two
    // disagree, one of them has been read wrong.
    const parsed = parseFamiliaSheet(HEADER, JAN_2);
    expect(parsed.grandTotal).toBeCloseTo(240.7, 2);
    expect(parsed.dailyTotals).toEqual([{ date: '2025-01-02', revenue: 240.7 }]);
  });

  it('rolls sub-famílias into one row per família per day', () => {
    const parsed = parseFamiliaSheet(HEADER, JAN_2);

    // Three BEBIDAS rows become one: 0 + 7,60 + 4,80.
    const bebidas = parsed.rows.find((r) => r.familia === 'BEBIDAS');
    expect(bebidas!.revenue).toBeCloseTo(12.4, 2);
    expect(bebidas!.quantity).toBe(6);

    // Two COMIDAS rows: 183,50 + 8,50.
    const comidas = parsed.rows.find((r) => r.familia === 'COMIDAS');
    expect(comidas!.revenue).toBeCloseTo(192, 2);
  });

  it('takes the VAT-inclusive column, not the tax base', () => {
    // The trap: "Valor Total S/IVA" sits immediately before "Valor Total"
    // and reads almost the same. Taking it would understate the day by ~14%.
    const parsed = parseFamiliaSheet(HEADER, JAN_2);
    const comidas = parsed.rows.find((r) => r.familia === 'COMIDAS');
    expect(comidas!.revenue).toBeCloseTo(192, 2);
    // The net figures were 162,389 + 7,522 = 169,911.
    expect(comidas!.revenue).not.toBeCloseTo(169.91, 2);
  });

  it('finds the columns by name, whatever order they arrive in', () => {
    const reordered = ['Valor Total', 'Data', 'Quantidade', 'Descrição', 'Valor Total S/IVA'];
    const rows: SheetRow[] = [
      { index: 2, cells: ['183,500€', '02-01-2025', '16,000', 'COMIDAS/SMASHIES', '162,389€'] },
    ];
    const parsed = parseFamiliaSheet(reordered, rows);
    expect(parsed.rows[0]).toMatchObject({ familia: 'COMIDAS', revenue: 183.5, quantity: 16 });
  });

  it('lists every família it saw', () => {
    const parsed = parseFamiliaSheet(HEADER, JAN_2);
    expect(parsed.familias).toEqual([
      'BEBIDAS', 'CAFETARIA', 'COMIDAS', 'DESCONTINUADOS',
      'INGREDIENTES', 'MENUS', 'MOLHOS', 'PRODUTOS MAIN MENU',
    ]);
  });

  it('keeps famílias that sold nothing', () => {
    // MOLHOS and INGREDIENTES show quantities against zero money. Dropping
    // them would hide that the till recorded them at all.
    const parsed = parseFamiliaSheet(HEADER, JAN_2);
    const molhos = parsed.rows.find((r) => r.familia === 'MOLHOS');
    expect(molhos).toBeDefined();
    expect(molhos!.revenue).toBe(0);
    expect(molhos!.quantity).toBe(19);
  });

  it('separates days rather than merging the year', () => {
    const twoDays: SheetRow[] = [
      { index: 2, cells: ['02-01-2025', 'COMIDAS/SMASHIES', '16,000', '162,389€', '183,500€'] },
      { index: 3, cells: ['03-01-2025', 'COMIDAS/SMASHIES', '14,000', '131,598€', '149,600€'] },
    ];
    const parsed = parseFamiliaSheet(HEADER, twoDays);
    expect(parsed.dailyTotals).toEqual([
      { date: '2025-01-02', revenue: 183.5 },
      { date: '2025-01-03', revenue: 149.6 },
    ]);
  });

  it('skips the repeated page headers and the final Total line', () => {
    // A 67-page export repeats its header on every page.
    const withNoise: SheetRow[] = [
      { index: 2, cells: ['02-01-2025', 'COMIDAS/SMASHIES', '16,000', '162,389€', '183,500€'] },
      { index: 3, cells: ['Data', 'Descrição', 'Quantidade', 'Valor Total S/IVA', 'Valor Total'] },
      { index: 4, cells: ['Total:', '', '35 703,000', '52 572,806€', '60 085,550€'] },
    ];
    const parsed = parseFamiliaSheet(HEADER, withNoise);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.skipped).toHaveLength(0);
  });

  it('reports a row it could not read rather than dropping it silently', () => {
    const broken: SheetRow[] = [
      { index: 2, cells: ['02-01-2025', 'COMIDAS/SMASHIES', '16,000', '162,389€', 'oops'] },
    ];
    const parsed = parseFamiliaSheet(HEADER, broken);
    expect(parsed.rows).toHaveLength(0);
    expect(parsed.skipped).toEqual([{ row: 2, reason: 'invalidRevenue' }]);
  });

  it('refuses a file that is not this report', () => {
    expect(() => parseFamiliaSheet(['Produto', 'Preço'], [])).toThrow(ImportFormatError);
  });

  it('adds many amounts without floating-point drift', () => {
    // 0,1 + 0,2 is 0,30000000000000004 in binary floating point; a day of
    // takings must not arrive with a tail of digits.
    const cents: SheetRow[] = Array.from({ length: 30 }, (_, i) => ({
      index: i + 2,
      cells: ['02-01-2025', 'COMIDAS/X', '1,000', '0,08€', '0,10€'],
    }));
    const parsed = parseFamiliaSheet(HEADER, cents);
    expect(parsed.rows[0].revenue).toBe(3);
  });
});
