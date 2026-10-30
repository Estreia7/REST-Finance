/**
 * Reads a bank statement export into movements.
 *
 * Portuguese banks export three shapes: a CSV (semicolon-separated, Windows-
 * 1252, a few title lines above the header), an Excel sheet with the same
 * layout, or OFX. None agree on column names — "Data Mov.", "Data Lanc.",
 * "Descrição", "Montante", or a "Débito" and a "Crédito" column instead of
 * one signed amount — so the header is found by what it says, not where it is.
 *
 * Pure: the server action turns the file into text or rows, this does the rest.
 */

export interface StatementLine {
  /** YYYY-MM-DD. */
  dateKey: string;
  /** Signed: money out is negative. */
  amount: number;
  description: string;
  balance: number | null;
}

export interface ParsedStatement {
  lines: StatementLine[];
  /** Rows below the header that could not be read as a movement. */
  skipped: number;
}

/** A dictionary key, so the panel can say what is wrong in the owner's language. */
export class StatementFormatError extends Error {
  constructor(public readonly key: 'bank.errors.noHeader' | 'bank.errors.empty' | 'bank.errors.legacyXls') {
    super(key);
  }
}

const cents = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

// ── Values ──────────────────────────────────────────────────────────────────

/** "1.234,56", "-1 234,56", "1234.56", "(12,50)" or a number from a sheet. */
export function parseMoney(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? cents(value) : null;
  if (typeof value !== 'string') return null;
  let s = value.trim().replace(/€|eur/gi, '').replace(/\s| /g, '');
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1); }
  if (s.endsWith('-')) { negative = true; s = s.slice(0, -1); }
  if (s.startsWith('-')) { negative = !negative; s = s.slice(1); }
  if (s.startsWith('+')) s = s.slice(1);
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
  else if (lastDot > lastComma && lastComma >= 0) s = s.replace(/,/g, '');
  else if (lastComma < 0 && /^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return cents(negative ? -n : n);
}

/** dd-mm-yyyy, dd/mm/yyyy, dd.mm.yyyy, yyyy-mm-dd, yyyymmdd, or a sheet date. */
export function parseDateKey(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value !== 'string') return null;
  const s = value.trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return key(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (m) return key(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1]);
  m = s.match(/^(\d{4})(\d{2})(\d{2})/);
  if (m) return key(+m[1], +m[2], +m[3]);
  return null;
}

function key(y: number, mo: number, d: number): string | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 2000 || y > 2100) return null;
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCMonth() !== mo - 1) return null;
  return date.toISOString().slice(0, 10);
}

// ── Header ──────────────────────────────────────────────────────────────────

interface Columns {
  date: number;
  description: number;
  amount: number | null;
  debit: number | null;
  credit: number | null;
  balance: number | null;
}

function findColumns(header: string[]): Columns | null {
  const h = header.map((c) => fold(String(c ?? '')));
  const find = (test: (c: string) => boolean) => {
    const i = h.findIndex(test);
    return i >= 0 ? i : null;
  };

  // The movement's own date before the value date: it is the day the money
  // left, which is what an invoice is paid on.
  const date =
    find((c) => /^data (de )?(mov|lanc|operacao|transacao)/.test(c))
    ?? find((c) => c === 'data' || c === 'date' || c.startsWith('data'))
    ?? find((c) => c.includes('date'));
  const description = find((c) => /descri|movimento|designa|historico|detalhe|description|narrative|details|memo/.test(c) && !/data|date/.test(c));
  const debit = find((c) => /^(debito|debit|saida|saidas|withdrawal)s?\b/.test(c));
  const credit = find((c) => /^(credito|credit|entrada|entradas|deposit)s?\b/.test(c));
  const amount = find((c) => /^(montante|valor|importancia|amount|quantia)\b/.test(c) && !/saldo|balance/.test(c));
  const balance = find((c) => /saldo|balance/.test(c));

  if (date === null || description === null) return null;
  if (amount === null && (debit === null || credit === null)) return null;
  return { date, description, amount, debit: amount === null ? debit : null, credit: amount === null ? credit : null, balance };
}

// ── Rows (CSV or sheet) ─────────────────────────────────────────────────────

/** Reads rows from a CSV or a sheet: finds the header, then every movement under it. */
export function parseStatementRows(rows: unknown[][]): ParsedStatement {
  let headerAt = -1;
  let cols: Columns | null = null;
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    cols = findColumns((rows[i] ?? []).map((c) => String(c ?? '')));
    if (cols) { headerAt = i; break; }
  }
  if (!cols) throw new StatementFormatError('bank.errors.noHeader');

  const lines: StatementLine[] = [];
  let skipped = 0;
  for (const row of rows.slice(headerAt + 1)) {
    if (!row || row.every((c) => c === null || c === undefined || String(c).trim() === '')) continue;
    const dateKey = parseDateKey(row[cols.date]);
    let amount: number | null = null;
    if (cols.amount !== null) {
      amount = parseMoney(row[cols.amount]);
    } else {
      const out = parseMoney(row[cols.debit!]);
      const inn = parseMoney(row[cols.credit!]);
      if (out !== null && out !== 0) amount = -Math.abs(out);
      else if (inn !== null && inn !== 0) amount = Math.abs(inn);
    }
    const description = String(row[cols.description] ?? '').replace(/\s+/g, ' ').trim();
    // A total, a "saldo inicial" line, or a blank amount is not a movement.
    if (!dateKey || amount === null || amount === 0 || !description) { skipped++; continue; }
    lines.push({ dateKey, amount, description, balance: cols.balance !== null ? parseMoney(row[cols.balance]) : null });
  }
  if (lines.length === 0) throw new StatementFormatError('bank.errors.empty');
  return { lines, skipped };
}

/** Splits CSV text into rows, guessing the separator from the header area. */
export function splitCsv(text: string): string[][] {
  const sample = text.split(/\r?\n/).slice(0, 40).join('\n');
  const counts = [';', '\t', ','].map((d) => ({ d, n: sample.split(d).length }));
  const delimiter = counts.sort((a, b) => b.n - a.n)[0].d;

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length > 0) { row.push(cell); rows.push(row); }
  return rows;
}

// ── OFX ─────────────────────────────────────────────────────────────────────

export function isOfx(text: string): boolean {
  return /OFXHEADER|<OFX>/i.test(text.slice(0, 2000));
}

/** OFX 1 (SGML, unclosed tags) and 2 (XML) alike. */
export function parseOfx(text: string): ParsedStatement {
  const blocks = text.split(/<STMTTRN>/i).slice(1);
  const tag = (block: string, name: string) => {
    const m = block.match(new RegExp(`<${name}>([^<\\r\\n]*)`, 'i'));
    return m ? m[1].trim() : '';
  };
  const lines: StatementLine[] = [];
  let skipped = 0;
  for (const raw of blocks) {
    const block = raw.split(/<\/STMTTRN>/i)[0];
    const dateKey = parseDateKey(tag(block, 'DTPOSTED'));
    const amount = parseMoney(tag(block, 'TRNAMT'));
    const description = [tag(block, 'NAME'), tag(block, 'MEMO')].filter(Boolean).join(' · ');
    if (!dateKey || amount === null || amount === 0 || !description) { skipped++; continue; }
    lines.push({ dateKey, amount, description, balance: null });
  }
  if (lines.length === 0) throw new StatementFormatError('bank.errors.empty');
  return { lines, skipped };
}

/** Any text export: OFX or CSV. */
export function parseStatementText(text: string): ParsedStatement {
  const clean = text.replace(/^﻿/, '');
  return isOfx(clean) ? parseOfx(clean) : parseStatementRows(splitCsv(clean));
}

/**
 * A stable identity for each line, so importing an overlapping period never
 * adds a movement twice. Two identical movements on the same day (two coffees
 * from the same machine) are told apart by their order within that day.
 */
export function lineHashes(lines: StatementLine[]): string[] {
  const seen = new Map<string, number>();
  return lines.map((l) => {
    const base = `${l.dateKey}|${l.amount.toFixed(2)}|${fold(l.description)}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return `${base}|${n}`;
  });
}
