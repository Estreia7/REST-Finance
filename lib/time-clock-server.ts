import { createHmac, randomInt } from 'crypto';

/** A kiosk PIN as stored: HMAC-SHA256 keyed with the server secret (see lib/time-clock.ts). */
export function hashPin(restaurantId: string, pin: string, secret: string): string {
  return createHmac('sha256', secret).update(`${restaurantId}:${pin}`).digest('hex');
}

/** Four digits from a cryptographic source: a PIN should not follow from the last one. */
export function randomPin(): string {
  return String(randomInt(10_000)).padStart(4, '0');
}
