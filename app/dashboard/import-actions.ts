'use server';

import ExcelJS from 'exceljs';
import { requireOwner, isAuthError } from '@/lib/auth-helpers';
import { prisma } from '@/lib/prisma';
import { toClientError } from '@/lib/errors';
import {
  parseFamiliaSheet,
  ImportFormatError,
  type ParsedImport,
  type SheetRow,
} from '@/lib/zonesoft-import';

/**
 * Importing a ZoneSoft sales export, from the owner's own screen.
 *
 * The till already knows what was sold and how it was grouped. Asking an
 * owner to retype a year of that is why the history never gets entered at
 * all — so they export the report and drop the file here.
 *
 * Two steps on purpose. The first reads the file and reports what it found,
 * including how it compares against what is already recorded; the second
 * writes it. An import that silently overwrote a month of revenue the owner
 * had entered by hand would be very hard to notice and impossible to undo.
 */

/** Big enough for a year of daily rows, small enough to reject a video. */
const MAX_BYTES = 10 * 1024 * 1024;

export interface ImportPreview {
  days: number;
  familias: string[];
  grandTotal: number;
  from: string;
  to: string;
  /** Days already recorded that this file would change, with both figures. */
  conflicts: Array<{ date: string; existing: number; incoming: number }>;
  /** Days the file covers that have no revenue recorded yet. */
  newDays: number;
  /** Rows that could not be read. Shown, never hidden. */
  skipped: number;
}

/**
 * Reads the upload without writing anything.
 *
 * Everything the owner needs to decide is returned: the span, the money, the
 * famílias, and every day where the file disagrees with what is already
 * there.
 */
export async function previewPosImport(formData: FormData) {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return { error: owner.error };

    const file = formData.get('file');
    if (!(file instanceof File)) return { error: 'import.noFile' };
    if (file.size === 0) return { error: 'import.emptyFile' };
    if (file.size > MAX_BYTES) return { error: 'import.tooLarge' };

    const parsed = await readWorkbook(file);
    if (parsed.rows.length === 0) return { error: 'import.noRows' };

    const dates = parsed.dailyTotals.map((d) => d.date);
    const from = dates[0];
    const to = dates[dates.length - 1];

    // What is already recorded over the same span, so the owner sees what
    // this would change before it changes anything.
    const existing = await prisma.dailySummary.findMany({
      where: {
        restaurantId: owner.restaurantId,
        deletedAt: null,
        date: { gte: isoToDate(from), lte: isoToDate(to) },
      },
      select: { date: true, revenueTotal: true },
    });

    const byDate = new Map(
      existing.map((e) => [e.date.toISOString().slice(0, 10), Number(e.revenueTotal)]),
    );

    const conflicts = parsed.dailyTotals
      .filter((d) => {
        const was = byDate.get(d.date);
        // A cent of difference is rounding, not a disagreement worth a warning.
        return was !== undefined && Math.abs(was - d.revenue) > 0.01;
      })
      .map((d) => ({ date: d.date, existing: byDate.get(d.date)!, incoming: d.revenue }));

    return {
      success: true,
      data: {
        days: parsed.dailyTotals.length,
        familias: parsed.familias,
        grandTotal: parsed.grandTotal,
        from,
        to,
        conflicts,
        newDays: parsed.dailyTotals.filter((d) => !byDate.has(d.date)).length,
        skipped: parsed.skipped.length,
      } satisfies ImportPreview,
    };
  } catch (error: unknown) {
    if (error instanceof ImportFormatError) return { error: 'import.wrongFormat' };
    return { error: toClientError('Failed to read the export', error, 'read') };
  }
}

/**
 * Writes the import.
 *
 * Creates any família the restaurant does not have yet, records the revenue
 * per category per day, and updates the daily totals so the dashboard and
 * the breakdown agree.
 *
 * Keyed on (restaurant, date, category), so running the same file twice
 * corrects rather than doubles — an owner who exports again after a
 * correction in the till should get the corrected figures, not both.
 */
export async function commitPosImport(formData: FormData) {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return { error: owner.error };

    const file = formData.get('file');
    if (!(file instanceof File)) return { error: 'import.noFile' };
    if (file.size > MAX_BYTES) return { error: 'import.tooLarge' };

    // Whether the owner accepted overwriting days that already had revenue.
    const overwrite = formData.get('overwrite') === 'true';

    const parsed = await readWorkbook(file);
    if (parsed.rows.length === 0) return { error: 'import.noRows' };

    const categories = await ensureCategories(owner.restaurantId, parsed.familias);

    const dates = parsed.dailyTotals.map((d) => d.date);
    const existing = await prisma.dailySummary.findMany({
      where: {
        restaurantId: owner.restaurantId,
        deletedAt: null,
        date: { gte: isoToDate(dates[0]), lte: isoToDate(dates[dates.length - 1]) },
      },
      select: { date: true, revenueTotal: true },
    });
    const recorded = new Map(
      existing.map((e) => [e.date.toISOString().slice(0, 10), Number(e.revenueTotal)]),
    );

    let written = 0;
    let daysWritten = 0;
    let daysSkipped = 0;

    for (const day of parsed.dailyTotals) {
      const was = recorded.get(day.date);
      // A day that already disagrees is left alone unless the owner said
      // otherwise. Their own entry is not ours to discard.
      if (was !== undefined && Math.abs(was - day.revenue) > 0.01 && !overwrite) {
        daysSkipped++;
        continue;
      }

      const rows = parsed.rows.filter((r) => r.date === day.date);
      const date = isoToDate(day.date);

      for (const row of rows) {
        const categoryId = categories.get(row.familia)!;
        await prisma.dailyCategoryRevenue.upsert({
          where: {
            restaurantId_date_categoryId: { restaurantId: owner.restaurantId, date, categoryId },
          },
          create: {
            restaurantId: owner.restaurantId,
            date,
            categoryId,
            revenue: row.revenue,
            quantity: row.quantity,
          },
          update: { revenue: row.revenue, quantity: row.quantity },
        });
        written++;
      }

      // The day's total, so the dashboard and the breakdown agree. Booked as
      // dine-in: this report carries no channel split, and inventing one
      // would put takeaway in the P&L that never happened.
      await prisma.dailySummary.upsert({
        where: { restaurantId_date: { restaurantId: owner.restaurantId, date } },
        create: {
          restaurantId: owner.restaurantId,
          date,
          createdById: owner.userId,
          dineInRevenue: day.revenue,
          takeawayRevenue: 0,
          revenueTotal: day.revenue,
          notes: 'Importado do POS',
        },
        update: {
          dineInRevenue: day.revenue,
          revenueTotal: day.revenue,
          deletedAt: null,
        },
      });
      daysWritten++;
    }

    return {
      success: true,
      data: { daysWritten, daysSkipped, rowsWritten: written, familias: parsed.familias.length },
    };
  } catch (error: unknown) {
    if (error instanceof ImportFormatError) return { error: 'import.wrongFormat' };
    return { error: toClientError('Failed to import', error, 'write') };
  }
}

/**
 * Finds or creates a REVENUE category per família.
 *
 * Matched by name, so a restaurant that already has "BEBIDAS" keeps the one
 * it has rather than gaining a second identical line.
 */
async function ensureCategories(restaurantId: string, familias: string[]) {
  const existing = await prisma.category.findMany({
    where: { restaurantId, type: 'REVENUE' },
    select: { id: true, name: true },
  });

  const byName = new Map(existing.map((c) => [c.name.toUpperCase(), c.id]));
  const out = new Map<string, string>();

  for (const [i, familia] of familias.entries()) {
    const found = byName.get(familia.toUpperCase());
    if (found) { out.set(familia, found); continue; }

    const created = await prisma.category.create({
      data: { restaurantId, type: 'REVENUE', name: familia, sortOrder: i },
      select: { id: true },
    });
    out.set(familia, created.id);
  }

  return out;
}

/**
 * Reads the first worksheet of an Excel file, or a CSV, into rows.
 *
 * Both are offered because ZoneSoft exports either, and an owner should not
 * have to know which one this app prefers.
 */
async function readWorkbook(file: File): Promise<ParsedImport> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const isCsv = /\.csv$/i.test(file.name) || file.type === 'text/csv';

  const workbook = new ExcelJS.Workbook();
  if (isCsv) {
    // ExcelJS reads a CSV through a stream; a Blob-backed one keeps the file
    // off disk, which matters on a read-only container.
    const { Readable } = await import('node:stream');
    await workbook.csv.read(Readable.from(buffer));
  } else {
    // ExcelJS types `load` against its own Buffer shape, which is narrower
    // than Node's generic one. The underlying bytes are what it reads.
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  }

  const sheet = workbook.worksheets[0];
  if (!sheet) throw new ImportFormatError('folha');

  // The header is the first row that looks like one: ZoneSoft puts a title
  // and the date range above it.
  let headerRow = 0;
  let header: string[] = [];
  for (let i = 1; i <= Math.min(sheet.rowCount, 20); i++) {
    const values = cellValues(sheet.getRow(i));
    if (values.some((v) => /^\s*data\s*$/i.test(String(v ?? '')))) {
      headerRow = i;
      header = values.map((v) => String(v ?? ''));
      break;
    }
  }
  if (!headerRow) throw new ImportFormatError('Data');

  const rows: SheetRow[] = [];
  for (let i = headerRow + 1; i <= sheet.rowCount; i++) {
    const cells = cellValues(sheet.getRow(i));
    if (cells.every((c) => c === null || c === undefined || c === '')) continue;
    rows.push({ index: i, cells });
  }

  return parseFamiliaSheet(header, rows);
}

/** A row's cells, with formulas resolved to their computed value. */
function cellValues(row: ExcelJS.Row): unknown[] {
  const out: unknown[] = [];
  row.eachCell({ includeEmpty: true }, (cell, col) => {
    const v = cell.value;
    // A formula cell carries both the formula and its result.
    out[col - 1] = v && typeof v === 'object' && 'result' in v ? v.result : v;
  });
  return out;
}

/** Midnight UTC, matching how every other date in this app is stored. */
function isoToDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
