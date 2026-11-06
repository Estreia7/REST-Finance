'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { useLanguage } from '@/lib/language-context';
import { formatMoney } from '@/lib/format';
import type { VendorSummary } from '@/lib/vendor-summary';
import { getInvoices, getVendorSummary, type InvoiceRow2 } from '../accounting-actions';
import Dialog from './Dialog';
import InvoicePreview from './InvoicePreview';

/** Enough pages of the invoice list for any one supplier. */
const ALL_PAGES = 50;

/** One supplier: what has been spent with it, and every invoice from it. */
export default function VendorDialog({ vendorId, vendorName, onClose }: {
  vendorId: string;
  vendorName: string;
  onClose: () => void;
}) {
  const { t, language } = useLanguage();
  const locale = language === 'pt' ? 'pt-PT' : 'en-GB';
  const [summary, setSummary] = useState<VendorSummary | null>(null);
  const [invoices, setInvoices] = useState<InvoiceRow2[] | null>(null);
  const [previewing, setPreviewing] = useState<string | null>(null);

  useEffect(() => {
    let stale = false;
    getVendorSummary(vendorId).then((result) => {
      if (!stale && 'data' in result && result.data) setSummary(result.data);
    });
    getInvoices({ vendorId, page: ALL_PAGES }).then((result) => {
      if (!stale) setInvoices('data' in result && result.data ? result.data.invoices : []);
    });
    return () => { stale = true; };
  }, [vendorId]);

  const date = (key: string | null) => (key ? new Date(`${key}T00:00:00Z`).toLocaleDateString(locale, { timeZone: 'UTC' }) : '—');
  const figures = summary
    ? [
        [t('accounting.vendorMonth'), formatMoney(summary.month)],
        [t('accounting.vendorYear'), formatMoney(summary.year)],
        [t('accounting.vendorInvoices'), String(summary.invoices)],
        [t('accounting.vendorAverage'), formatMoney(summary.average)],
        [t('accounting.vendorUnpaid'), formatMoney(summary.unpaid)],
        [t('accounting.vendorLast'), date(summary.lastPurchase)],
      ]
    : [];

  return (
    <Dialog wide onClose={onClose} title={vendorName}>
      {!summary || !invoices ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          {t('common.loading')}
        </div>
      ) : (
        <div className="space-y-5">
          <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {figures.map(([label, value]) => (
              <div key={label} className="rounded-xl bg-muted/60 px-3 py-2">
                <dt className="text-[11px] text-muted-foreground">{label}</dt>
                <dd className="mt-0.5 text-sm font-bold text-foreground tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>

          {invoices.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t('accounting.vendorEmpty')}</p>
          ) : (
            <ul className="divide-y divide-border-subtle">
              {invoices.map((invoice, i) => {
                const number = invoice.invoiceNumber;
                return (
                  <li key={number ?? i}>
                    <button
                      type="button"
                      onClick={() => number && setPreviewing(number)}
                      disabled={!number}
                      className="w-full flex items-center justify-between gap-3 py-2.5 px-2 rounded-lg text-left hover:bg-muted/50 disabled:hover:bg-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                    >
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-foreground [overflow-wrap:anywhere]">
                          {number ?? t('accounting.noNumber')}
                        </span>
                        <span className="block text-[11px] text-muted-foreground tabular-nums">
                          {date(invoice.date)}
                          {' · '}
                          {t('accounting.lineCount').replace('{n}', String(invoice.lineCount))}
                        </span>
                        {invoice.mismatch && (
                          <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-danger/10 px-2 py-0.5 text-[11px] font-semibold text-danger">
                            <AlertTriangle className="w-3 h-3" aria-hidden="true" />
                            {t('accounting.doesNotMatch')}
                          </span>
                        )}
                        {invoice.certain && (
                          <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-semibold text-success">
                            <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
                            {t('accounting.fullyProved')}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 text-right tabular-nums">
                        {invoice.gross !== null && (
                          <span className="block text-sm font-bold text-foreground">{formatMoney(invoice.gross)}</span>
                        )}
                        <span className="block text-[11px] text-muted-foreground">
                          {t('accounting.withoutVat')} {formatMoney(invoice.total)}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
      {previewing && <InvoicePreview invoiceNumber={previewing} onClose={() => setPreviewing(null)} />}
    </Dialog>
  );
}
