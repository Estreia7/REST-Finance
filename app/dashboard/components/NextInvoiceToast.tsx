'use client';

import { AlertTriangle, Camera, Check, Loader2 } from 'lucide-react';
import { useLanguage } from '@/lib/language-context';
import type { ScanOutcome } from '@/lib/scan-outcome';

/**
 * What came of the invoice, and whether there is another.
 *
 * Drawn here rather than through the toast library, because its "Sim" has to be
 * a real tap on a real button: a phone only opens its camera from inside one.
 * "Sim" works while the invoice is still being read, since a pile of invoices
 * should not wait on each other. "Não" waits, so nobody leaves without the answer.
 */
export default function NextInvoiceToast({ outcome, leaving, onMore, onDone }: {
  outcome: ScanOutcome;
  leaving: boolean;
  onMore: () => void;
  onDone: () => void;
}) {
  const { t } = useLanguage();
  const good = outcome === 'saved' || outcome === 'already';

  return (
    <div
      role="status"
      className="fixed inset-x-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-[45] rounded-2xl border border-border bg-card p-4 shadow-lg"
    >
      <p className={`flex items-start gap-2 text-sm font-semibold ${
        good ? 'text-success' : outcome === 'reading' ? 'text-foreground' : 'text-warning'}`}
      >
        {outcome === 'reading' && <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />}
        {good && <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />}
        {!good && outcome !== 'reading' && <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />}
        {t(`scanner.outcome.${outcome}`)}
      </p>
      <p className="mt-3 text-sm text-foreground">{t('scanner.addMore')}</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button type="button" onClick={onMore} disabled={leaving} className="cta-button min-h-[44px] !px-3 !py-2 disabled:opacity-50">
          <Camera className="h-4 w-4" aria-hidden="true" />
          {t('scanner.addMoreYes')}
        </button>
        <button type="button" onClick={onDone} disabled={leaving} className="cta-button-secondary min-h-[44px] !px-3 !py-2 disabled:opacity-50">
          {leaving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          {t('scanner.addMoreNo')}
        </button>
      </div>
    </div>
  );
}
