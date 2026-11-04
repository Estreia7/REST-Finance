'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { useLanguage } from '@/lib/language-context';
import { getInvoicesToConfirm } from '../invoice-proof-actions';
import InvoiceProofEditor from './InvoiceProofEditor';

type Waiting = Array<{ invoiceNumber: string; vendorName: string | null; gap: number }>;

/** The invoices that did not add up, one at a time. */
export default function InvoiceProofPanel() {
  const { t } = useLanguage();
  const [waiting, setWaiting] = useState<Waiting | null>(null);
  const [failed, setFailed] = useState(false);
  const [index, setIndex] = useState(0);

  const load = useCallback(() => {
    getInvoicesToConfirm().then((result) => {
      if ('error' in result) setFailed(true);
      else setWaiting(result.data);
    });
  }, []);

  useEffect(() => { load(); }, [load]);

  if (failed) return <p className="text-sm text-muted-foreground">{t('proof.failed')}</p>;
  if (!waiting) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        {t('common.loading')}
      </div>
    );
  }
  if (waiting.length === 0) {
    return (
      <div className="card-glass flex flex-col items-center px-6 py-14 text-center">
        <CheckCircle2 className="h-10 w-10 text-success" aria-hidden="true" />
        <p className="mt-4 text-base font-semibold text-foreground">{t('proof.emptyTitle')}</p>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">{t('proof.emptyBody')}</p>
      </div>
    );
  }

  const current = Math.min(index, waiting.length - 1);
  return (
    <div className="space-y-3">
      <p className="px-1 text-sm text-muted-foreground">
        {t('proof.lead')}{' '}
        <span className="text-xs tabular-nums">
          {t('proof.progress').replace('{current}', String(current + 1)).replace('{total}', String(waiting.length))}
        </span>
      </p>
      <div className="card-glass p-5 sm:p-6">
        <InvoiceProofEditor
          key={waiting[current].invoiceNumber}
          invoiceNumber={waiting[current].invoiceNumber}
          onDone={load}
          onLater={waiting.length > 1 ? () => setIndex((current + 1) % waiting.length) : undefined}
        />
      </div>
    </div>
  );
}
