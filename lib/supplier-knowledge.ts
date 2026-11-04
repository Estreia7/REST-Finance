/**
 * What the reader has learned about how each supplier prints its invoices.
 *
 * A supplier's layout is the same for every restaurant that buys from it, so
 * what one owner's corrections reveal about Recheio helps the next one. The
 * corrections are only the evidence: a rule reaches the reader once an
 * administrator has approved it, because a bad rule would misread every invoice
 * from that supplier, for every client. Rules speak of columns and units, never
 * of prices or of any restaurant.
 *
 * Keyed by NIF and not by name, which is however the letterhead was read that
 * day. A rule may apply to one kind of document only (FT, FR, FS as the QR
 * states it), because the same supplier's till receipt and invoice can differ.
 *
 * Pure: the server reads and writes, this decides.
 */

/** Corrections alike before a pattern is worth an administrator's time. */
export const MIN_SEEN = 2;

const EXAMPLES = 5;

export const SUGGESTIONS = ['weighed', 'packs', 'prices'] as const;
export type SuggestionKind = (typeof SUGGESTIONS)[number];

export interface LearnedCorrection {
  taxId: string;
  vendorName: string;
  restaurantId: string;
  productName: string | null;
  field: string;
  readValue: string | null;
  savedValue: string | null;
  createdAt: Date;
}

export interface SupplierRule {
  id: string;
  taxId: string;
  vendorName: string;
  docType: string | null;
  note: string;
  /** The suggestion it came from, so it is not offered again. */
  source: string | null;
  active: boolean;
}

export interface SupplierLearning {
  taxId: string;
  vendorName: string;
  corrections: number;
  restaurants: number;
  examples: Array<Pick<LearnedCorrection, 'productName' | 'field' | 'readValue' | 'savedValue'>>;
  suggestions: Array<{ kind: SuggestionKind; seen: number }>;
  rules: SupplierRule[];
}

/** The unit in a stored line, "0.905 kg x 3.69 = 3.34", or null without one. */
function unitOf(figures: string | null): string | null {
  return figures?.match(/^\S+ (\S+) x /)?.[1] ?? null;
}

/** The mistake a correction is evidence of, or null when it says nothing about layout. */
export function kindOf(c: Pick<LearnedCorrection, 'field' | 'readValue' | 'savedValue'>): SuggestionKind | null {
  if (c.field === 'line') {
    const saved = unitOf(c.savedValue);
    const weighed = (saved === 'kg' || saved === 'L') && unitOf(c.readValue) !== saved;
    return weighed ? 'weighed' : 'prices';
  }
  if (c.field === 'pack') return 'packs';
  if (c.field === 'unitPrice') return 'prices';
  return null;
}

/** Every supplier with something to teach, most corrections first. */
export function groupLearning(corrections: LearnedCorrection[], rules: SupplierRule[]): SupplierLearning[] {
  const taxIds = new Set([...corrections.map((c) => c.taxId), ...rules.map((r) => r.taxId)]);

  return [...taxIds]
    .map((taxId): SupplierLearning => {
      const own = corrections
        .filter((c) => c.taxId === taxId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      const ruled = rules.filter((r) => r.taxId === taxId);

      const seen = new Map<SuggestionKind, number>();
      for (const c of own) {
        const kind = kindOf(c);
        if (kind) seen.set(kind, (seen.get(kind) ?? 0) + 1);
      }

      return {
        taxId,
        vendorName: own[0]?.vendorName ?? ruled[0]?.vendorName ?? taxId,
        corrections: own.length,
        restaurants: new Set(own.map((c) => c.restaurantId)).size,
        examples: own.slice(0, EXAMPLES).map(({ productName, field, readValue, savedValue }) => ({
          productName, field, readValue, savedValue,
        })),
        suggestions: [...seen.entries()]
          .filter(([kind, count]) => count >= MIN_SEEN && !ruled.some((r) => r.source === kind))
          .map(([kind, count]) => ({ kind, seen: count }))
          .sort((a, b) => b.seen - a.seen),
        rules: ruled,
      };
    })
    .sort((a, b) => b.corrections - a.corrections || a.vendorName.localeCompare(b.vendorName));
}

/** The rules that apply to this document: its own kind, and those for all kinds. */
export function rulesFor(
  rules: Array<Pick<SupplierRule, 'note' | 'docType' | 'active'>>,
  docType: string | null | undefined,
): string[] {
  return rules.filter((r) => r.active && (r.docType === null || r.docType === docType)).map((r) => r.note);
}

/** What the reader is told, or nothing when nothing has been learned. */
export function readerNote(notes: string[]): string {
  if (notes.length === 0) return '';
  return [
    '\n\nWhat earlier invoices from this supplier showed about how it prints them:',
    ...notes.map((note) => `- ${note}`),
    'Use this to read the columns correctly. Still report only what is printed on this page.',
  ].join('\n');
}

/** A NIF as stored: nine digits, whatever was around them. */
export function cleanTaxId(value: string | null | undefined): string | null {
  const digits = (value ?? '').replace(/\D/g, '');
  return digits.length === 9 ? digits : null;
}
