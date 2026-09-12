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
  { dot: string; text: string; label: string }
> = {
  expired: { dot: 'bg-danger', text: 'text-danger', label: 'Expirado' },
  expiring: { dot: 'bg-warning', text: 'text-warning', label: 'A expirar' },
  valid: { dot: 'bg-success', text: 'text-success', label: 'Válido' },
  no_expiry: { dot: 'bg-muted-foreground/40', text: 'text-muted-foreground', label: 'Sem validade' },
};
