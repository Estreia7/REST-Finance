import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';
import { buildScheduleSvg } from '@/lib/schedule-image';

const base = {
  restaurantName: 'Tasca do Bairro',
  weekStart: '2026-09-14',
  employees: [
    { id: 'a', name: 'Ana Silva', role: 'Cozinha', color: 'amber' },
    { id: 'b', name: 'João Pereira', role: 'Sala', color: 'sky' },
    { id: 'c', name: 'Marta R. & Filha', role: 'Balcão', color: 'emerald' },
    { id: 'd', name: 'Rui', role: null, color: 'violet' },
  ],
  shifts: [
    { employeeId: 'a', date: '2026-09-14', startMin: 540, endMin: 1020, note: null },
    { employeeId: 'a', date: '2026-09-15', startMin: 540, endMin: 1020, note: null },
    { employeeId: 'a', date: '2026-09-17', startMin: 540, endMin: 1020, note: 'Fecho' },
    { employeeId: 'b', date: '2026-09-14', startMin: 1020, endMin: 120, note: null },
    { employeeId: 'b', date: '2026-09-16', startMin: 1020, endMin: 120, note: null },
    { employeeId: 'b', date: '2026-09-19', startMin: 1020, endMin: 120, note: null },
    { employeeId: 'c', date: '2026-09-18', startMin: 600, endMin: 900, note: null },
    { employeeId: 'c', date: '2026-09-19', startMin: 600, endMin: 900, note: null },
    { employeeId: 'd', date: '2026-09-20', startMin: 660, endMin: 1080, note: null },
  ],
  closures: [{ date: '2026-09-16', reason: 'Feriado' }],
};

describe('buildScheduleSvg', () => {
  it('produces parseable SVG', () => {
    const { svg, width, height } = buildScheduleSvg(base);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg.endsWith('</svg>')).toBe(true);
    expect(width).toBeGreaterThan(600);
    expect(height).toBeGreaterThan(200);
  });

  it('escapes names that would break the markup', () => {
    const { svg } = buildScheduleSvg(base);
    // "Marta R. & Filha" must not put a bare ampersand into the XML.
    expect(svg).not.toMatch(/&(?!amp;|lt;|gt;|quot;|apos;|#)/);
    expect(svg).toContain('Marta R. &amp; Filha');
  });

  it('names the closed day', () => {
    const { svg } = buildScheduleSvg(base);
    expect(svg).toContain('Feriado');
  });

  it('leaves out people with no shifts this week', () => {
    const { svg } = buildScheduleSvg({
      ...base,
      employees: [...base.employees, { id: 'z', name: 'ZZNaoTrabalha', role: null, color: 'rose' }],
    });
    expect(svg).not.toContain('ZZNaoTrabalha');
  });

  it('says so when the week is empty rather than drawing a blank grid', () => {
    const { svg } = buildScheduleSvg({ ...base, shifts: [], closures: [] });
    expect(svg).toContain('Sem turnos marcados');
  });

  it('rasterises to a real JPEG', async () => {
    const { svg, width, height } = buildScheduleSvg(base);
    const jpeg = await sharp(Buffer.from(svg), { density: 144 })
      .resize(width * 2, height * 2, { fit: 'fill' })
      .flatten({ background: '#fbfaf8' })
      .jpeg({ quality: 92, chromaSubsampling: '4:4:4' })
      .toBuffer();

    const meta = await sharp(jpeg).metadata();
    expect(meta.format).toBe('jpeg');
    expect(meta.width).toBe(width * 2);

    if (process.env.SCHEDULE_IMAGE_OUT) {
      writeFileSync(process.env.SCHEDULE_IMAGE_OUT, jpeg);
    }
  });
});
