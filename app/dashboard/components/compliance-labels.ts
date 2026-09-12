import type { ComplianceStatus } from '@/lib/compliance';

/**
 * Portuguese labels for the compliance vault.
 *
 * Shared between the table and the summary so a document type is never named
 * two different ways on the same screen.
 */

export const TYPE_LABELS: Record<string, string> = {
  INSURANCE: 'Seguro',
  HACCP: 'HACCP',
  FIRE_SAFETY: 'Segurança contra incêndios',
  ASAE_LICENCE: 'Licença / ASAE',
  HYGIENE_CERT: 'Higiene alimentar',
  WASTE_CONTRACT: 'Recolha de resíduos',
  PEST_CONTROL: 'Controlo de pragas',
  OTHER: 'Outro',
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
  { dot: string; glow: string; text: string; label: string }
> = {
  expired: {
    dot: 'bg-lamp-danger',
    glow: 'shadow-[0_0_0_3px_hsl(var(--lamp-danger)/0.18)]',
    text: 'text-danger',
    label: 'Expirado',
  },
  expiring: {
    dot: 'bg-lamp-warning',
    glow: 'shadow-[0_0_0_3px_hsl(var(--lamp-warning)/0.18)]',
    text: 'text-warning',
    label: 'A expirar',
  },
  valid: {
    dot: 'bg-lamp-success',
    glow: '',
    text: 'text-success',
    label: 'Válido',
  },
  no_expiry: {
    dot: 'bg-muted-foreground/35',
    glow: '',
    text: 'text-muted-foreground',
    label: 'Sem validade',
  },
};
