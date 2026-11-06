'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLanguage } from '@/lib/language-context';
import { getInvoicesToReview, type InvoiceToReview } from '../invoice-email-actions';
import ReceiptScanner from './ReceiptScanner';
import ZoomableImage from './ZoomableImage';

/**
 * Invoices photographed in a hurry that the app would not vouch for, one at a
 * time. Nothing here has reached the books: confirming it is what saves it.
 *
 * The photograph is shown because this is where someone actually looks at it:
 * what the app was sure of never gets here.
 */
export default function ReviewQueuePanel({ onChanged }: { onChanged: () => void }) {
  const { t } = useLanguage();
  const [items, setItems] = useState<InvoiceToReview[] | null>(null);
  const [index, setIndex] = useState(0);

  const load = useCallback(() => {
    getInvoicesToReview().then((result) => setItems(result.success ? result.data : []));
  }, []);
  useEffect(() => { load(); }, [load]);

  if (!items || items.length === 0) return null;

  const current = Math.min(index, items.length - 1);
  const item = items[current];
  const done = () => { load(); onChanged(); };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 px-1">
        <p className="text-xs font-medium text-muted-foreground tabular-nums">
          {t('paymentCard.position').replace('{current}', String(current + 1)).replace('{total}', String(items.length))}
        </p>
        {items.length > 1 && (
          <button
            type="button"
            onClick={() => setIndex((current + 1) % items.length)}
            className="text-xs font-semibold text-muted-foreground hover:text-foreground underline"
          >
            {t('lineSetup.later')}
          </button>
        )}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {item.pages.length > 0 && (
          <div className="space-y-3 min-w-0">
            {item.pages.map((path) => (
              <ZoomableImage
                key={path}
                src={`/api/images/${path}`}
                alt={t('scanIssues.pictureAlt')}
                className="w-full rounded-xl border border-border-subtle"
              />
            ))}
          </div>
        )}
        <div className="min-w-0">
          <ReceiptScanner
            key={item.id}
            defaultScanType="COST_RECEIPT"
            initialScan={{ scanId: item.id, data: item.data, pages: item.pages }}
            onSaved={done}
            onFinished={done}
          />
        </div>
      </div>
    </div>
  );
}
