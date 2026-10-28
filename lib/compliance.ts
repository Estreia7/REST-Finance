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
 * The categories a document is filed under. The document itself is whatever
 * the owner names it: "Plano HACCP" is a licence, "Contrato de pragas" is
 * hygiene, and a fixed list of specific documents never fitted every kitchen.
 */
export const COMPLIANCE_CATEGORIES = [
  'LICENCE',
  'INSURANCE',
  'SAFETY',
  'HYGIENE',
  'CONTRACT',
  'OTHER',
] as const;

export type ComplianceCategory = (typeof COMPLIANCE_CATEGORIES)[number];

export type ComplianceSummary = {
  /** Names of the documents past their date, soonest-lapsed first as given. */
  expired: string[];
  /** Names of the documents inside the warning window. */
  expiring: string[];
  totalDocs: number;
  /** At least one document, and none lapsed or about to. */
  allClear: boolean;
};

/**
 * Rolls a restaurant's documents up into the line shown at the top of the page.
 *
 * Every row answers for itself: there is no list of documents a restaurant
 * must have, only the ones the owner keeps, each judged by its own date. An
 * empty vault is not "tudo em dia", though; it is simply empty.
 */
export function summarise(
  docs: { name: string; expiresAt: Date | null }[],
  now = new Date()
): ComplianceSummary {
  const expired: string[] = [];
  const expiring: string[] = [];
  for (const doc of docs) {
    const status = statusFor(doc.expiresAt, now);
    if (status === 'expired') expired.push(doc.name);
    else if (status === 'expiring') expiring.push(doc.name);
  }

  return {
    expired,
    expiring,
    totalDocs: docs.length,
    allClear: docs.length > 0 && expired.length === 0 && expiring.length === 0,
  };
}
