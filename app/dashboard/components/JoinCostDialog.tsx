'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { mergeIntoInvoice } from '../payment-actions';
import { useLanguage } from '@/lib/language-context';
import { formatMoney } from '@/lib/format';
import Dialog from './Dialog';

/**
 * Confirming that a cost is an invoice already on file, before joining them.
 *
 * Both are shown side by side, because the owner is being asked to make money
 * leave the accounts and should see what goes and what stays. The old one is
 * archived, not erased.
 */
export default function JoinCostDialog({
  cost,
  invoice,
  onClose,
  onJoined,
}: {
  cost: { id: string; dateKey?: string | null; amount: number; description: string | null };
  invoice: {
    id: string;
    invoiceNumber: string | null;
    vendorName?: string | null;
    dateKey?: string | null;
    amount?: number | null;
  };
  onClose: () => void;
  onJoined: () => void;
}) {
  const { t, language } = useLanguage();
  const locale = language === 'pt' ? 'pt-PT' : 'en-GB';
  const [busy, setBusy] = useState(false);

  const date = (key: string) =>
    new Date(`${key}T00:00:00Z`).toLocaleDateString(locale, {
      day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC',
    });

  const join = async () => {
    setBusy(true);
    const result = await mergeIntoInvoice({ duplicateId: cost.id, invoiceId: invoice.id });
    setBusy(false);
    if ('error' in result) {
      toast.error(t(result.error ?? 'errors.write'));
      return;
    }
    toast.success(t('payments.joined'));
    onJoined();
  };

  return (
    <Dialog title={t('payments.joinTitle')} onClose={onClose}>
      <p className="text-sm text-muted-foreground mb-4">{t('payments.joinBody')}</p>

      <dl className="space-y-3 text-sm">
        <div className="rounded-xl border border-border-subtle bg-surface p-3">
          <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
            {t('payments.joinGoes')}
          </dt>
          <dd className="text-foreground">
            {cost.dateKey && <span className="tabular-nums">{date(cost.dateKey)} · </span>}
            <span className="font-semibold tabular-nums">{formatMoney(cost.amount, { decimals: 2 })}</span>
            {cost.description && (
              <span className="block mt-0.5 text-xs text-muted-foreground [overflow-wrap:anywhere] line-clamp-3">
                {cost.description}
              </span>
            )}
          </dd>
        </div>
        <div className="rounded-xl border border-primary/40 bg-primary-subtle/40 p-3">
          <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
            {t('payments.joinStays')}
          </dt>
          <dd className="text-foreground">
            <span className="font-semibold [overflow-wrap:anywhere]">
              {invoice.invoiceNumber ?? t('payments.duplicateNoNumber')}
            </span>
            {invoice.vendorName && <span className="text-muted-foreground"> · {invoice.vendorName}</span>}
            {(invoice.dateKey || invoice.amount != null) && (
              <span className="block mt-0.5 text-xs text-muted-foreground tabular-nums">
                {[
                  invoice.dateKey ? date(invoice.dateKey) : null,
                  invoice.amount != null ? formatMoney(invoice.amount, { decimals: 2 }) : null,
                ].filter(Boolean).join(' · ')}
              </span>
            )}
          </dd>
        </div>
      </dl>

      <p className="mt-4 text-xs text-muted-foreground">{t('payments.joinNote')}</p>

      <div className="mt-5 flex items-center gap-2">
        <button type="button" onClick={join} disabled={busy} className="cta-button !py-2 !px-4 !text-sm">
          {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
          {t('payments.joinConfirm')}
        </button>
        <button type="button" onClick={onClose} className="cta-button-secondary !py-2 !px-4 !text-sm">
          {t('common.cancel')}
        </button>
      </div>
    </Dialog>
  );
}
