import { isValidNif } from './pt-validation';

/**
 * A restaurant whose business changed NIF on a given day.
 *
 * The usual case: the owner traded as a sole trader and opened a company. The
 * restaurant is the same, but from that day the invoices are made out to the
 * new NIF, while older ones keep the old. Both are the restaurant, never a
 * supplier, so both are named when an invoice is read.
 */

export interface RestaurantNifs {
  taxId: string | null;
  newTaxId?: string | null;
  /** The first day invoices are made out to the new NIF. */
  newTaxIdFrom?: Date | string | null;
}

const day = (value: Date | string) => (typeof value === 'string' ? value : value.toISOString()).slice(0, 10);

/** Every NIF the restaurant has traded under: an invoice to any of them is to us. */
export function ourNifs(r: RestaurantNifs): string[] {
  return [...new Set([r.taxId, r.newTaxId].filter((n): n is string => !!n))];
}

/** The NIF an invoice dated `date` should be made out to. */
export function nifOn(r: RestaurantNifs, date: Date | string): string | null {
  if (r.newTaxId && r.newTaxIdFrom && day(date) >= day(r.newTaxIdFrom)) return r.newTaxId;
  return r.taxId;
}

export type NifChangeResult =
  | { ok: true; newTaxId: string | null; newTaxIdFrom: Date | null }
  | { ok: false; error: string };

/**
 * Checks the change as typed in Settings. Turning it off clears both fields;
 * on, it needs a valid NIF other than the current one and the day it starts.
 */
export function validateNifChange(input: {
  changed: boolean;
  taxId: string | null;
  newTaxId: string;
  from: string;
}): NifChangeResult {
  if (!input.changed) return { ok: true, newTaxId: null, newTaxIdFrom: null };
  const nif = input.newTaxId.replace(/\D/g, '');
  if (!isValidNif(nif)) return { ok: false, error: 'settings.nifChange.invalid' };
  if (input.taxId && nif === input.taxId.replace(/\D/g, '')) return { ok: false, error: 'settings.nifChange.same' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.from) || Number.isNaN(Date.parse(input.from))) {
    return { ok: false, error: 'settings.nifChange.dateMissing' };
  }
  return { ok: true, newTaxId: nif, newTaxIdFrom: new Date(`${input.from}T00:00:00.000Z`) };
}
