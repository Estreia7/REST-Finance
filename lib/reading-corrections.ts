/**
 * Correcting a reading that has not been saved yet.
 *
 * The figures of a queued invoice live in its reading, not in invoice lines. To
 * check them beside the photograph they travel as the lines the corrector knows,
 * and come back onto the reading keeping what the screen has no say over: the
 * category guessed for a line, and the discount folded into it.
 *
 * Pure: storing happens in invoice-proof-actions.
 */

import type { ScanItem } from '@/lib/document-scanner';
import { lineFigures, toPack, type PackInput } from '@/lib/line-setup';

/** A line as the corrector holds it. Its id is its place in the reading. */
export interface ReadingLine {
  id?: string;
  productName: string;
  quantity: number;
  unit: string | null;
  unitPrice: number;
  total: number;
  vatRate: number | null;
  pack: PackInput | null;
}

const cents = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function linesOfReading(items: ScanItem[]): ReadingLine[] {
  return items.map((item, i) => ({
    id: String(i),
    productName: item.product,
    quantity: item.quantity,
    unit: item.unit ?? null,
    unitPrice: item.unitPrice,
    total: item.total,
    vatRate: item.vatRate ?? null,
    pack: item.packAmount && item.packUnit ? { amount: item.packAmount, unit: item.packUnit } : null,
  }));
}

/** The reading's items with the lines put back on them. */
export function correctedItems(items: ScanItem[], lines: ReadingLine[]): ScanItem[] {
  return lines.map((line) => {
    const was = line.id === undefined ? undefined : items[Number(line.id)];
    const moved = !was || was.total !== line.total || (was.vatRate ?? null) !== line.vatRate;
    const pack = line.pack ? toPack(line.pack) : null;
    const held = pack && pack !== 'packages' ? pack : null;
    return {
      ...was,
      product: line.productName.trim(),
      quantity: line.quantity,
      unit: line.unit ?? undefined,
      unitPrice: line.unitPrice,
      total: line.total,
      vatRate: line.vatRate ?? undefined,
      // The printed value with VAT says nothing about a figure that was retyped.
      grossTotal: moved
        ? (line.vatRate === null ? undefined : cents(line.total * (1 + line.vatRate / 100)))
        : was?.grossTotal,
      packAmount: held?.amount,
      packUnit: held?.unit,
    };
  });
}

/** What the reader got wrong, line by line, for it to learn from. */
export function changedLines(items: ScanItem[], lines: ReadingLine[]) {
  const figures = (l: { quantity: number; unit?: string | null; unitPrice: number; total: number }) =>
    lineFigures({ quantity: l.quantity, unit: l.unit?.trim() || null, unitPrice: l.unitPrice, total: l.total });
  return lines.flatMap((line) => {
    const was = line.id === undefined ? undefined : items[Number(line.id)];
    if (!was || figures(was) === figures(line)) return [];
    return [{ productName: was.product, readValue: figures(was), savedValue: figures(line) }];
  });
}
