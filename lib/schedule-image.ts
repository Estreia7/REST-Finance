/**
 * The weekly rota, drawn as an SVG for sending to the team.
 *
 * This exists because of how restaurant schedules actually circulate: the
 * owner writes one and puts a picture of it in the staff WhatsApp group. A
 * link would require every person to have an account and to open it; an image
 * arrives in the conversation they already read, survives being forwarded, and
 * works on the oldest phone in the kitchen.
 *
 * SVG hand-built rather than a chart library: the output has to be legible as
 * a thumbnail in a chat list and readable when someone taps to zoom, which is
 * a typographic problem, not a plotting one. It is rasterised to JPEG by
 * sharp in the route — WhatsApp recompresses everything anyway, so the size
 * and the flat background are chosen to survive that.
 *
 * Every string is escaped: a person's name and a closure reason are user
 * input, and an unescaped ampersand makes the whole SVG fail to parse — which
 * would turn a colleague named "Ana & Rui" into a broken export.
 */

import {
  WEEKDAYS_PT_SHORT,
  WEEKDAYS_EN_SHORT,
  formatRange,
  formatDuration,
  formatWeekRange,
  shiftLength,
  hasBreak,
  employeeColor,
  weekDates,
  dateKey,
  parseDateKey,
} from './schedule';

export interface ImageEmployee {
  id: string;
  name: string;
  role: string | null;
  color: string;
}

export interface ImageShift {
  employeeId: string;
  date: string;
  startMin: number;
  endMin: number;
  breakStartMin?: number | null;
  breakEndMin?: number | null;
  note: string | null;
}

export interface ImageInput {
  restaurantName: string;
  weekStart: string;
  employees: ImageEmployee[];
  shifts: ImageShift[];
  closures: Array<{ date: string; reason: string | null }>;
  language?: 'pt' | 'en';
}

/** XML-escapes text. Names and notes are user input and reach the markup raw. */
function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Trims to fit a column.
 *
 * Measured in characters rather than by real metrics: the fonts available to
 * a server rasteriser vary, and a conservative character budget degrades more
 * gracefully than a precise measurement against a font that is not installed.
 */
function fit(value: string, maxChars: number): string {
  return value.length <= maxChars ? value : `${value.slice(0, maxChars - 1)}…`;
}

const COLORS = {
  paper: '#fbfaf8',
  ink: '#1c1917',
  muted: '#78716c',
  rule: '#e7e5e4',
  headBg: '#f5f4f2',
  closedBg: '#f1f0ee',
  accent: '#b45309',
  /**
   * The "Folga" chip. Outlined rather than filled, because every employee
   * colour is a filled tint — including the grey one — so hue alone cannot
   * keep a closure apart from somebody's shift. Shape can: a shift is a
   * solid block, a closed day is an outline. It survives the JPEG
   * recompression and the thumbnail that a tint would not.
   */
  offLine: '#c9c4bd',
  offInk: '#78716c',
};

/** Sizes in px at 1x; the route renders at 2x for a crisp result on a phone. */
const L = {
  padding: 32,
  headerHeight: 96,
  nameCol: 190,
  dayCol: 132,
  rowHeight: 60,
  dayHeader: 44,
  footer: 46,
  /** Reserved for the weekly total, so it never lands on Sunday's shift. */
  totalCol: 64,
};

/**
 * Rows are taller on a week containing split shifts, which need two lines of
 * times rather than one. Applied to the whole grid, not just the split rows:
 * a table whose rows change height by content reads as broken.
 */
const SPLIT_ROW_HEIGHT = 74;

export function buildScheduleSvg(input: ImageInput): { svg: string; width: number; height: number } {
  const language = input.language ?? 'pt';
  const dayNames = language === 'pt' ? WEEKDAYS_PT_SHORT : WEEKDAYS_EN_SHORT;
  const monday = parseDateKey(input.weekStart);
  const days = weekDates(monday);

  // Someone with no shifts at all this week is left out: a row of dashes adds
  // height to the image and tells the team nothing.
  const working = new Set(input.shifts.map((s) => s.employeeId));
  const employees = input.employees.filter((e) => working.has(e.id));

  const closedDays = new Map(input.closures.map((c) => [c.date, c.reason]));
  const byCell = new Map<string, ImageShift>();
  for (const s of input.shifts) byCell.set(`${s.employeeId}|${s.date}`, s);

  // One height for the whole grid, decided by whether any shift this week is
  // split. Computed per call rather than mutating L, which is module-level
  // and shared by every schedule rendered.
  const anySplit = input.shifts.some((s) =>
    hasBreak(s.startMin, s.endMin, s.breakStartMin, s.breakEndMin)
  );
  const rowHeight = anySplit ? SPLIT_ROW_HEIGHT : L.rowHeight;

  const width = L.padding * 2 + L.nameCol + L.dayCol * 7 + L.totalCol;
  const gridTop = L.headerHeight + L.dayHeader;
  const gridBottom = gridTop + Math.max(employees.length, 1) * rowHeight;
  const height = gridBottom + L.footer + L.padding;

  const parts: string[] = [];

  parts.push(`<rect width="${width}" height="${height}" fill="${COLORS.paper}"/>`);

  // ── Header ──────────────────────────────────────────────────────────────
  parts.push(
    `<text x="${L.padding}" y="${L.padding + 26}" font-size="28" font-weight="700" fill="${COLORS.ink}">${esc(
      fit(input.restaurantName, 40)
    )}</text>`,
    `<text x="${L.padding}" y="${L.padding + 56}" font-size="18" fill="${COLORS.muted}">${esc(
      formatWeekRange(monday, language)
    )}</text>`
  );

  // ── Closed days, as one band behind the whole column ────────────────────
  // Painted before the rows so it reads as the day being shut, not as a
  // series of empty cells that happen to share a tint.
  days.forEach((day, i) => {
    if (!closedDays.has(dateKey(day))) return;
    const x = L.padding + L.nameCol + i * L.dayCol;
    parts.push(
      `<rect x="${x}" y="${L.headerHeight}" width="${L.dayCol}" height="${
        gridBottom - L.headerHeight
      }" fill="${COLORS.closedBg}"/>`
    );
  });

  // ── Day headers ─────────────────────────────────────────────────────────
  days.forEach((day, i) => {
    const x = L.padding + L.nameCol + i * L.dayCol;
    const key = dateKey(day);
    const closed = closedDays.has(key);

    // The closed band already paints its own header.
    if (!closed) {
      parts.push(
        `<rect x="${x}" y="${L.headerHeight}" width="${L.dayCol}" height="${L.dayHeader}" fill="${COLORS.headBg}"/>`
      );
    }

    parts.push(
      `<text x="${x + L.dayCol / 2}" y="${L.headerHeight + 19}" font-size="15" font-weight="700" text-anchor="middle" fill="${
        closed ? COLORS.muted : COLORS.ink
      }">${dayNames[i]}</text>`,
      `<text x="${x + L.dayCol / 2}" y="${L.headerHeight + 36}" font-size="13" text-anchor="middle" fill="${COLORS.muted}">${day.getUTCDate()}/${
        day.getUTCMonth() + 1
      }</text>`
    );
  });

  // ── Rows ────────────────────────────────────────────────────────────────
  if (employees.length === 0) {
    parts.push(
      `<text x="${width / 2}" y="${gridTop + 44}" font-size="16" text-anchor="middle" fill="${COLORS.muted}">${
        language === 'pt' ? 'Sem turnos marcados nesta semana.' : 'No shifts scheduled this week.'
      }</text>`
    );
  }

  employees.forEach((emp, row) => {
    const y = gridTop + row * rowHeight;
    const color = employeeColor(emp.color);

    // Stops at the day columns: striping the full width would paint over the
    // closed band that was laid down first.
    if (row % 2 === 1) {
      parts.push(
        `<rect x="${L.padding}" y="${y}" width="${L.nameCol}" height="${rowHeight}" fill="#ffffff"/>`
      );
      days.forEach((day, i) => {
        if (closedDays.has(dateKey(day))) return;
        parts.push(
          `<rect x="${L.padding + L.nameCol + i * L.dayCol}" y="${y}" width="${L.dayCol}" height="${
            rowHeight
          }" fill="#ffffff"/>`
        );
      });
    }

    parts.push(
      `<rect x="${L.padding}" y="${y + 12}" width="4" height="${rowHeight - 24}" rx="2" fill="${color.dot}"/>`,
      `<text x="${L.padding + 16}" y="${y + (emp.role ? 26 : 35)}" font-size="17" font-weight="600" fill="${COLORS.ink}">${esc(
        fit(emp.name, 20)
      )}</text>`
    );

    if (emp.role) {
      parts.push(
        `<text x="${L.padding + 16}" y="${y + 44}" font-size="13" fill="${COLORS.muted}">${esc(
          fit(emp.role, 22)
        )}</text>`
      );
    }

    let weekMinutes = 0;

    days.forEach((day, i) => {
      const x = L.padding + L.nameCol + i * L.dayCol;
      const key = dateKey(day);
      const shift = byCell.get(`${emp.id}|${key}`);

      // A closed day is named in every row rather than left blank: an empty
      // cell reads as "not scheduled yet", which is the opposite of settled.
      if (closedDays.has(key)) {
        parts.push(
          `<rect x="${x + 8.5}" y="${y + 10.5}" width="${L.dayCol - 17}" height="31" rx="7" fill="none" stroke="${
            COLORS.offLine
          }" stroke-width="1" stroke-dasharray="4 3"/>`,
          `<text x="${x + L.dayCol / 2}" y="${
            y + 31
          }" font-size="13" font-weight="600" text-anchor="middle" fill="${COLORS.offInk}">${
            language === 'pt' ? 'Folga' : 'Day off'
          }</text>`
        );
        return;
      }

      if (!shift) {
        parts.push(
          `<text x="${x + L.dayCol / 2}" y="${y + 35}" font-size="15" text-anchor="middle" fill="#d6d3d1">—</text>`
        );
        return;
      }

      weekMinutes += shiftLength(
        shift.startMin, shift.endMin, shift.breakStartMin, shift.breakEndMin,
      );

      // A split shift needs both blocks, and they do not fit on one line at
      // this column width, so it is stacked instead of shrunk to illegibility.
      const split = hasBreak(
        shift.startMin, shift.endMin, shift.breakStartMin, shift.breakEndMin,
      );

      const lines = split
        ? [formatRange(shift.startMin, shift.breakStartMin!),
           formatRange(shift.breakEndMin!, shift.endMin)]
        : [formatRange(shift.startMin, shift.endMin)];

      const boxHeight = shift.note || split ? rowHeight - 20 : 32;

      parts.push(
        `<rect x="${x + 8}" y="${y + 10}" width="${L.dayCol - 16}" height="${
          boxHeight
        }" rx="7" fill="${color.bg}"/>`
      );

      lines.forEach((line, i) => {
        parts.push(
          `<text x="${x + L.dayCol / 2}" y="${y + 28 + i * 17}" font-size="${
            split ? 13 : 15
          }" font-weight="600" text-anchor="middle" fill="${color.ink}">${esc(line)}</text>`
        );
      });

      if (shift.note) {
        parts.push(
          `<text x="${x + L.dayCol / 2}" y="${
            y + 28 + lines.length * 17 + 2
          }" font-size="12" text-anchor="middle" fill="${color.ink}">${esc(fit(shift.note, 15))}</text>`
        );
      }
    });

    // The weekly total, where the owner and the person both check it.
    parts.push(
      `<text x="${width - L.padding}" y="${y + 35}" font-size="13" text-anchor="end" fill="${COLORS.muted}">${
        weekMinutes > 0 ? esc(formatDuration(weekMinutes)) : ''
      }</text>`
    );

    parts.push(
      `<line x1="${L.padding}" y1="${y + rowHeight}" x2="${width - L.padding}" y2="${
        y + rowHeight
      }" stroke="${COLORS.rule}" stroke-width="1"/>`
    );
  });

  // ── Closed days, named at the foot ──────────────────────────────────────
  // Named with the date, not just the weekday: the image is forwarded and
  // read days later, and "Seg" on its own leaves the team guessing which one.
  const closedList = days
    .map((d, i) => ({
      name: `${dayNames[i]} ${d.getUTCDate()}/${d.getUTCMonth() + 1}`,
      reason: closedDays.get(dateKey(d)),
    }))
    .filter((d) => d.reason !== undefined);

  const footY = gridBottom + 28;

  if (closedList.length > 0) {
    const label = closedList
      .map((d) => (d.reason ? `${d.name} (${d.reason})` : d.name))
      .join(' · ');
    parts.push(
      `<text x="${L.padding}" y="${footY}" font-size="14" fill="${COLORS.accent}">${
        language === 'pt' ? 'Encerrado' : 'Closed'
      }: ${esc(fit(label, 70))}</text>`
    );
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="DejaVu Sans, Liberation Sans, Arial, Helvetica, sans-serif">${parts.join(
    ''
  )}</svg>`;

  return { svg, width, height };
}
