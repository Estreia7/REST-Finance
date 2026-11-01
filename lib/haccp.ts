/**
 * HACCP records: checklists and temperature readings, filled in during the
 * day and kept as evidence for an inspection.
 *
 * A template is a list of items, each a yes/no check or a temperature with
 * its allowed range. A record is one filling-in of a template, with every
 * answer and how many were out of order. The labels are the restaurant's own
 * text (templates are created in the owner's language and can be edited), so
 * only the preset keys and ranges live here.
 *
 * Pure, and tested in tests/haccp.test.ts.
 */

export type ItemKind = 'check' | 'temperature';

export interface ChecklistItem {
  id: string;
  label: string;
  kind: ItemKind;
  /** °C, for a temperature; null where there is no bound. */
  min?: number | null;
  max?: number | null;
}

export interface Answer {
  id: string;
  label: string;
  kind: ItemKind;
  ok: boolean | null;
  value: number | null;
  outOfRange: boolean;
}

/** Ready-made templates. Labels are dictionary keys under haccp.presets. */
export const PRESETS: Array<{ key: string; items: Array<{ key: string; kind: ItemKind; min?: number | null; max?: number | null }> }> = [
  {
    key: 'opening',
    items: [
      { key: 'handwash', kind: 'check' },
      { key: 'surfaces', kind: 'check' },
      { key: 'deliveries', kind: 'check' },
      { key: 'pests', kind: 'check' },
    ],
  },
  {
    key: 'temperatures',
    items: [
      { key: 'fridge1', kind: 'temperature', min: 0, max: 5 },
      { key: 'fridge2', kind: 'temperature', min: 0, max: 5 },
      { key: 'freezer', kind: 'temperature', max: -18 },
      { key: 'hotHolding', kind: 'temperature', min: 65 },
    ],
  },
  {
    key: 'closing',
    items: [
      { key: 'leftovers', kind: 'check' },
      { key: 'floors', kind: 'check' },
      { key: 'bins', kind: 'check' },
      { key: 'equipmentOff', kind: 'check' },
    ],
  },
  {
    key: 'cleaning',
    items: [
      { key: 'diningRoom', kind: 'check' },
      { key: 'toilets', kind: 'check' },
      { key: 'soap', kind: 'check' },
    ],
  },
];

export function isOutOfRange(value: number, item: Pick<ChecklistItem, 'min' | 'max'>): boolean {
  if (item.min != null && value < item.min) return true;
  if (item.max != null && value > item.max) return true;
  return false;
}

/** The range as people write it on a sheet: "0 a 5 °C", "≤ -18 °C", "≥ 65 °C". */
export function rangeLabel(item: Pick<ChecklistItem, 'min' | 'max'>, and: string): string {
  if (item.min != null && item.max != null) return `${item.min} ${and} ${item.max} °C`;
  if (item.max != null) return `≤ ${item.max} °C`;
  if (item.min != null) return `≥ ${item.min} °C`;
  return '°C';
}

/**
 * Checks a filling-in against its template. Every item must be answered; a
 * check is a problem when marked not OK, a temperature when outside its range.
 */
export function evaluate(
  items: ChecklistItem[],
  given: Record<string, { ok?: boolean | null; value?: number | null }>,
): { answers: Answer[]; issues: number; missing: number } {
  let issues = 0;
  let missing = 0;
  const answers = items.map((item): Answer => {
    const g = given[item.id] ?? {};
    if (item.kind === 'temperature') {
      const value = typeof g.value === 'number' && Number.isFinite(g.value) ? Math.round(g.value * 10) / 10 : null;
      if (value === null) missing++;
      const out = value !== null && isOutOfRange(value, item);
      if (out) issues++;
      return { id: item.id, label: item.label, kind: item.kind, ok: value === null ? null : !out, value, outOfRange: out };
    }
    const ok = typeof g.ok === 'boolean' ? g.ok : null;
    if (ok === null) missing++;
    if (ok === false) issues++;
    return { id: item.id, label: item.label, kind: item.kind, ok, value: null, outOfRange: false };
  });
  return { answers, issues, missing };
}

/** Records as CSV for an inspector: one line per answer. Quoted, ";"-separated for a Portuguese Excel. */
export function recordsCsv(
  records: Array<{ doneAt: string; template: string; by: string | null; answers: Answer[]; notes: string | null }>,
  header: string[],
): string {
  const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const rows = [header.map(q).join(';')];
  for (const r of records) {
    for (const a of r.answers) {
      rows.push([r.doneAt, r.template, r.by ?? '', a.label, a.kind === 'temperature' ? String(a.value ?? '') : a.ok === null ? '' : a.ok ? 'OK' : 'X', a.outOfRange || a.ok === false ? '!' : '', r.notes ?? '']
        .map((x) => q(String(x))).join(';'));
    }
  }
  return rows.join('\r\n');
}
