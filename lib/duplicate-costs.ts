/**
 * Finding a cost that is really an invoice already on file.
 *
 * Before invoice lines were kept, a scan became a single cost entry with the
 * supplier and the products flattened into its description, and no supplier,
 * no document number and often a misread year. Scanning the same paper again
 * later gives a proper invoice with its own cost entry, and so the purchase
 * is counted twice: once in what is owed, and in the P&L wherever the old
 * date happened to be right.
 *
 * Neither the date nor the amount can pair them. The old reading got the year
 * wrong as often as not, and the invoice list totals the lines before tax
 * where the old entry took the total. What the two do share is the products:
 * the old description names the same lines the invoice holds. That is what
 * this matches on, with the supplier as a check and the amount only as a
 * sanity bound.
 *
 * Pure, so the rule is tested without a database; the queries and the merge
 * live in lib/duplicate-costs-server.ts.
 */

/** A cost with no invoice behind it: no lines, no number, not a fixed cost. */
export interface OrphanCost {
  id: string;
  description: string | null;
  amount: number;
  dateKey: string;
  vendorId: string | null;
}

/** A cost that came from a scanned invoice, with the lines it holds. */
export interface InvoiceCost {
  id: string;
  invoiceNumber: string | null;
  vendorId: string | null;
  vendorName: string | null;
  dateKey: string;
  amount: number;
  lineNames: string[];
}

export interface DuplicateMatch {
  orphanId: string;
  invoiceId: string;
  /** Invoice lines found in the old description. */
  matched: number;
  /** Lines the invoice holds. */
  lines: number;
}

/** Below this many matched lines, a shared word or two is coincidence. */
const MIN_MATCHED_LINES = 2;
/** Share of the invoice's lines that must appear in the description. */
const MIN_LINE_SHARE = 0.6;
/** Share of a line's words that must appear for the line to count. */
const MIN_WORD_SHARE = 0.6;
/**
 * The amounts may differ by the tax, and by a misread digit, but not by a
 * factor of two: past that they are different purchases.
 */
const MAX_AMOUNT_RATIO = 2;

/**
 * Words that say nothing about which product it is: units, packaging and
 * the legal tail of a company name.
 */
const NOISE = new Set([
  'kg', 'gr', 'grs', 'lt', 'lts', 'ml', 'cl', 'un', 'und', 'uni', 'unid', 'cx', 'emb', 'pack',
  'cart', 'saco', 'garrafa', 'lata', 'com', 'sem', 'para', 'the', 'and',
  'lda', 'unipessoal', 'portugal', 'comercio', 'sociedade', 'cia',
]);

/** The words of a text that could identify a product or a supplier. */
export function significantWords(text: string): string[] {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !/^\d+$/.test(w) && !NOISE.has(w));
}

/**
 * Whether two words are the same word read twice. One letter may differ in a
 * longer word, because the two readings of one invoice disagree that much
 * ("HELADO" and "GELADO") and no more.
 */
function sameWord(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length < 5 || b.length < 5 || Math.abs(a.length - b.length) > 1) return false;

  // Edit distance of at most one, without building the whole table.
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

/** The words of a description, kept both ways: exact lookups are the common case. */
interface WordBag {
  list: string[];
  set: Set<string>;
}

const bagOf = (words: string[]): WordBag => ({ list: words, set: new Set(words) });

// Runs for every old cost against every invoice when the payments open, so
// the exact match is a set lookup and only a miss pays for the fuzzy scan.
const containsWord = (bag: WordBag, word: string) =>
  bag.set.has(word) || (word.length >= 5 && bag.list.some((w) => sameWord(w, word)));

/** Whether one invoice line is named in the description. */
function lineAppears(line: string, description: WordBag): boolean {
  const words = significantWords(line);
  if (words.length === 0) return false;
  const found = words.filter((w) => containsWord(description, w)).length;
  return found / words.length >= MIN_WORD_SHARE;
}

/** How well an old cost matches an invoice; null when it does not. */
export function scoreMatch(orphan: OrphanCost, invoice: InvoiceCost): DuplicateMatch | null {
  // Two suppliers on file that disagree are two purchases.
  if (orphan.vendorId && invoice.vendorId && orphan.vendorId !== invoice.vendorId) return null;

  if (orphan.amount > 0 && invoice.amount > 0) {
    const ratio = Math.max(orphan.amount, invoice.amount) / Math.min(orphan.amount, invoice.amount);
    if (ratio > MAX_AMOUNT_RATIO) return null;
  }

  const description = bagOf(significantWords(orphan.description ?? ''));
  if (description.list.length === 0 || invoice.lineNames.length === 0) return null;

  // The old description begins with the supplier's name. When the invoice
  // knows its supplier, the description must name it too: Makro and Recheio
  // both sell the same mozzarella.
  if (!orphan.vendorId && invoice.vendorName) {
    const vendorWords = significantWords(invoice.vendorName);
    if (vendorWords.length > 0 && !vendorWords.some((w) => containsWord(description, w))) return null;
  }

  const matched = invoice.lineNames.filter((line) => lineAppears(line, description)).length;
  const lines = invoice.lineNames.length;
  if (matched < Math.min(MIN_MATCHED_LINES, lines)) return null;
  if (matched / lines < MIN_LINE_SHARE) return null;
  // A one-line invoice needs more than one word in common to be believed.
  if (lines === 1 && significantWords(invoice.lineNames[0]).length < 2) return null;

  return { orphanId: orphan.id, invoiceId: invoice.id, matched, lines };
}

/**
 * Pairs each old cost with the invoice it duplicates.
 *
 * One to one: an invoice is the duplicate of at most one old cost, and the
 * closest pair wins — the most lines matched, then the nearer amount — so two
 * Makro runs a week apart are not both pinned to one invoice.
 */
export function findDuplicates(orphans: OrphanCost[], invoices: InvoiceCost[]): DuplicateMatch[] {
  const byId = new Map(invoices.map((i) => [i.id, i]));
  const orphanById = new Map(orphans.map((o) => [o.id, o]));

  const candidates: DuplicateMatch[] = [];
  for (const orphan of orphans) {
    for (const invoice of invoices) {
      const match = scoreMatch(orphan, invoice);
      if (match) candidates.push(match);
    }
  }

  const gap = (m: DuplicateMatch) =>
    Math.abs(orphanById.get(m.orphanId)!.amount - byId.get(m.invoiceId)!.amount);
  candidates.sort((a, b) => b.matched / b.lines - a.matched / a.lines || b.matched - a.matched || gap(a) - gap(b));

  const usedOrphans = new Set<string>();
  const usedInvoices = new Set<string>();
  const pairs: DuplicateMatch[] = [];
  for (const c of candidates) {
    if (usedOrphans.has(c.orphanId) || usedInvoices.has(c.invoiceId)) continue;
    usedOrphans.add(c.orphanId);
    usedInvoices.add(c.invoiceId);
    pairs.push(c);
  }
  return pairs;
}
