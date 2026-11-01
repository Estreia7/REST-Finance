import { describe, it, expect } from 'vitest';
import { evaluate, isOutOfRange, rangeLabel, recordsCsv, PRESETS, type ChecklistItem } from '@/lib/haccp';

const items: ChecklistItem[] = [
  { id: 'a', label: 'Mãos lavadas', kind: 'check' },
  { id: 'f', label: 'Frigorífico 1', kind: 'temperature', min: 0, max: 5 },
  { id: 'z', label: 'Arca', kind: 'temperature', min: null, max: -18 },
];

describe('ranges', () => {
  it('flags readings outside the bounds only', () => {
    expect(isOutOfRange(6, items[1])).toBe(true);
    expect(isOutOfRange(-1, items[1])).toBe(true);
    expect(isOutOfRange(3.5, items[1])).toBe(false);
    expect(isOutOfRange(-15, items[2])).toBe(true);
    expect(isOutOfRange(-20, items[2])).toBe(false);
  });

  it('writes the range like a paper sheet', () => {
    expect(rangeLabel(items[1], 'a')).toBe('0 a 5 °C');
    expect(rangeLabel(items[2], 'a')).toBe('≤ -18 °C');
    expect(rangeLabel({ min: 65 }, 'a')).toBe('≥ 65 °C');
  });
});

describe('evaluate', () => {
  it('counts problems and missing answers', () => {
    const r = evaluate(items, { a: { ok: false }, f: { value: 7.04 } });
    expect(r.issues).toBe(2);
    expect(r.missing).toBe(1);
    expect(r.answers[1]).toMatchObject({ value: 7, outOfRange: true, ok: false });
  });

  it('passes a clean record', () => {
    expect(evaluate(items, { a: { ok: true }, f: { value: 3 }, z: { value: -19 } })).toMatchObject({ issues: 0, missing: 0 });
  });
});

describe('recordsCsv', () => {
  it('writes one line per answer, marking problems', () => {
    const { answers } = evaluate(items, { a: { ok: true }, f: { value: 8 }, z: { value: -20 } });
    const csv = recordsCsv([{ doneAt: '2026-10-30 09:05', template: 'Abertura', by: 'Rui', answers, notes: 'porta "aberta"' }], ['Data', 'Registo', 'Quem', 'Item', 'Valor', 'Problema', 'Notas']);
    const lines = csv.split('\r\n');
    expect(lines).toHaveLength(4);
    expect(lines[2]).toBe('"2026-10-30 09:05";"Abertura";"Rui";"Frigorífico 1";"8";"!";"porta ""aberta"""');
  });
});

describe('presets', () => {
  it('give every temperature at least one bound', () => {
    for (const p of PRESETS) for (const i of p.items) {
      if (i.kind === 'temperature') expect(i.min != null || i.max != null).toBe(true);
    }
  });
});
