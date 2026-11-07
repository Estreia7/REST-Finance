import type { DocumentIssue } from './invoice-checks';

/**
 * Invoices that count by their total alone.
 *
 * A fridge repair is a running cost: none of its lines will ever price an
 * ingredient, so nobody should be asked about them, and a row misread on one
 * changes nothing that matters. Only an invoice with nothing that goes into what
 * is sold qualifies: one with food among the cleaning keeps its lines.
 *
 * Pure.
 */

export function isWholeInvoice(input: {
  type: string | null | undefined;
  /** What each line was taken for, where anyone knows. */
  lines: Array<{ type?: string | null; linked?: boolean }>;
}): boolean {
  return input.type === 'OPEX' && input.lines.every((line) => line.type !== 'COGS' && !line.linked);
}

/**
 * The issues that still matter once only the total does.
 *
 * Lines that miss the document stop mattering where something other than the
 * lines says what the total is: the QR, or the VAT table.
 */
export function issuesOfWholeInvoice(issues: DocumentIssue[], totalVouched: boolean): DocumentIssue[] {
  return totalVouched
    ? issues.filter((issue) => issue.kind !== 'doesNotAddUp' && issue.kind !== 'linesOverTotal')
    : issues;
}

/**
 * Invoice lines outside such invoices, for lists of what was bought.
 *
 * A saved running cost in a single category is one of these however it was saved,
 * so invoices from before this rule read the same way.
 */
export const notWholeInvoice = {
  OR: [
    { costEntryId: null },
    { costEntry: { type: { not: 'OPEX' as const } } },
    { costEntry: { splitFromId: { not: null } } },
    { costEntry: { splitParts: { some: {} } } },
  ],
};
