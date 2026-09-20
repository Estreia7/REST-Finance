/**
 * Reading a ZoneSoft sales export.
 *
 * The owner exports "Evolução de Vendas por Família" from their till and
 * drops the file here. It carries one row per família per day:
 *
 *   Data        Descrição                Quantidade  Valor Total S/IVA  Valor Total
 *   02-01-2025  COMIDAS/SMASHIES         16,000      162,389€           183,500€
 *
 * ── Which column is the revenue ──────────────────────────────────────────
 * "Valor Total" is VAT-inclusive — the money that came through the till, and
 * what the rest of this app stores. "Valor Total S/IVA" is net of VAT, the
 * tax base. Taking the wrong one understates the year by about a seventh, so
 * the header is matched explicitly rather than by position.
 *
 * ── Famílias and sub-famílias ────────────────────────────────────────────
 * "COMIDAS/SMASHIES" is a sub-família of COMIDAS. Sub-famílias are rolled up
 * into their família, because that is the level an owner thinks at — "how
 * much was comida" — and because the sub-família list changes whenever the
 * menu does, which would otherwise mean a new category every season.
 *
 * ── Numbers ──────────────────────────────────────────────────────────────
 * Portuguese formatting throughout: comma for decimals, dot for thousands,
 * a trailing euro sign. "1.234,56€" is one thousand two hundred thirty-four
 * euros and fifty-six cents.
 */

export interface FamiliaRow {
  /** Calendar day, as YYYY-MM-DD. */
  date: string;
  /** Top-level família, e.g. "COMIDAS". Upper case, as the till prints it. */
  familia: string;
  /** Items sold. */
  quantity: number;
  /** Takings, VAT included. */
  revenue: number;
}

export interface ParsedImport {
  rows: FamiliaRow[];
  /** One entry per day, for reconciling against what is already recorded. */
  dailyTotals: Array<{ date: string; revenue: number }>;
  /** Every família seen, so the caller can create the missing categories. */
  familias: string[];
  /** The whole file's takings, for showing the owner before they commit. */
  grandTotal: number;
  /** Rows that could not be read, with why. Never silently dropped. */
  skipped: Array<{ row: number; reason: string }>;
}

/** Column headers, lower-cased and stripped of accents for matching. */
const HEADERS = {
  date: ['data'],
  description: ['descricao', 'descrição', 'descricao/familia'],
  quantity: ['quantidade', 'qtd'],
  // Deliberately NOT 's/iva': that column is net of VAT.
  revenue: ['valor total'],
  revenueNet: ['valor total s/iva', 'valor total siva'],
};

function normalise(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/**
 * Parses a Portuguese-formatted amount.
 *
 * Handles "183,500€", "1.234,56 €", "1 234,56" and a plain "16". Returns null
 * rather than NaN so a caller cannot accidentally sum a bad cell as zero.
 */
export function parsePtNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;

  const cleaned = value
    .replace(/[€\s ]/g, '')
    // Thousands separators: a dot followed by exactly three digits that are
    // not the end of a decimal. Done before the comma swap so "1.234,56"
    // survives intact.
    .replace(/\.(?=\d{3}(?:[.,]|$))/g, '')
    .replace(',', '.');

  if (cleaned === '' || cleaned === '-') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * Parses a ZoneSoft date cell.
 *
 * The export is day-first ("02-01-2025"), and a spreadsheet may hand back a
 * real Date instead. Both arrive as YYYY-MM-DD.
 */
export function parsePtDate(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    // Excel dates are midnight UTC; taking the UTC parts avoids a timezone
    // shifting a Monday's takings into Sunday.
    return value.toISOString().slice(0, 10);
  }
  if (typeof value !== 'string') return null;

  const match = value.trim().match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
  if (!match) return null;

  const [, d, m, y] = match;
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  // `Date.UTC` rolls 30 February into March rather than failing.
  if (date.getUTCDate() !== Number(d) || date.getUTCMonth() !== Number(m) - 1) return null;

  return `${y}-${m}-${d}`;
}

/**
 * Splits "COMIDAS/SMASHIES" into its família.
 *
 * A trailing slash with nothing after it ("MENUS/") is the família's own
 * total, which the report prints for items filed directly under it.
 */
export function toFamilia(description: string): string | null {
  const trimmed = description.trim();
  if (!trimmed) return null;
  const familia = trimmed.split('/')[0].trim().toUpperCase();
  return familia || null;
}

/** A row from the sheet, as cell values in header order. */
export interface SheetRow {
  index: number;
  cells: unknown[];
}

/**
 * Turns the sheet into daily per-família revenue.
 *
 * Takes rows rather than a file so the same logic serves an Excel upload, a
 * CSV, and the tests — and so nothing here has to know about ExcelJS.
 */
export function parseFamiliaSheet(header: string[], rows: SheetRow[]): ParsedImport {
  const cols = mapColumns(header);

  const byDayFamilia = new Map<string, FamiliaRow>();
  const skipped: Array<{ row: number; reason: string }> = [];

  for (const { index, cells } of rows) {
    const date = parsePtDate(cells[cols.date]);
    const description = String(cells[cols.description] ?? '');
    const familia = toFamilia(description);

    // The report repeats its header on every page and ends with a Total row.
    // Neither is a mistake worth reporting to the owner. Both the date and
    // the description cell are checked: a repeated header carries "Data" in
    // the date column, while the Total line carries "Total:" there and
    // leaves the description empty.
    if (!date && isNoiseRow(cells[cols.date], description)) continue;

    if (!date) { skipped.push({ row: index, reason: 'invalidDate' }); continue; }
    if (!familia) { skipped.push({ row: index, reason: 'noFamilia' }); continue; }

    const revenue = parsePtNumber(cells[cols.revenue]);
    if (revenue === null) { skipped.push({ row: index, reason: 'invalidRevenue' }); continue; }

    const quantity = parsePtNumber(cells[cols.quantity]) ?? 0;

    // Sub-famílias roll up, so several rows land on the same key.
    const key = `${date}|${familia}`;
    const existing = byDayFamilia.get(key);
    if (existing) {
      existing.revenue += revenue;
      existing.quantity += Math.round(quantity);
    } else {
      byDayFamilia.set(key, { date, familia, revenue, quantity: Math.round(quantity) });
    }
  }

  const parsed = [...byDayFamilia.values()].sort(
    (a, b) => a.date.localeCompare(b.date) || a.familia.localeCompare(b.familia),
  );

  // Rounded once at the end: adding a hundred two-decimal amounts in binary
  // floating point drifts, and a day that should total 240,70 must not be
  // stored as 240,70000000000002.
  for (const row of parsed) row.revenue = round2(row.revenue);

  const totals = new Map<string, number>();
  for (const row of parsed) totals.set(row.date, (totals.get(row.date) ?? 0) + row.revenue);

  return {
    rows: parsed,
    dailyTotals: [...totals.entries()]
      .map(([date, revenue]) => ({ date, revenue: round2(revenue) }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    familias: [...new Set(parsed.map((r) => r.familia))].sort(),
    grandTotal: round2(parsed.reduce((s, r) => s + r.revenue, 0)),
    skipped,
  };
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Whether a dateless row is the report's own furniture rather than a failure.
 *
 * A 67-page export repeats its column headers on every page and closes with
 * a Total line. Reporting either to the owner as "67 rows could not be read"
 * would bury the one row that genuinely could not be.
 */
function isNoiseRow(dateCell: unknown, description: string): boolean {
  const candidates = [String(dateCell ?? ''), description];
  return candidates.some((c) => /^\s*(data|total|descri)/i.test(normalise(c)));
}

export class ImportFormatError extends Error {
  constructor(readonly missing: string) {
    super(`The export is missing a "${missing}" column.`);
    this.name = 'ImportFormatError';
  }
}

/**
 * Finds each column by its header.
 *
 * By name rather than position, because the revenue column sits next to a
 * net-of-VAT column with an almost identical heading, and a column order that
 * changed between ZoneSoft versions would otherwise import the wrong money
 * without any error at all.
 */
function mapColumns(header: string[]): Record<'date' | 'description' | 'quantity' | 'revenue', number> {
  const cells = header.map(normalise);

  const findExact = (names: string[]) => cells.findIndex((c) => names.includes(c));

  const date = findExact(HEADERS.date);
  const description = findExact(HEADERS.description);
  const quantity = findExact(HEADERS.quantity);

  // The net column is located first and excluded, so "valor total" cannot
  // accidentally match "valor total s/iva" by prefix.
  const netAt = findExact(HEADERS.revenueNet);
  const revenue = cells.findIndex((c, i) => i !== netAt && HEADERS.revenue.includes(c));

  if (date < 0) throw new ImportFormatError('Data');
  if (description < 0) throw new ImportFormatError('Descrição');
  if (revenue < 0) throw new ImportFormatError('Valor Total');

  return { date, description, quantity: quantity < 0 ? -1 : quantity, revenue };
}
