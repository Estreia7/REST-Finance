/**
 * Whether a product the owner names is the one an invoice line describes.
 *
 * Suppliers abbreviate: the same Super Bock is "CERV.SUPER BOCK 24X33CL TP*"
 * at Makro and "CERV S BOCK TP 24X33CL" at Recheio. A plain substring search
 * for "super bock" finds the first and misses the second, and the owner is
 * told they never bought it. Matching word by word, with a word allowed to be
 * cut short ("cerv" for "cerveja") or reduced to its initial ("s" for
 * "super"), finds both without matching everything.
 *
 * Pure, so the abbreviations real invoices use are tested.
 */

/** Lowercase words without accents or punctuation: "Açúcar 1KG" -> ["acucar", "1kg"]. */
export function productWords(text: string): string[] {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
}

/** One word the owner typed, against the words of the invoice line. */
function wordFound(word: string, name: string[]): boolean {
  if (word.length === 1) return name.some((t) => t.startsWith(word));
  if (word.length === 2) {
    // "sb" for "s bock" or "super bock": the initials of two words in a row.
    if (name.some((t, i) => i + 1 < name.length && t[0] === word[0] && name[i + 1][0] === word[1])) return true;
    return name.includes(word);
  }
  return name.some((t) =>
    t.startsWith(word) // "bock" in "bock"
    || (t.length >= 3 && word.startsWith(t)) // "cerv" on the line, "cerveja" asked
    || (t.length === 1 && word.startsWith(t)), // "s" on the line, "super" asked
  );
}

export function matchesProduct(query: string, productName: string): boolean {
  const asked = productWords(query);
  if (asked.length === 0) return false;
  const name = productWords(productName);
  // "superbock" asked, "super bock" printed, or the other way round.
  const joinedAsked = asked.join('');
  if (joinedAsked.length >= 4 && name.join('').includes(joinedAsked)) return true;
  if (!asked.every((w) => wordFound(w, name))) return false;
  // Abbreviations alone prove nothing: "cerveja sagres" is not "CERV S BOCK".
  // At least one word asked must be on the line whole, unless all that was
  // asked are initials ("sb").
  const long = asked.filter((w) => w.length >= 3);
  // "superbock" asked holds the whole "bock" of "S BOCK".
  return long.length === 0 || long.some((w) => name.some((t) => t.startsWith(w) || (t.length >= 4 && w.length > t.length && w.endsWith(t))));
}

/**
 * Names that share a real word with what was asked, for when nothing matched:
 * the assistant offers them instead of saying the product was never bought.
 */
export function relatedProducts(query: string, names: string[], limit = 15): string[] {
  const asked = productWords(query).filter((w) => w.length >= 4);
  if (asked.length === 0) return [];
  return names
    .filter((n) => productWords(n).some((t) => t.length >= 3 && asked.some((w) => t.startsWith(w.slice(0, 4)) || w.startsWith(t))))
    .slice(0, limit);
}
