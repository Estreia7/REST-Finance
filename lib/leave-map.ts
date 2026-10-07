/**
 * The holiday map, drawn as A4 landscape SVG pages for the staff-room wall.
 *
 * Portuguese law asks for it in so many words (Código do Trabalho, art. 241.º
 * n.º 9): the employer draws up a map with the start and end of every
 * worker's holidays by 15 April and keeps it posted at the workplace until
 * 31 October. So the sheet has to answer two readers at once: a colleague
 * looking for their own name, and an inspector checking that the map exists,
 * whose it is and that every worker is on it.
 *
 * One drawing serves both ways out: the route rasterises these pages with
 * sharp for the preview and embeds the same rasters in the PDF, so what the
 * owner previews is exactly what comes out of the printer.
 *
 * Deliberately left off: the note on each booking. It is the owner's private
 * memo ("casamento", "combinado em março") and this sheet hangs on a wall.
 *
 * Every string is escaped: names are user input, and one bare ampersand makes
 * the whole SVG fail to parse.
 */

import { dateKey, employeeColor, parseDateKey } from './schedule';
import { datesBetween, leaveWorkingDays, portugueseHolidays } from './leave';

export interface LeaveMapEmployee {
  id: string;
  name: string;
  role: string | null;
  color: string;
}

export interface LeaveMapLeave {
  employeeId: string;
  start: string;
  end: string;
}

/** The words on the sheet, already in the reader's language. */
export interface LeaveMapCopy {
  title: string;
  employee: string;
  periods: string;
  workingDays: string;
  notBooked: string;
  legendLeave: string;
  legendHoliday: string;
  legendWeekend: string;
  legal: string;
  madeOn: string;
  employer: string;
  page: string;
  of: string;
  taxId: string;
}

/** Every word on the sheet; each lives in the dictionary under `leave.map.sheet`. */
export const LEAVE_MAP_COPY_KEYS: Array<keyof LeaveMapCopy> = [
  'title', 'employee', 'periods', 'workingDays', 'notBooked', 'legendLeave', 'legendHoliday',
  'legendWeekend', 'legal', 'madeOn', 'employer', 'page', 'of', 'taxId',
];

export interface LeaveMapInput {
  restaurantName: string;
  taxId: string | null;
  /** A `data:image/png;base64,…` URI, already sized; the rasteriser cannot fetch. */
  logo?: string | null;
  year: number;
  employees: LeaveMapEmployee[];
  leaves: LeaveMapLeave[];
  /** The day the map was drawn up, `YYYY-MM-DD`. */
  madeOn: string;
  language: 'pt' | 'en';
  copy: LeaveMapCopy;
}

/** A4 landscape at 96 px per inch. */
export const PAGE_WIDTH = 1123;
export const PAGE_HEIGHT = 794;

const MARGIN = 44;

// Ink on white paper: the sheet goes through an office printer, often a
// black-and-white one, so every distinction survives greyscale. Amber is the
// app's accent and here marks the two things that are about the calendar
// rather than the people: the year and the public holidays.
const INK = '#1c1917';
const GRAPHITE = '#57534e';
const PENCIL = '#a8a29e';
const RULE = '#d6d3d1';
const HAIRLINE = '#e7e5e4';
const WEEKEND = '#f6f5f3';
const AMBER = '#b45309';

// Columns.
const NAME_X = MARGIN;
const NAME_W = 176;
const TIMELINE_X = MARGIN + 188;
const TIMELINE_W = 590;
const PERIODS_X = TIMELINE_X + TIMELINE_W + 20;
const DAYS_RIGHT = PAGE_WIDTH - MARGIN;

// Rows.
const HEADER_RULE_Y = MARGIN + 82;
const MONTHS_Y = HEADER_RULE_Y + 24;
const GRID_TOP = HEADER_RULE_Y + 34;
const FOOTER_TOP = PAGE_HEIGHT - MARGIN - 62;
const GRID_BOTTOM_MAX = FOOTER_TOP - 14;
const LINE = 14;
const ROW_MIN = 40;
const MAX_STRETCH = 1.8;

/** XML-escapes text. */
function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Shortens text to roughly fit `width`. SVG has no text measurement before
 * rendering, so this estimates from an average glyph width; it errs short.
 */
function fit(text: string, width: number, size: number, bold = false): string {
  const perChar = size * (bold ? 0.62 : 0.56);
  const max = Math.floor(width / perChar);
  return text.length <= max ? text : `${text.slice(0, Math.max(1, max - 1)).trimEnd()}…`;
}

function locale(language: 'pt' | 'en'): string {
  return language === 'pt' ? 'pt-PT' : 'en-GB';
}

/** "ago", "Aug": the month as a short word, without the abbreviation dot. */
function shortMonth(month: number, year: number, language: 'pt' | 'en'): string {
  return new Date(Date.UTC(year, month, 1))
    .toLocaleDateString(locale(language), { month: 'short', timeZone: 'UTC' })
    .replace('.', '');
}

/** "3 – 14 ago", "28 jul – 8 ago", "28 dez 2025 – 3 jan": one booking. */
export function formatPeriod(start: string, end: string, year: number, language: 'pt' | 'en'): string {
  const part = (key: string, withMonth: boolean) => {
    const d = parseDateKey(key);
    const day = String(d.getUTCDate());
    if (!withMonth) return day;
    const month = shortMonth(d.getUTCMonth(), d.getUTCFullYear(), language);
    const otherYear = d.getUTCFullYear() !== year ? ` ${d.getUTCFullYear()}` : '';
    return `${day} ${month}${otherYear}`;
  };
  if (start === end) return part(start, true);
  const sameMonth = start.slice(0, 7) === end.slice(0, 7);
  return `${part(start, !sameMonth)} – ${part(end, true)}`;
}

/** 07/10/2026. */
function formatDate(key: string): string {
  const [y, m, d] = key.split('-');
  return `${d}/${m}/${y}`;
}

interface Row {
  employee: LeaveMapEmployee;
  /** This person's bookings touching the year, in date order. */
  periods: LeaveMapLeave[];
  /** Working days of holiday falling inside the year. */
  days: number;
  height: number;
}

/** One row per person, worked out once so pagination and drawing agree. */
export function leaveMapRows(input: Pick<LeaveMapInput, 'year' | 'employees' | 'leaves'>): Row[] {
  const first = `${input.year}-01-01`;
  const last = `${input.year}-12-31`;
  return input.employees.map((employee) => {
    const periods = input.leaves
      .filter((l) => l.employeeId === employee.id && l.start <= last && l.end >= first)
      .sort((a, b) => a.start.localeCompare(b.start));
    const days = periods.reduce(
      (sum, l) => sum + leaveWorkingDays(l.start < first ? first : l.start, l.end > last ? last : l.end).length,
      0,
    );
    const lines = Math.max(1, periods.length);
    return { employee, periods, days, height: Math.max(ROW_MIN, 20 + lines * LINE) };
  });
}

/** Splits rows over pages, never splitting a person across two. */
export function paginateRows<T extends { height: number }>(rows: T[]): T[][] {
  const room = GRID_BOTTOM_MAX - GRID_TOP;
  const pages: T[][] = [];
  let current: T[] = [];
  let used = 0;
  for (const row of rows) {
    if (current.length > 0 && used + row.height > room) {
      pages.push(current);
      current = [];
      used = 0;
    }
    current.push(row);
    used += row.height;
  }
  if (current.length > 0 || pages.length === 0) pages.push(current);
  return pages;
}

/** The SVG for each page of the year's map. */
export function buildLeaveMapPages(input: LeaveMapInput): { pages: string[]; width: number; height: number } {
  const { year, copy, language } = input;
  const yearDays = datesBetween(`${year}-01-01`, `${year}-12-31`);
  const dayWidth = TIMELINE_W / yearDays.length;
  const dayIndex = new Map(yearDays.map((key, i) => [key, i]));
  const xOf = (key: string) => TIMELINE_X + (dayIndex.get(key) ?? 0) * dayWidth;

  const rows = leaveMapRows(input);
  const chunks = paginateRows(rows);

  // The calendar is the same on every page: drawn once, reused.
  const weekendPath = yearDays
    .filter((key) => {
      const wd = parseDateKey(key).getUTCDay();
      return wd === 0 || wd === 6;
    })
    .map((key) => `M${xOf(key).toFixed(2)} 0h${dayWidth.toFixed(2)}v1h-${dayWidth.toFixed(2)}z`)
    .join('');
  const monthStarts = Array.from({ length: 12 }, (_, m) => dateKey(new Date(Date.UTC(year, m, 1))));
  const holidays = portugueseHolidays(year);

  const pages = chunks.map((chunk, pageIndex) => {
    const parts: string[] = [];
    // A small team would leave half the sheet blank and the names small on a
    // wall read from a step away: rows grow into the room, up to a limit.
    const natural = chunk.reduce((s, r) => s + r.height, 0);
    const stretch = natural > 0 ? Math.min(MAX_STRETCH, Math.max(1, (GRID_BOTTOM_MAX - GRID_TOP) / natural)) : 1;
    const gridBottom = GRID_TOP + natural * stretch;
    const gridHeight = Math.max(gridBottom - GRID_TOP, 1);

    parts.push(`<rect width="${PAGE_WIDTH}" height="${PAGE_HEIGHT}" fill="#ffffff"/>`);

    // ── Who: the employer, named as the law expects ──────────────────────
    const logoSize = 58;
    const textX = input.logo ? MARGIN + logoSize + 14 : MARGIN;
    if (input.logo) {
      parts.push(
        `<image href="${esc(input.logo)}" x="${MARGIN}" y="${MARGIN}" width="${logoSize}" height="${logoSize}" preserveAspectRatio="xMidYMid meet"/>`,
      );
    }
    parts.push(
      `<text x="${textX}" y="${MARGIN + 26}" font-size="23" font-weight="700" fill="${INK}">${esc(fit(input.restaurantName, 560, 23, true))}</text>`,
    );
    if (input.taxId) {
      parts.push(
        `<text x="${textX}" y="${MARGIN + 48}" font-size="11.5" fill="${GRAPHITE}" letter-spacing="0.4">${esc(copy.taxId)} ${esc(input.taxId)}</text>`,
      );
    }

    // ── What: the title, and the year set large — the sheet is read from
    // across the room, and the year is how anyone knows it is current ─────
    parts.push(
      `<text x="${DAYS_RIGHT}" y="${MARGIN + 12}" text-anchor="end" font-size="11" font-weight="700" fill="${GRAPHITE}" letter-spacing="2.6">${esc(copy.title.toUpperCase())}</text>`,
    );
    parts.push(
      `<text x="${DAYS_RIGHT}" y="${MARGIN + 66}" text-anchor="end" font-size="56" font-weight="800" fill="${AMBER}" letter-spacing="-1.5">${year}</text>`,
    );
    parts.push(
      `<rect x="${MARGIN}" y="${HEADER_RULE_Y - 1}" width="${PAGE_WIDTH - 2 * MARGIN}" height="2" fill="${INK}"/>`,
    );

    // ── Column heads ─────────────────────────────────────────────────────
    const head = (x: number, label: string, anchor = 'start') =>
      `<text x="${x}" y="${MONTHS_Y}" text-anchor="${anchor}" font-size="9" font-weight="700" fill="${GRAPHITE}" letter-spacing="1.4">${esc(label.toUpperCase())}</text>`;
    parts.push(head(NAME_X, copy.employee));
    parts.push(head(PERIODS_X, copy.periods));
    parts.push(head(DAYS_RIGHT, copy.workingDays, 'end'));
    monthStarts.forEach((key, m) => {
      const from = xOf(key);
      const to = m < 11 ? xOf(monthStarts[m + 1]) : TIMELINE_X + TIMELINE_W;
      parts.push(
        `<text x="${((from + to) / 2).toFixed(1)}" y="${MONTHS_Y}" text-anchor="middle" font-size="9" font-weight="700" fill="${GRAPHITE}" letter-spacing="1">${esc(shortMonth(m, year, language).toUpperCase())}</text>`,
      );
    });

    // ── The year's ribbon: weekends shaded, months ruled, holidays as amber
    // threads running through every row ───────────────────────────────────
    parts.push(
      `<path d="${weekendPath}" fill="${WEEKEND}" transform="translate(0 ${GRID_TOP}) scale(1 ${gridHeight})"/>`,
    );
    monthStarts.forEach((key) => {
      parts.push(
        `<rect x="${xOf(key).toFixed(2)}" y="${MONTHS_Y + 6}" width="0.8" height="${gridBottom - MONTHS_Y - 6}" fill="${RULE}"/>`,
      );
    });
    parts.push(
      `<rect x="${TIMELINE_X + TIMELINE_W - 0.8}" y="${MONTHS_Y + 6}" width="0.8" height="${gridBottom - MONTHS_Y - 6}" fill="${RULE}"/>`,
    );
    for (const h of holidays) {
      const x = (xOf(h.date) + dayWidth / 2).toFixed(2);
      parts.push(
        `<line x1="${x}" y1="${GRID_TOP - 2}" x2="${x}" y2="${gridBottom}" stroke="${AMBER}" stroke-width="0.9" stroke-dasharray="2 2"/>`,
      );
      parts.push(`<circle cx="${x}" cy="${GRID_TOP - 4}" r="1.8" fill="${AMBER}"/>`);
    }

    // ── The people ───────────────────────────────────────────────────────
    let y = GRID_TOP;
    for (const row of chunk) {
      const c = employeeColor(row.employee.color);
      const drawn = row.height * stretch;
      // The row's content, centred in the room it was given.
      const top = y + (drawn - row.height) / 2;
      parts.push(`<rect x="${NAME_X}" y="${top + 9}" width="3.5" height="${row.employee.role ? 24 : 15}" rx="1.75" fill="${c.dot}"/>`);
      parts.push(
        `<text x="${NAME_X + 12}" y="${top + 21}" font-size="12.5" font-weight="700" fill="${INK}">${esc(fit(row.employee.name, NAME_W - 12, 12.5, true))}</text>`,
      );
      if (row.employee.role) {
        parts.push(
          `<text x="${NAME_X + 12}" y="${top + 33}" font-size="9.5" fill="${GRAPHITE}">${esc(fit(row.employee.role, NAME_W - 12, 9.5))}</text>`,
        );
      }

      for (const p of row.periods) {
        const from = p.start < `${year}-01-01` ? `${year}-01-01` : p.start;
        const to = p.end > `${year}-12-31` ? `${year}-12-31` : p.end;
        const x = xOf(from);
        const w = Math.max(3, xOf(to) + dayWidth - x);
        parts.push(
          `<rect x="${x.toFixed(2)}" y="${top + 10}" width="${w.toFixed(2)}" height="13" rx="2.5" fill="${c.dot}" stroke="${INK}" stroke-opacity="0.35" stroke-width="0.6"/>`,
        );
      }

      if (row.periods.length === 0) {
        parts.push(
          `<text x="${PERIODS_X}" y="${top + 21}" font-size="11" font-style="italic" fill="${PENCIL}">${esc(copy.notBooked)}</text>`,
        );
        parts.push(
          `<text x="${DAYS_RIGHT}" y="${top + 22}" text-anchor="end" font-size="15" font-weight="700" fill="${PENCIL}">–</text>`,
        );
      } else {
        row.periods.forEach((p, i) => {
          const days = leaveWorkingDays(p.start, p.end).length;
          parts.push(
            `<text x="${PERIODS_X}" y="${top + 21 + i * LINE}" font-size="11" fill="${INK}">${esc(formatPeriod(p.start, p.end, year, language))}<tspan dx="7" fill="${PENCIL}">·</tspan><tspan dx="5" fill="${PENCIL}">${days}</tspan></text>`,
          );
        });
        parts.push(
          `<text x="${DAYS_RIGHT}" y="${top + 22}" text-anchor="end" font-size="15" font-weight="800" fill="${INK}">${row.days}</text>`,
        );
      }

      y += drawn;
      parts.push(`<rect x="${MARGIN}" y="${y - 0.5}" width="${PAGE_WIDTH - 2 * MARGIN}" height="1" fill="${HAIRLINE}"/>`);
    }

    // ── The footer: how to read it, the legal basis, and the signature ───
    parts.push(`<rect x="${MARGIN}" y="${FOOTER_TOP}" width="${PAGE_WIDTH - 2 * MARGIN}" height="1" fill="${RULE}"/>`);
    const legendY = FOOTER_TOP + 22;
    let lx = MARGIN;
    parts.push(`<rect x="${lx}" y="${legendY - 9}" width="22" height="10" rx="2" fill="${GRAPHITE}"/>`);
    lx += 28;
    parts.push(`<text x="${lx}" y="${legendY}" font-size="10" fill="${GRAPHITE}">${esc(copy.legendLeave)}</text>`);
    lx += copy.legendLeave.length * 5.8 + 22;
    parts.push(
      `<line x1="${lx + 4}" y1="${legendY - 11}" x2="${lx + 4}" y2="${legendY + 2}" stroke="${AMBER}" stroke-width="1" stroke-dasharray="2 2"/>`,
    );
    parts.push(`<circle cx="${lx + 4}" cy="${legendY - 12}" r="1.8" fill="${AMBER}"/>`);
    lx += 14;
    parts.push(`<text x="${lx}" y="${legendY}" font-size="10" fill="${GRAPHITE}">${esc(copy.legendHoliday)}</text>`);
    lx += copy.legendHoliday.length * 5.8 + 22;
    parts.push(`<rect x="${lx}" y="${legendY - 10}" width="14" height="12" fill="${WEEKEND}" stroke="${RULE}" stroke-width="0.6"/>`);
    lx += 20;
    parts.push(`<text x="${lx}" y="${legendY}" font-size="10" fill="${GRAPHITE}">${esc(copy.legendWeekend)}</text>`);

    const pageNote = chunks.length > 1 ? `${copy.page} ${pageIndex + 1} ${copy.of} ${chunks.length}   ·   ` : '';
    parts.push(
      `<text x="${DAYS_RIGHT}" y="${legendY}" text-anchor="end" font-size="10" fill="${GRAPHITE}">${esc(pageNote)}${esc(copy.madeOn)} ${formatDate(input.madeOn)}</text>`,
    );

    const lowY = FOOTER_TOP + 54;
    parts.push(
      `<text x="${MARGIN}" y="${lowY}" font-size="9.5" fill="${GRAPHITE}">${esc(fit(copy.legal, 640, 9.5))}</text>`,
    );
    const lineFrom = DAYS_RIGHT - 230;
    parts.push(`<rect x="${lineFrom}" y="${lowY - 2}" width="230" height="0.9" fill="${INK}"/>`);
    parts.push(
      `<text x="${lineFrom - 10}" y="${lowY}" text-anchor="end" font-size="10" font-weight="700" fill="${INK}">${esc(copy.employer)}</text>`,
    );

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE_WIDTH}" height="${PAGE_HEIGHT}" viewBox="0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}" font-family="DejaVu Sans, Liberation Sans, Arial, Helvetica, sans-serif">${parts.join('')}</svg>`;
  });

  return { pages, width: PAGE_WIDTH, height: PAGE_HEIGHT };
}
