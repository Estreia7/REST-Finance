/**
 * Checking Portuguese document fields that can be checked.
 *
 * Most of what comes off an invoice can only be verified by looking at the
 * paper. A few fields carry their own proof, and those are worth testing
 * automatically: a NIF has a check digit, so a misread one is usually
 * detectable without knowing the right answer. That turns "the model said
 * 515194077" into "the model said something that is at least a real NIF",
 * which is the difference between a plausible error and a caught one.
 *
 * Used by the extraction bench to flag suspect runs before anyone types in
 * the ground truth.
 */

/**
 * Whether a Portuguese NIF (número de identificação fiscal) is well-formed.
 *
 * Nine digits, where the last is a mod-11 check over the first eight. The
 * first digit also identifies the kind of holder: 1, 2, 3 are individuals,
 * 5 a company, 6 public bodies, 8 a sole trader, and 45/70/71/72/74/75/77/
 * 78/79/90/91/98/99 various other categories. A leading digit outside that
 * set is not a NIF, whatever the checksum says.
 *
 * A passing checksum does not mean the number belongs to the supplier on the
 * page — only that it is not a transcription error. That is still most of
 * what OCR gets wrong.
 */
export function isValidNif(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  if (digits.length !== 9) return false;

  if (!isKnownNifPrefix(digits)) return false;

  // Weights run 9..2 across the first eight digits.
  let sum = 0;
  for (let i = 0; i < 8; i++) {
    sum += Number(digits[i]) * (9 - i);
  }

  const remainder = sum % 11;
  // A remainder below 2 means a check digit of 0; otherwise 11 minus it.
  const expected = remainder < 2 ? 0 : 11 - remainder;

  return Number(digits[8]) === expected;
}

/** The leading digits Portuguese tax numbers are actually issued under. */
function isKnownNifPrefix(digits: string): boolean {
  const one = digits[0];
  const two = digits.slice(0, 2);

  if (['1', '2', '3', '5', '6', '8'].includes(one)) return true;
  return ['45', '70', '71', '72', '74', '75', '77', '78', '79', '90', '91', '98', '99'].includes(two);
}

/**
 * Whether a date string is the ISO form the extractor is asked for, and is a
 * real day.
 *
 * `new Date('2026-02-30')` rolls over to March rather than failing, so the
 * parsed date is compared back against the string it came from.
 */
export function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.toISOString().slice(0, 10) === value;
}

/** A warning about an extraction, raised without knowing the true answer. */
export interface ExtractionWarning {
  field: string;
  /** Why it looks wrong, as a dictionary key the UI translates. */
  code: 'invalidNif' | 'invalidDate' | 'totalMismatch' | 'futureDate' | 'negativeAmount';
  detail?: string;
}

/** How far the line items may miss the stated total before it is suspicious. */
const TOTAL_TOLERANCE = 0.02;

/**
 * Looks over an extraction for things that are wrong on their own terms.
 *
 * This is not accuracy — it cannot see the document. It is the subset of
 * errors that can be caught for free, so that a run which fails here can be
 * looked at first.
 */
export function checkExtraction(data: Record<string, unknown>): ExtractionWarning[] {
  const warnings: ExtractionWarning[] = [];

  const date = data.date;
  if (typeof date === 'string') {
    if (!isValidIsoDate(date)) {
      warnings.push({ field: 'date', code: 'invalidDate', detail: date });
    } else if (new Date(`${date}T00:00:00Z`).getTime() > Date.now() + 86_400_000) {
      // Tomorrow or later: a till report cannot be from the future, and this
      // is the usual shape of a misread year.
      warnings.push({ field: 'date', code: 'futureDate', detail: date });
    }
  }

  const nif = data.vendorTaxId;
  if (typeof nif === 'string' && nif.length > 0 && !isValidNif(nif)) {
    warnings.push({ field: 'vendorTaxId', code: 'invalidNif', detail: nif });
  }

  // Money that came back negative is a sign reading error, not a credit note:
  // a credit note would be negative throughout, not in one field.
  for (const field of ['grandTotal', 'dineInRevenue', 'takeawayRevenue'] as const) {
    const amount = data[field];
    if (typeof amount === 'number' && amount < 0) {
      warnings.push({ field, code: 'negativeAmount', detail: String(amount) });
    }
  }

  // Line items that do not add up to the stated total. Checked only when
  // both are present, and against the total rather than each line, because a
  // single mis-scanned line is exactly what this is meant to surface.
  const items = data.items;
  const grandTotal = data.grandTotal;
  if (Array.isArray(items) && items.length > 0 && typeof grandTotal === 'number') {
    const summed = items.reduce((sum: number, item: unknown) => {
      const total = (item as { total?: unknown })?.total;
      return sum + (typeof total === 'number' ? total : 0);
    }, 0);

    // Only flagged when it is off by more than rounding. An invoice whose
    // total legitimately includes VAT the lines exclude will trip this; that
    // is a finding about the prompt, which is the point.
    if (Math.abs(summed - grandTotal) > TOTAL_TOLERANCE) {
      warnings.push({
        field: 'grandTotal',
        code: 'totalMismatch',
        detail: `${summed.toFixed(2)} ≠ ${grandTotal.toFixed(2)}`,
      });
    }
  }

  return warnings;
}
