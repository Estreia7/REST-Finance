import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Guards the família list taken from the client's ZoneSoft report.
 *
 * These become the revenue categories the owner sees every day, so the names
 * have to match what their till prints — that is the entire reason for
 * importing them rather than using generic defaults.
 */

const CSV = path.join(process.cwd(), 'scripts', 'data', 'familias-zonesoft.csv');

interface Familia {
  name: string;
  sellable: boolean;
  note: string;
}

function readFamilias(): Familia[] {
  const lines = fs.readFileSync(CSV, 'utf8').trim().split(/\r?\n/);
  expect(lines[0]).toBe('familia,vendavel,nota');

  return lines.slice(1).map((line) => {
    const match = line.match(/^([^,]+),([^,]+),"(.*)"$/);
    expect(match, `unparseable: ${line}`).not.toBeNull();
    return { name: match![1].trim(), sellable: match![2].trim() === 'sim', note: match![3] };
  });
}

describe('the ZoneSoft família list', () => {
  const familias = readFamilias();

  it('carries every top-level família the report prints', () => {
    // Read off the 2025 report. A família missing here means a slice of the
    // owner's revenue would have nowhere to go.
    expect(familias.map((f) => f.name).sort()).toEqual([
      'BEBIDAS',
      'CAFETARIA',
      'COMIDAS',
      'DESCONTINUADOS',
      'INGREDIENTES',
      'MENUS',
      'MOLHOS',
      'PRODUTOS MAIN MENU',
      'SOBREMESAS',
      'STAFF',
    ]);
  });

  it('keeps the names exactly as the till prints them', () => {
    // Upper case, accents and spacing included. If these drift, a report from
    // the POS and a screen in this app stop reading alike, which is the whole
    // point of importing them.
    for (const f of familias) {
      expect(f.name, f.name).toBe(f.name.toUpperCase());
      expect(f.name.trim(), f.name).toBe(f.name);
    }
  });

  it('marks the famílias an owner actually sells from', () => {
    const sellable = familias.filter((f) => f.sellable).map((f) => f.name);
    expect(sellable).toContain('COMIDAS');
    expect(sellable).toContain('BEBIDAS');
    expect(sellable).toContain('MENUS');
    expect(sellable).toContain('SOBREMESAS');
  });

  it('holds back the till’s own bookkeeping groups', () => {
    // MOLHOS and INGREDIENTES are modifiers attached to a dish; STAFF is what
    // the team ate. All three appear in the report with quantities but almost
    // always a zero value, and none belongs in a revenue dropdown.
    const bookkeeping = familias.filter((f) => !f.sellable).map((f) => f.name);
    expect(bookkeeping).toContain('MOLHOS');
    expect(bookkeeping).toContain('INGREDIENTES');
    expect(bookkeeping).toContain('STAFF');
  });

  it('gives every família a note explaining what it holds', () => {
    // The note is what makes the list reviewable by someone who did not read
    // the report.
    for (const f of familias) {
      expect(f.note.length, f.name).toBeGreaterThan(5);
    }
  });

  it('has no duplicates', () => {
    // A repeated name would split the owner's revenue across two identical
    // lines.
    const names = familias.map((f) => f.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('the two ZoneSoft reports agree', () => {
  it('sums the daily report to the total the família report prints', () => {
    // The família report's own footer says 60 085,550 EUR, the same figure the
    // daily report totals to. That agreement is what says the revenue already
    // imported is right — and it is why the família list can be imported
    // without its amounts: the money is already accounted for.
    const daily = path.join(process.cwd(), 'scripts', 'data', 'vendas-2025.csv');
    const rows = fs.readFileSync(daily, 'utf8').trim().split(/\r?\n/).slice(1);
    const sum = rows.reduce((s, r) => s + Number(r.split(',')[1]), 0);

    expect(sum).toBeCloseTo(60085.55, 2);
  });
});
