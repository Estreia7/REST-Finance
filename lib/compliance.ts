/**
 * Compliance helpers that are not server actions.
 *
 * A 'use server' file may only export async functions, so the constants and the
 * pure status calculation live here and are shared by both the actions and the
 * UI. Keeping the status rule in one place means the dashboard warning, the
 * summary line and the indicator in the table can never disagree about what
 * "expiring" means.
 */

/** Days before expiry at which a document turns amber. */
export const EXPIRY_WARNING_DAYS = 15;

export type ComplianceStatus = 'valid' | 'expiring' | 'expired' | 'no_expiry';

export type RenewalPeriod = 'NONE' | 'MONTHLY' | 'ANNUAL';

export const RENEWAL_LABELS: Record<RenewalPeriod, string> = {
  NONE: 'Sem renovação',
  MONTHLY: 'Mensal',
  ANNUAL: 'Anual',
};

/** How a document stands relative to today. */
export function statusFor(expiresAt: Date | null, now = new Date()): ComplianceStatus {
  if (!expiresAt) return 'no_expiry';

  const days = daysUntilExpiry(expiresAt, now)!;
  if (days < 0) return 'expired';
  if (days <= EXPIRY_WARNING_DAYS) return 'expiring';
  return 'valid';
}

/**
 * Whole days until expiry; negative once past. Null when it never expires.
 *
 * Compared date to date rather than instant to instant: a licence valid until
 * the 30th is valid for the whole of the 30th, so counting raw milliseconds
 * would show it expired from the morning onwards.
 */
export function daysUntilExpiry(expiresAt: Date | null, now = new Date()): number | null {
  if (!expiresAt) return null;

  const end = new Date(expiresAt);
  const startOfExpiry = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  const startOfToday = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());

  return Math.round((startOfExpiry - startOfToday) / 86_400_000);
}

/**
 * The expiry that follows from a renewal cadence.
 *
 * Offered as a default when a document is added, so an owner entering a monthly
 * licence does not have to work out the date themselves. Returns null when the
 * document does not renew.
 */
export function nextExpiryFrom(from: Date, period: RenewalPeriod): Date | null {
  if (period === 'NONE') return null;

  const next = new Date(from);
  if (period === 'MONTHLY') next.setUTCMonth(next.getUTCMonth() + 1);
  else next.setUTCFullYear(next.getUTCFullYear() + 1);

  return next;
}

/**
 * The expiry to store: the one the owner typed, or else the one their issue
 * date and renewal imply.
 *
 * An annual HACCP certificate issued on 1 March is valid until 1 March next
 * year; asking the owner to work that out and type it is how documents end
 * up with no expiry at all, and so are never chased.
 */
export function resolveExpiry(
  issuedAt: Date | null | undefined,
  expiresAt: Date | null | undefined,
  period: RenewalPeriod,
): Date | null {
  if (expiresAt) return expiresAt;
  if (!issuedAt) return null;
  return nextExpiryFrom(issuedAt, period);
}

/**
 * A date as the value of an `<input type="date">`.
 *
 * Read in UTC, because that is how a typed date is stored (midnight UTC): in
 * local time a Brazilian browser would show the day before.
 */
export function toDateInput(value: Date | string | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/**
 * The documents a Portuguese restaurant is expected to keep to hand.
 *
 * "Missing" has to mean something before the summary can count it, and an
 * empty vault reporting "tudo em dia" would be worse than useless. These four
 * are the ones an ASAE inspection asks for; anything else an owner adds is a
 * bonus rather than a requirement.
 */
export const REQUIRED_DOC_TYPES = [
  'INSURANCE',
  'HACCP',
  'ASAE_LICENCE',
  'FIRE_SAFETY',
] as const;

export type RequiredDocType = (typeof REQUIRED_DOC_TYPES)[number];

export type ComplianceSummary = {
  /** Required types with no document at all on file. */
  missingTypes: RequiredDocType[];
  expiredCount: number;
  expiringCount: number;
  totalDocs: number;
  /** Nothing missing, nothing lapsed, nothing about to lapse. */
  allClear: boolean;
};

/**
 * Rolls a restaurant's documents up into the line shown at the top of the page.
 *
 * A document that has lapsed does not count as present: an expired licence is
 * the same problem as a missing one on the day somebody asks to see it.
 */
export function summarise(
  docs: { type: string; expiresAt: Date | null }[],
  now = new Date()
): ComplianceSummary {
  const usable = new Set(
    docs.filter((d) => statusFor(d.expiresAt, now) !== 'expired').map((d) => d.type)
  );

  const missingTypes = REQUIRED_DOC_TYPES.filter((t) => !usable.has(t));

  let expiredCount = 0;
  let expiringCount = 0;
  for (const doc of docs) {
    const status = statusFor(doc.expiresAt, now);
    if (status === 'expired') expiredCount += 1;
    else if (status === 'expiring') expiringCount += 1;
  }

  return {
    missingTypes,
    expiredCount,
    expiringCount,
    totalDocs: docs.length,
    allClear: missingTypes.length === 0 && expiredCount === 0 && expiringCount === 0,
  };
}
