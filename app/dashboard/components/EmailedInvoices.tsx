'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Mail, FileText, Copy, ArrowLeft } from 'lucide-react';
import { useLanguage } from '@/lib/language-context';
import { translateError } from '@/lib/error-messages';
import { formatMoneyExact } from '@/lib/format';
import ReceiptScanner from './ReceiptScanner';
import {
  getEmailedInvoices, dismissEmailedInvoice, getInvoiceEmail, type EmailedInvoice,
} from '../invoice-email-actions';

/**
 * Invoices that arrived at the restaurant's email address, already read and
 * waiting to be checked. Opening one shows the scanner's own review, so a
 * supplier's emailed PDF is confirmed exactly like a photographed invoice.
 *
 * Wraps the page's own scanner: shown below the list, and hidden while an
 * emailed invoice is open. With nothing waiting only the address line shows,
 * and with the feature switched off only the scanner.
 */
export default function EmailedInvoices({ onSaved, children }: {
  onSaved?: () => void;
  /** The page's own scanner: hidden while an emailed invoice is open, so there is one at a time. */
  children?: React.ReactNode;
}) {
  const { t, language } = useLanguage();
  const [items, setItems] = useState<EmailedInvoice[] | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [open, setOpen] = useState<EmailedInvoice | null>(null);

  const load = useCallback(async () => {
    const [list, mail] = await Promise.all([getEmailedInvoices(), getInvoiceEmail()]);
    if (list.success) setItems(list.data);
    if (mail.success) setAddress(mail.data.address);
  }, []);
  useEffect(() => { load(); }, [load]);

  if (open) {
    return (
      <div className="space-y-3">
        <button type="button" onClick={() => setOpen(null)} className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />{t('emailedInvoices.back')}
        </button>
        <ReceiptScanner
          defaultScanType="COST_RECEIPT"
          initialScan={{ scanId: open.id, data: open.data }}
          onSaved={() => { load(); onSaved?.(); }}
          onFinished={() => { setOpen(null); load(); }}
        />
      </div>
    );
  }

  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); toast.success(t('invoiceEmail.copied')); } catch { /* nothing to do */ }
  };

  if (!items || (items.length === 0 && !address)) return <>{children}</>;

  return (
    <div className="space-y-3">
      {items.length > 0 && (
        <section className="card-glass overflow-hidden" aria-labelledby="emailed-title">
          <div className="flex items-center gap-2 border-b border-border px-5 py-3.5">
            <Mail className="h-4 w-4 text-primary-ink" aria-hidden="true" />
            <h2 id="emailed-title" className="text-sm font-semibold text-foreground">
              {t(items.length === 1 ? 'emailedInvoices.titleOne' : 'emailedInvoices.titleOther').replace('{count}', String(items.length))}
            </h2>
          </div>
          <ul className="divide-y divide-border">
            {items.map((inv) => (
              <li key={inv.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">
                    {inv.vendor || inv.fileName || t('emailedInvoices.unnamed')}
                    {inv.invoiceNumber ? <span className="text-muted-foreground"> · {inv.invoiceNumber}</span> : null}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {t('emailedInvoices.from').replace('{from}', inv.fromEmail || '—')}
                    {' · '}
                    {new Date(inv.receivedAt).toLocaleDateString(language === 'pt' ? 'pt-PT' : 'en-GB', { day: '2-digit', month: 'short' })}
                  </span>
                </span>
                {inv.total !== null && <span className="text-sm font-semibold tabular-nums text-foreground">{formatMoneyExact(inv.total)}</span>}
                <span className="flex items-center gap-3">
                  {inv.filePath && (
                    <a href={`/api/images/${inv.filePath}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
                      <FileText className="h-3.5 w-3.5" aria-hidden="true" />{t('emailedInvoices.view')}
                    </a>
                  )}
                  <button
                    type="button"
                    className="text-xs font-medium text-muted-foreground hover:text-foreground"
                    onClick={async () => {
                      const r = await dismissEmailedInvoice(inv.id);
                      if (!r.success) toast.error(translateError(language, r.error));
                      else load();
                    }}
                  >
                    {t('emailedInvoices.dismiss')}
                  </button>
                  <button type="button" className="cta-button !py-1.5 !px-3 !text-xs" onClick={() => setOpen(inv)}>
                    {t('emailedInvoices.review')}
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {address && (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 px-1 text-xs text-muted-foreground">
          <Mail className="h-3.5 w-3.5" aria-hidden="true" />
          {t('emailedInvoices.forwardTo')}
          <span className="font-medium text-foreground">{address}</span>
          <button type="button" onClick={() => copy(address)} className="inline-flex items-center gap-1 font-medium text-primary-ink hover:underline">
            <Copy className="h-3 w-3" aria-hidden="true" />{t('invoiceEmail.copy')}
          </button>
        </p>
      )}
      {children}
    </div>
  );
}
