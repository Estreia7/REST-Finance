/**
 * Compliance helpers that are not server actions.
 *
 * A 'use server' file may only export async functions, so the constant and the
 * pure status calculation live here and are shared by both the actions and the
 * UI. Keeping the status rule in one place means the dashboard warning and the
 * document list can never disagree about what "expiring" means.
 */

/** Days before expiry at which a document starts being flagged. */
export const EXPIRY_WARNING_DAYS = 60;

export type ComplianceStatus = 'valid' | 'expiring' | 'expired' | 'no_expiry';

/** How a document stands relative to today. */
export function statusFor(expiresAt: Date | null, now = new Date()): ComplianceStatus {
  if (!expiresAt) return 'no_expiry';

  const days = Math.ceil((new Date(expiresAt).getTime() - now.getTime()) / 86_400_000);
  if (days < 0) return 'expired';
  if (days <= EXPIRY_WARNING_DAYS) return 'expiring';
  return 'valid';
}

/** Whole days until expiry; negative once past. Null when it never expires. */
export function daysUntilExpiry(expiresAt: Date | null, now = new Date()): number | null {
  if (!expiresAt) return null;
  return Math.ceil((new Date(expiresAt).getTime() - now.getTime()) / 86_400_000);
}
