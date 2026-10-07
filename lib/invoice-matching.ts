/**
 * Working out what an invoice line is.
 *
 * A supplier writes "CARNE PICADA NOVILHO 80/20"; the kitchen calls the same
 * thing "Carne Smash". Nobody is going to retype that correspondence for
 * every line of every invoice, and if they have to, the invoices stop being
 * scanned and the ingredient costs go stale — which is the whole point of
 * scanning them.
 *
 * So each line is matched against the ingredients the restaurant already has,
 * and the owner is asked only where the guess is not safe. A confirmed match
 * is remembered against that supplier's exact wording, so the same line on
 * next month's invoice needs no one at all.
 *
 * Deliberately not fuzzy-for-the-sake-of-it. A wrong link is worse than no
 * link: it quietly reprices a dish and the owner believes the margin. So the
 * bar for linking without asking is high, and everything below it is a
 * question rather than a decision.
 */

/** Words that say nothing about what a thing is. */
const NOISE = new Set([
  'kg', 'kgs', 'g', 'gr', 'grs', 'l', 'lt', 'lts', 'ml', 'un', 'uni', 'unid',
  'unidade', 'unidades', 'cx', 'caixa', 'caixas', 'pc', 'pcs', 'pct', 'pack',
  'emb', 'embalagem', 'dz', 'duzia', 'dúzia', 'saco', 'sacos', 'lata', 'latas',
  'de', 'da', 'do', 'das', 'dos', 'e', 'com', 'sem', 'para', 'por', 'a', 'o',
  'congelado', 'congelada', 'fresco', 'fresca', 'refrigerado',
]);

/**
 * A name reduced to the words that identify it.
 *
 * Accents go, because a supplier writes "PAO" as often as "PÃO" and the two
 * are the same bread. Numbers go, because "80/20" and "500G" describe the
 * packaging rather than the product. What is left is a set, so word order
 * stops mattering: "queijo cheddar" and "cheddar queijo" are one thing.
 */
export function significantWords(name: string): string[] {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(
      (w) =>
        w.length > 1 &&
        !NOISE.has(w) &&
        // A bare number, and a number welded to its unit. "2,5KG" arrives as
        // "2" and "5kg" once the comma becomes a space, and "5kg" is as much
        // about the packet as "kg" alone is.
        !/^\d+$/.test(w) &&
        !/^\d+(kg|g|gr|l|lt|ml|un|cl|cx|pc)$/.test(w),
    );
}

/**
 * How alike two names are, 0 to 1.
 *
 * The share of the shorter name's words that the longer one also has. Shorter
 * on purpose: "Carne Smash" against "Carne Picada Novilho 80/20" should score
 * on whether the two words of the kitchen's name appear, not be punished for
 * the supplier's extra detail.
 */
export function similarity(a: string, b: string): number {
  const wa = significantWords(a);
  const wb = significantWords(b);
  if (wa.length === 0 || wb.length === 0) return 0;

  const setB = new Set(wb);
  const shared = wa.filter((w) => setB.has(w)).length;
  const sharedOther = wb.filter((w) => new Set(wa).has(w)).length;

  // Measured both ways and the better taken, since either name may be the
  // more detailed one.
  return Math.max(shared / wa.length, sharedOther / wb.length);
}

/** An ingredient a line could be. */
export interface MatchCandidate {
  id: string;
  name: string;
  unit: string;
}

export interface LineMatch {
  /** Picked automatically: good enough that asking would be noise. */
  certain: MatchCandidate | null;
  /** Every ingredient previously confirmed for this wording. */
  remembered?: MatchCandidate[];
  /** Offered to the owner, best first. Empty when nothing is close. */
  suggestions: MatchCandidate[];
  /**
   * Other ingredients that share a word with the line, offered unticked.
   *
   * Computed even when the line is already linked, because one purchase
   * often feeds several ingredients: the case of mince linked to "Carne
   * Picada Novilho" is also the "Carne Smash" and the "EXTRA CARNE", and an
   * owner should not have to hunt for those in a list of ninety.
   */
  related: MatchCandidate[];
  /** What the best candidate scored, for showing why it was suggested. */
  score: number;
}

/**
 * Above this a match is taken without asking.
 *
 * Every significant word of one name appearing in the other. "Carne Smash"
 * against "Carne Smash 80/20" clears it; "Carne Picada Novilho" does not,
 * because only "carne" is shared and one word in common is how "Carne Smash"
 * would get linked to "Carne de Porco".
 */
const CERTAIN = 0.999;

/** Below this a candidate is not worth showing at all. */
const WORTH_SHOWING = 0.34;

/** Never offer more than this; past three it is a list, not a suggestion. */
const MAX_SUGGESTIONS = 3;

/** Related ingredients shown beside the line; the search box finds the rest. */
const MAX_RELATED = 5;

/**
 * What an invoice line probably is.
 *
 * `remembered` is a previously confirmed link for this supplier's exact
 * wording — once the owner has said "this is Carne Smash", nothing should
 * ask again.
 */
export function matchLine(
  productName: string,
  candidates: MatchCandidate[],
  /** Ingredient ids already confirmed for this wording. */
  remembered?: string[] | null,
): LineMatch {
  const scored = candidates
    .map((candidate) => ({ candidate, score: similarity(productName, candidate.name) }))
    .filter((s) => s.score >= WORTH_SHOWING)
    .sort((a, b) => b.score - a.score || a.candidate.name.localeCompare(b.candidate.name));

  /** Everything close that is not already offered another way. */
  const relatedExcept = (shown: MatchCandidate[]) => {
    const ids = new Set(shown.map((c) => c.id));
    return scored
      .map((s) => s.candidate)
      .filter((c) => !ids.has(c.id))
      .slice(0, MAX_RELATED);
  };

  if (remembered?.length) {
    const known = remembered
      .map((id) => candidates.find((c) => c.id === id))
      .filter((c): c is MatchCandidate => !!c);
    // Only if at least one survives: ingredients deleted since must not
    // silently link a line to nothing.
    if (known.length > 0) {
      return { certain: known[0], remembered: known, suggestions: [], related: relatedExcept(known), score: 1 };
    }
  }

  if (scored.length === 0) return { certain: null, suggestions: [], related: [], score: 0 };

  const best = scored[0];

  // A clear winner, or nothing. Two candidates scoring the same is exactly
  // the case where guessing is worst — the owner knows which, and we do not.
  const tied = scored.length > 1 && scored[1].score === best.score;
  if (best.score >= CERTAIN && !tied) {
    return {
      certain: best.candidate,
      suggestions: [],
      related: relatedExcept([best.candidate]),
      score: best.score,
    };
  }

  const suggestions = scored.slice(0, MAX_SUGGESTIONS).map((s) => s.candidate);
  return { certain: null, suggestions, related: relatedExcept(suggestions), score: best.score };
}

/** What the owner is asked to do with one line. */
export type LineDecision =
  /**
   * Linked already — remembered, or close enough to be sure.
   *
   * Several, because one purchase can feed more than one of the
   * kitchen's ingredients: a case of meat is both the burger mince and
   * the extra portion sold on the side. They share a price per kilo,
   * being the same product bought once.
   */
  | { kind: 'linked'; ingredients: MatchCandidate[]; related: MatchCandidate[] }
  /** We have guesses; the owner picks one or rejects them. */
  | { kind: 'ask'; suggestions: MatchCandidate[]; related: MatchCandidate[] }
  /** Nothing resembles it. Offered as a new ingredient. */
  | { kind: 'new' };

export interface InvoiceLine {
  productName: string;
  quantity: number;
  unit?: string;
  unitPrice: number;
  total: number;
}

export interface ReconciledLine extends InvoiceLine {
  decision: LineDecision;
  /** How much of the invoice this line is, for ordering by what matters. */
  share: number;
}

/**
 * The whole invoice, reconciled.
 *
 * Ordered by what each line cost, so the owner meets the decision that moves
 * their margins before the one about a bag of salt.
 */
export function reconcileInvoice(
  lines: InvoiceLine[],
  candidates: MatchCandidate[],
  /** Wording to every ingredient id confirmed for it. */
  remembered: Map<string, string[]> = new Map(),
): ReconciledLine[] {
  const invoiceTotal = lines.reduce((s, l) => s + Math.abs(l.total), 0);

  return lines
    .map((line) => {
      const match = matchLine(
        line.productName,
        candidates,
        remembered.get(line.productName.trim().toLowerCase()),
      );

      const decision: LineDecision = match.certain
        ? { kind: 'linked', ingredients: match.remembered ?? [match.certain], related: match.related }
        : match.suggestions.length > 0
          ? { kind: 'ask', suggestions: match.suggestions, related: match.related }
          : { kind: 'new' };

      return {
        ...line,
        decision,
        share: invoiceTotal > 0 ? (Math.abs(line.total) / invoiceTotal) * 100 : 0,
      };
    })
    .sort((a, b) => b.share - a.share);
}

/**
 * Whether a line's own arithmetic holds.
 *
 * quantity × unitPrice should be the line total, and when it is not, one of
 * the three was misread. Worth saying out loud: a wrong unit price becomes a
 * wrong ingredient cost, which becomes a wrong margin on every dish using it,
 * and none of that announces itself.
 *
 * A cent of slack, because suppliers round their own lines.
 */
export function lineArithmeticHolds(line: InvoiceLine): boolean {
  if (line.quantity <= 0 || line.unitPrice <= 0) return false;
  const expected = line.quantity * line.unitPrice;
  return Math.abs(expected - line.total) <= Math.max(0.02, Math.abs(line.total) * 0.01);
}

/**
 * The unit price a line implies, when the printed one looks wrong.
 *
 * The total and the quantity are the two figures a supplier is least likely
 * to get wrong and a reader least likely to misread, so they are what the
 * price is recovered from.
 */
export function impliedUnitPrice(line: InvoiceLine): number | null {
  if (line.quantity <= 0) return null;
  return Math.round((line.total / line.quantity) * 10000) / 10000;
}

/**
 * Pairs of ingredients that look like one thing counted twice.
 *
 * The POS import brings its modifiers across as ingredients, so a kitchen
 * ends up holding both "Carne Smash" and "EXTRA CARNE" — the same meat,
 * bought once, served two ways. Two rows means two costs for one product,
 * free to drift apart, and an invoice that has to be told twice what it
 * priced.
 *
 * The tell is reliable in this data: the real ingredient is used in recipes
 * and the duplicate is used in none, because the duplicate only ever came
 * from the till. So the one with recipes behind it is proposed as the
 * original, and the other as its alias.
 *
 * Proposed, never applied. "EXTRA BACON" is the same as "BACON"; "EXTRA
 * CHEDDAR" might be a different cheese bought separately, and only the owner
 * knows which.
 */
export interface AliasCandidate {
  duplicate: { id: string; name: string };
  original: { id: string; name: string };
  score: number;
}

/** Words that mark a portion of something rather than a thing of its own. */
const PORTION_WORDS = new Set(['extra', 'adicional', 'suplemento', 'dobro', 'duplo']);

export function findAliasCandidates(
  ingredients: Array<{ id: string; name: string; recipeCount: number }>,
): AliasCandidate[] {
  const out: AliasCandidate[] = [];

  for (const candidate of ingredients) {
    // Only ever a duplicate if nothing uses it: an ingredient in a recipe is
    // one the owner has already said is real.
    if (candidate.recipeCount > 0) continue;

    const words = significantWords(candidate.name);
    const portion = words.filter((w) => PORTION_WORDS.has(w));
    const rest = words.filter((w) => !PORTION_WORDS.has(w));
    // "EXTRA CARNE" without its "extra" is "carne", which is what should
    // match. A name carrying no portion word is just an unused ingredient.
    if (portion.length === 0 || rest.length === 0) continue;

    const stripped = rest.join(' ');
    let best: { id: string; name: string } | null = null;
    let bestScore = 0;

    for (const other of ingredients) {
      if (other.id === candidate.id || other.recipeCount === 0) continue;
      const score = similarity(stripped, other.name);
      if (score > bestScore) {
        bestScore = score;
        best = { id: other.id, name: other.name };
      }
    }

    // Every word of the shorter name shared. Below that it is a guess about
    // the owner's kitchen, and a wrong merge silently reprices dishes.
    if (best && bestScore >= 0.999) {
      out.push({
        duplicate: { id: candidate.id, name: candidate.name },
        original: best,
        score: bestScore,
      });
    }
  }

  return out.sort((a, b) => a.duplicate.name.localeCompare(b.duplicate.name));
}

/**
 * The pack size written into a product description.
 *
 * Wholesale lines name what is in the box: "TOPPING MORANGO 1KG",
 * "KETCHUP 5,7KG HEINZ", "AGUA 1.5L". A line billed by the package then says
 * quantity 1, and storing that as one *unit* is true but useless — a recipe
 * saying "50 g of topping" cannot convert grams to units, so the dish simply
 * cannot be costed.
 *
 * Reading the size turns one package into the kilos or litres it holds, which
 * is what the kitchen measures in and what the recipe needs.
 *
 * Returns null where there is no size, or where it reads as something other
 * than a quantity — "AGUA 0.33CL" is a bottle size an owner buys by the
 * crate, and "SMASHIE 2.0" is a product name.
 */
export interface PackSize {
  /** How much, in the unit below. */
  amount: number;
  unit: 'kg' | 'L';
}

export function packSizeOf(description: string): PackSize | null {
  // The last size wins: "CART D'OR 1KG CX 6" is six tubs of a kilo, and the
  // kilo is the one that describes what a tub holds.
  const matches = [
    ...description.matchAll(/(\d+(?:[.,]\d+)?)\s*(kg|kgs|g|gr|l|lt|lts|ml|cl)\b/gi),
  ];
  if (matches.length === 0) return null;

  for (let i = matches.length - 1; i >= 0; i--) {
    const [, rawAmount, rawUnit] = matches[i];
    const amount = Number(rawAmount.replace(',', '.'));
    if (!Number.isFinite(amount) || amount <= 0) continue;

    const unit = rawUnit.toLowerCase();

    if (unit === 'kg' || unit === 'kgs') return { amount, unit: 'kg' };
    if (unit === 'l' || unit === 'lt' || unit === 'lts') return { amount, unit: 'L' };

    // Grams and millilitres are converted, since the kitchen buys in kilos
    // and litres and a recipe converts from those.
    if (unit === 'g' || unit === 'gr') {
      // Below 50 g this is almost never a pack size — it is a strength, a
      // percentage, or part of a name.
      if (amount < 50) return null;
      return { amount: amount / 1000, unit: 'kg' };
    }
    if (unit === 'ml') {
      if (amount < 50) return null;
      return { amount: amount / 1000, unit: 'L' };
    }
    if (unit === 'cl') {
      if (amount < 5) return null;
      return { amount: amount / 100, unit: 'L' };
    }
  }

  return null;
}

/**
 * A line restated in the unit the kitchen buys in.
 *
 * One 1 kg tub at 16,99 becomes 1 kg at 16,99 the kilo; one 5,7 kg tub at
 * 16,99 becomes 5,7 kg at 2,98 the kilo. The money is untouched — the line
 * total is what it always was — and only how it is counted changes.
 *
 * Left alone when the line is already billed by weight, when there is no pack
 * size to read, or when the quantity is not a whole number of packages: a
 * line reading 3,84 of something is a weight already, whatever its name says.
 */
export function inPurchaseUnits(line: InvoiceLine): InvoiceLine {
  const unit = (line.unit ?? '').trim().toLowerCase();
  // Already weighed or measured.
  if (unit === 'kg' || unit === 'l') return line;

  const pack = packSizeOf(line.productName);
  if (!pack) return line;

  // Whole packages only. Anything else is a weight the reader labelled badly,
  // and multiplying it by a pack size would invent goods.
  if (!Number.isInteger(line.quantity) || line.quantity <= 0) return line;

  const quantity = line.quantity * pack.amount;
  return {
    ...line,
    quantity: Math.round(quantity * 1000) / 1000,
    unit: pack.unit,
    unitPrice: Math.round((line.total / quantity) * 10000) / 10000,
  };
}
