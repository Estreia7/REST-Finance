import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildLeaveMapPages, leaveMapRows, paginateRows, formatPeriod, PAGE_WIDTH, PAGE_HEIGHT,
  LEAVE_MAP_COPY_KEYS, type LeaveMapInput,
} from '@/lib/leave-map';
import { leaveMapPdf } from '@/lib/leave-map-render';
import { getTranslation } from '@/lib/translations';

const copyFor = (language: 'pt' | 'en') =>
  Object.fromEntries(
    LEAVE_MAP_COPY_KEYS.map((k) => [k, getTranslation(language, `leave.map.sheet.${k}`)]),
  ) as unknown as LeaveMapInput['copy'];

const base: LeaveMapInput = {
  restaurantName: 'Tasca do Bairro',
  taxId: '509123456',
  year: 2026,
  employees: [
    { id: 'a', name: 'Ana Silva', role: 'Cozinha', color: 'amber' },
    { id: 'b', name: 'João Pereira', role: 'Sala', color: 'sky' },
    { id: 'c', name: 'Marta R. & Filha', role: 'Balcão', color: 'emerald' },
    { id: 'd', name: 'Rui', role: null, color: 'violet' },
  ],
  leaves: [
    { employeeId: 'a', start: '2026-08-03', end: '2026-08-14' },
    { employeeId: 'a', start: '2026-12-21', end: '2027-01-02' },
    { employeeId: 'b', start: '2025-12-29', end: '2026-01-09' },
    { employeeId: 'b', start: '2026-06-08', end: '2026-06-12' },
    { employeeId: 'b', start: '2026-09-14', end: '2026-09-18' },
    { employeeId: 'c', start: '2026-04-27', end: '2026-05-08' },
  ],
  madeOn: '2026-04-10',
  language: 'pt',
  copy: copyFor('pt'),
};

describe('leave map', () => {
  it('draws one A4 landscape page for a small team', () => {
    const { pages, width, height } = buildLeaveMapPages(base);
    expect(pages).toHaveLength(1);
    expect(width).toBe(PAGE_WIDTH);
    expect(height).toBe(PAGE_HEIGHT);
    expect(width / height).toBeCloseTo(297 / 210, 2);
    expect(pages[0].startsWith('<svg')).toBe(true);
  });

  it('escapes names and names the employer', () => {
    const svg = buildLeaveMapPages(base).pages[0];
    expect(svg).toContain('Marta R. &amp; Filha');
    expect(svg).not.toContain('& Filha');
    expect(svg).toContain('509123456');
    expect(svg).toContain('2026');
  });

  it('counts only the working days that fall inside the year', () => {
    const rows = leaveMapRows(base);
    // 3–14 Aug is 10 working days; 15 Aug is a Saturday and holiday anyway.
    // 21 Dec–2 Jan, within 2026: 21–24, 28–31 Dec = 8 (25 Dec is a holiday).
    expect(rows[0].days).toBe(18);
    // 29 Dec 2025–9 Jan 2026, within 2026: 2, 5–9 Jan = 6 (1 Jan is a holiday).
    // 8–12 Jun = 4, because 10 June is Dia de Portugal.
    expect(rows[1].periods).toHaveLength(3);
    expect(rows[1].days).toBe(6 + 4 + 5);
    expect(rows[3].periods).toHaveLength(0);
  });

  it('lists someone with nothing booked rather than leaving them off', () => {
    const svg = buildLeaveMapPages(base).pages[0];
    expect(svg).toContain('>Rui<');
    expect(svg).toContain('Por marcar');
  });

  it('writes each booking compactly, with the year when it is another', () => {
    expect(formatPeriod('2026-08-03', '2026-08-14', 2026, 'pt')).toBe('3 – 14 ago');
    expect(formatPeriod('2026-07-28', '2026-08-07', 2026, 'pt')).toBe('28 jul – 7 ago');
    expect(formatPeriod('2025-12-29', '2026-01-09', 2026, 'pt')).toBe('29 dez 2025 – 9 jan');
    expect(formatPeriod('2026-08-03', '2026-08-03', 2026, 'en')).toBe('3 Aug');
  });

  it('splits a large team over pages without splitting a person', () => {
    const employees = Array.from({ length: 30 }, (_, i) => ({
      id: `e${i}`, name: `Colaborador ${i + 1}`, role: 'Sala', color: 'slate',
    }));
    const { pages } = buildLeaveMapPages({ ...base, employees, leaves: [] });
    expect(pages.length).toBeGreaterThan(1);
    expect(pages[0]).toContain('Página 1 de');
    const rows = paginateRows(leaveMapRows({ year: 2026, employees, leaves: [] }));
    expect(rows.flat()).toHaveLength(30);
  });

  it('makes an A4 landscape PDF with one page per sheet', async () => {
    const employees = Array.from({ length: 30 }, (_, i) => ({
      id: `e${i}`, name: `Colaborador ${i + 1}`, role: 'Sala', color: 'slate',
    }));
    const { pages, width, height } = buildLeaveMapPages({ ...base, employees, leaves: [] });
    const pdf = await leaveMapPdf(pages, { width, height }, { title: 'Mapa de férias 2026' });
    const text = pdf.toString('latin1');
    expect(text.startsWith('%PDF-')).toBe(true);
    expect(text.match(/\/Type \/Page\b/g)).toHaveLength(pages.length);
    // A4 landscape in points: 841.89 x 595.28.
    expect(text).toMatch(/\/MediaBox \[0 0 841\.89\d* 595\.28\d*\]/);
    const scratch = process.env.LEAVE_MAP_OUT;
    if (scratch) {
      mkdirSync(scratch, { recursive: true });
      writeFileSync(join(scratch, 'leave-map.pdf'), pdf);
    }
  }, 30_000);

  it('rasterises to a printable image', async () => {
    const scratch = process.env.LEAVE_MAP_OUT;
    for (const language of ['pt', 'en'] as const) {
      const { pages } = buildLeaveMapPages({ ...base, language, copy: copyFor(language) });
      const png = await sharp(Buffer.from(pages[0]), { density: 144 }).png().toBuffer();
      const meta = await sharp(png).metadata();
      expect(meta.width).toBe(PAGE_WIDTH * 2);
      if (scratch) {
        mkdirSync(scratch, { recursive: true });
        writeFileSync(join(scratch, `leave-map-${language}.png`), png);
      }
    }
  });
});
