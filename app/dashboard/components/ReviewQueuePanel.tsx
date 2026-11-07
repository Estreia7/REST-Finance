'use client';

import { useCallback, useEffect, useState } from 'react';
import { Copy, FileText } from 'lucide-react';
import { useLanguage } from '@/lib/language-context';
import CardDeckCarousel from '@/components/ui/card-deck-carousel';
import { getInvoicesToReview, type InvoiceToReview } from '../invoice-email-actions';
import CompareCopies from './CompareCopies';
import ReceiptScanner from './ReceiptScanner';
import ZoomableImage from './ZoomableImage';

/**
 * Invoices photographed in a hurry that the app would not vouch for, as a pile:
 * the one on top is the one being dealt with, and throwing it leaves it for later.
 * Nothing here has reached the books: confirming it is what saves it.
 *
 * The photograph is shown because this is where someone actually looks at it:
 * what the app was sure of never gets here.
 */

/** Who the invoice is from, read off what is stored with it. */
function vendorOf(item: InvoiceToReview): string | null {
  const data = item.data as { vendor?: string; checks?: { knownVendor?: string | null } } | null;
  return data?.checks?.knownVendor ?? data?.vendor ?? null;
}

export default function ReviewQueuePanel({ onChanged }: { onChanged: () => void }) {
  const { t } = useLanguage();
  const [items, setItems] = useState<InvoiceToReview[] | null>(null);
  const [index, setIndex] = useState(0);
  /** Figures are being typed beside the pages: nothing may be thrown away now. */
  const [busy, setBusy] = useState(false);
  /** Starts the scanner afresh: a failed new photo brings back the same invoice. */
  const [round, setRound] = useState(0);
  const [comparing, setComparing] = useState(false);

  const load = useCallback(() => {
    getInvoicesToReview().then((result) => setItems(result.success ? result.data : []));
  }, []);
  useEffect(() => { load(); }, [load]);

  if (!items || items.length === 0) return null;

  const current = Math.min(index, items.length - 1);
  const item = items[current];
  const done = () => { setBusy(false); setRound((r) => r + 1); load(); onChanged(); };
  const position = t('paymentCard.position').replace('{current}', String(current + 1)).replace('{total}', String(items.length));

  const card = (i: number, isTop: boolean) => {
    const [first] = items[i].pages;
    const src = `/api/images/${first}`;
    if (!first) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-3 bg-card p-6 text-center">
          <FileText className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
          <span className="text-sm font-semibold text-foreground [overflow-wrap:anywhere]">
            {vendorOf(items[i]) ?? t('paymentCard.noVendor')}
          </span>
        </div>
      );
    }
    return isTop
      ? <ZoomableImage key={src} fill src={src} alt={t('scanIssues.pictureAlt')} className="h-full w-full object-contain" />
      // eslint-disable-next-line @next/next/no-img-element -- an authenticated file, not a static asset
      : <img src={src} alt="" className="h-full w-full object-contain" />;
  };

  return (
    <div className={`grid items-start gap-4 ${busy ? 'lg:grid-cols-[2fr_3fr]' : 'lg:grid-cols-2'}`}>
      {/* While correcting, the page comes first even on a phone: it is what is being copied. */}
      <div className={`min-w-0 space-y-3 ${busy ? '' : 'order-2 lg:order-1'}`}>
        {busy ? (
          item.pages.map((path) => (
            <ZoomableImage
              key={path}
              src={`/api/images/${path}`}
              alt={t('scanIssues.pictureAlt')}
              className="w-full rounded-xl border border-border-subtle"
            />
          ))
        ) : (
          <>
            <CardDeckCarousel
              count={items.length}
              index={current}
              onIndexChange={setIndex}
              renderCard={card}
              label={t('inbox.reviewCards')}
              position={position}
              previousLabel={t('scanIssues.previous')}
              nextLabel={t('lineSetup.later')}
            />
            {item.pages.length > 1 && (
              <div className="mx-auto grid max-w-sm grid-cols-3 gap-2">
                {item.pages.slice(1).map((path) => (
                  <ZoomableImage
                    key={path}
                    src={`/api/images/${path}`}
                    alt={t('scanIssues.pictureAlt')}
                    className="w-full rounded-lg border border-border-subtle"
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
      <div className={`min-w-0 ${busy ? '' : 'order-1 lg:order-2'}`}>
        {item.copies && !busy && (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border-subtle bg-muted px-3 py-2.5">
            <p className="flex items-center gap-2 text-sm text-foreground">
              <Copy className="w-4 h-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              {t('compareCopies.banner').replace('{n}', String(item.copies.length))}
            </p>
            <button type="button" onClick={() => setComparing(true)} className="cta-button-secondary !py-1.5 !px-3 !text-xs">
              {t('compareCopies.compare')}
            </button>
          </div>
        )}
        <ReceiptScanner
          key={`${item.id}-${round}`}
          defaultScanType="COST_RECEIPT"
          initialScan={{ scanId: item.id, data: item.data, pages: item.pages }}
          onSaved={done}
          onFinished={done}
          onBusy={setBusy}
          onCorrected={load}
        />
      </div>
      {comparing && item.copies && (
        <CompareCopies
          copies={item.copies}
          onKept={() => { setComparing(false); done(); }}
          onClose={() => setComparing(false)}
        />
      )}
    </div>
  );
}
