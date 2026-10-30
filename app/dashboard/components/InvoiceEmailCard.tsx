'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Mail, Copy, RefreshCw, Loader2 } from 'lucide-react';
import { useLanguage } from '@/lib/language-context';
import { translateError } from '@/lib/error-messages';
import { getInvoiceEmail, createInvoiceEmail } from '../invoice-email-actions';

/**
 * Settings › Restaurante: the restaurant's invoice email address.
 *
 * Suppliers copy their invoices to it and they arrive read, waiting in
 * Despesas › Digitalizar. Hidden until the server is set up for it.
 */
export default function InvoiceEmailCard() {
  const { t, language } = useLanguage();
  const [state, setState] = useState<{ enabled: boolean; address: string | null } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getInvoiceEmail().then((r) => { if (r.success) setState(r.data); });
  }, []);

  if (!state?.enabled) return null;

  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); toast.success(t('invoiceEmail.copied')); } catch { /* nothing to do */ }
  };

  const create = async (replacing: boolean) => {
    if (replacing && !window.confirm(t('invoiceEmail.replaceConfirm'))) return;
    setBusy(true);
    const r = await createInvoiceEmail();
    setBusy(false);
    if (!r.success) return toast.error(translateError(language, r.error));
    setState({ enabled: true, address: r.data.address });
  };

  const message = state.address ? t('invoiceEmail.supplierMessage').replace('{address}', state.address) : '';

  return (
    <div className="card-glass p-6">
      <div className="flex items-center gap-2 mb-1">
        <Mail className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
        <h2 className="text-lg font-bold text-foreground">{t('invoiceEmail.title')}</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-5">{t('invoiceEmail.lead')}</p>

      {!state.address ? (
        <button type="button" className="cta-button py-2 px-5 text-sm" disabled={busy} onClick={() => create(false)}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Mail className="h-4 w-4" aria-hidden="true" />}
          {t('invoiceEmail.create')}
        </button>
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface px-4 py-3">
            <span className="min-w-0 flex-1 break-all font-mono text-sm text-foreground">{state.address}</span>
            <button type="button" onClick={() => copy(state.address!)} className="cta-button-secondary !py-1.5 !px-3 !text-xs">
              <Copy className="h-3.5 w-3.5" aria-hidden="true" />{t('invoiceEmail.copy')}
            </button>
          </div>

          <div>
            <p className="text-xs font-semibold text-foreground">{t('invoiceEmail.suppliersTitle')}</p>
            <p className="mt-1 rounded-lg bg-muted px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">{message}</p>
            <button type="button" onClick={() => copy(message)} className="mt-1.5 text-xs font-medium text-primary-ink hover:underline">
              {t('invoiceEmail.copyMessage')}
            </button>
          </div>

          <div>
            <p className="text-xs font-semibold text-foreground">{t('invoiceEmail.forwardTitle')}</p>
            <ol className="mt-1.5 list-decimal space-y-1 pl-5 text-xs leading-relaxed text-muted-foreground">
              <li>{t('invoiceEmail.forwardStep1')}</li>
              <li>{t('invoiceEmail.forwardStep2')}</li>
              <li>{t('invoiceEmail.forwardStep3')}</li>
            </ol>
          </div>

          <p className="text-[11px] text-muted-foreground">{t('invoiceEmail.limits')}</p>

          <button type="button" onClick={() => create(true)} disabled={busy} className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />{t('invoiceEmail.replace')}
          </button>
        </div>
      )}
    </div>
  );
}
