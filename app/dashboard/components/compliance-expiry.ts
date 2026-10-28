/**
 * The part an owner acts on: how long is left, in words.
 *
 * Shared by the table and the form, so the countdown under a date being typed
 * reads exactly as it will in the row once saved.
 *
 * The count sits in the middle of the phrase in both languages, but the rest of
 * the wording differs on either side of it ("expirou há 3 dias" against
 * "expired 3 days ago"), so each phrase is one key holding a {n} slot rather
 * than a chain of fragments that would only read correctly in Portuguese.
 */
export function expiryPhrase(days: number, t: (key: string) => string): string {
  const fill = (key: string, n: number) => t(key).replace('{n}', String(n));

  if (days < 0) {
    const n = Math.abs(days);
    return fill(n === 1 ? 'compliance.expiry.expiredOne' : 'compliance.expiry.expiredMany', n);
  }
  if (days === 0) return t('compliance.expiry.today');
  return fill(days === 1 ? 'compliance.expiry.expiresOne' : 'compliance.expiry.expiresMany', days);
}
