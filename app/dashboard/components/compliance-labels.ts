import type { ComplianceStatus } from '@/lib/compliance';

/**
 * Labels for the compliance vault, as translation keys.
 *
 * Shared between the table and the summary so a document type is never named
 * two different ways on the same screen.
 *
 * This is a plain module, not a component, so it cannot call `useLanguage()` —
 * a hook only works inside React. Rather than move the maps into every caller,
 * they export translation KEYS and each component resolves them with its own
 * `t()`. That keeps the single source of truth for "what a document type is
 * called" while leaving the choice of language to render time, which is where
 * it belongs. The keys on the left are the database enum values and are never
 * translated.
 */

export const TYPE_LABEL_KEYS: Record<string, string> = {
  INSURANCE: 'compliance.type.insurance',
  HACCP: 'compliance.type.haccp',
  FIRE_SAFETY: 'compliance.type.fireSafety',
  ASAE_LICENCE: 'compliance.type.asaeLicence',
  HYGIENE_CERT: 'compliance.type.hygieneCert',
  WASTE_CONTRACT: 'compliance.type.wasteContract',
  PEST_CONTROL: 'compliance.type.pestControl',
  OTHER: 'compliance.type.other',
};

/**
 * The indicator colours.
 *
 * `dot` is the lamp itself and `text` the wording beside it, because colour
 * alone cannot carry the meaning for anyone who does not see red and green
 * apart. Every row states its status in words as well.
 */
export const STATUS_STYLE: Record<
  ComplianceStatus,
  { dot: string; glow: string; text: string; labelKey: string }
> = {
  expired: {
    dot: 'bg-lamp-danger',
    glow: 'shadow-[0_0_0_3px_hsl(var(--lamp-danger)/0.18)]',
    text: 'text-danger',
    labelKey: 'compliance.status.expired',
  },
  expiring: {
    dot: 'bg-lamp-warning',
    glow: 'shadow-[0_0_0_3px_hsl(var(--lamp-warning)/0.18)]',
    text: 'text-warning',
    labelKey: 'compliance.status.expiring',
  },
  valid: {
    dot: 'bg-lamp-success',
    glow: '',
    text: 'text-success',
    labelKey: 'compliance.status.valid',
  },
  no_expiry: {
    dot: 'bg-muted-foreground/35',
    glow: '',
    text: 'text-muted-foreground',
    labelKey: 'compliance.status.noExpiry',
  },
};

/** Renewal cadences, as keys. The values are the database enum. */
export const RENEWAL_LABEL_KEYS: Record<string, string> = {
  NONE: 'compliance.renewal.none',
  MONTHLY: 'compliance.renewal.monthly',
  ANNUAL: 'compliance.renewal.annual',
};
