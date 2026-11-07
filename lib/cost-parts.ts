/**
 * The parts of one invoice, in a list of costs.
 *
 * An invoice with lines in several categories is saved as one cost per category,
 * so the profit and loss can tell food from cleaning. In a list of costs that
 * reads as five unrelated figures, none of them the invoice's total, so each part
 * says which it is and they are kept together. Pure: the server reads the costs.
 */

export interface CostPart {
  id: string;
  splitFromId: string | null;
  amount: number;
}

export interface InvoicePart {
  /** First is the largest. */
  part: number;
  parts: number;
  /** What the whole invoice came to. */
  total: number;
}

const cents = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Which part of its invoice each cost is. A cost that stands alone has none. */
export function invoiceParts(costs: CostPart[]): Map<string, InvoicePart> {
  const groups = new Map<string, CostPart[]>();
  for (const cost of costs) {
    const root = cost.splitFromId ?? cost.id;
    groups.set(root, [...(groups.get(root) ?? []), cost]);
  }

  const parts = new Map<string, InvoicePart>();
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const total = cents(group.reduce((sum, c) => sum + c.amount, 0));
    [...group]
      .sort((a, b) => b.amount - a.amount)
      .forEach((cost, i) => parts.set(cost.id, { part: i + 1, parts: group.length, total }));
  }
  return parts;
}

/** Newest first, with the parts of an invoice side by side, the largest on top. */
export function byInvoice<T extends CostPart & { date: Date }>(costs: T[]): T[] {
  const rootOf = (cost: T) => cost.splitFromId ?? cost.id;
  return [...costs].sort((a, b) => (
    b.date.getTime() - a.date.getTime()
    || rootOf(a).localeCompare(rootOf(b))
    || b.amount - a.amount
  ));
}
