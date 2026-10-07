'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { X, Loader2, Trash2, FileText, AlertTriangle } from 'lucide-react';
import { getInvoiceImage, deleteInvoice } from '../accounting-actions';
import { useLanguage } from '@/lib/language-context';

/**
 * The photograph behind a figure.
 *
 * Every number in this product is read off a page by a model that is right
 * most of the time. Being able to put the page back on screen is what turns
 * a figure from something to trust into something to check — and an owner
 * who can check it will believe the rest.
 *
 * Opened from anywhere a document number appears: a line in Accounting, a
 * price in an ingredient's history. Same picture, same two things to do with
 * it, so it lives in one component rather than in each.
 */

export default function InvoicePreview({
  invoiceNumber,
  onClose,
  onDeleted,
  startConfirmingDelete = false,
}: {
  invoiceNumber: string;
  onClose: () => void;
  /** Called after the invoice and its figures have been removed. */
  onDeleted?: () => void;
  /**
   * Opens with the delete warning already showing. Set when the owner
   * came by the bin on an invoice row: they have said what they want, but
   * what deleting takes with it still has to be read before it happens.
   */
  startConfirmingDelete?: boolean;
}) {
  const { t } = useLanguage();
  const [image, setImage] = useState<{ imagePath: string; scannedAt: string } | null | 'loading'>('loading');
  const [confirming, setConfirming] = useState(startConfirmingDelete);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getInvoiceImage(invoiceNumber).then((result) => {
      if (cancelled) return;
      setImage('data' in result && result.data ? result.data : null);
    });
    return () => { cancelled = true; };
  }, [invoiceNumber]);

  // Escape closes, as it does everywhere else a layer opens over the page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const remove = async () => {
    setBusy(true);
    const result = await deleteInvoice(invoiceNumber);
    setBusy(false);
    if ('error' in result) {
      toast.error(t('errors.delete'));
      return;
    }
    toast.success(
      t('accounting.invoiceDeleted')
        .replace('{lines}', String(result.data.lines))
        .replace('{repriced}', String(result.data.repriced)),
    );
    onDeleted?.();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={t('accounting.previewTitle')}
    >
      <div
        // The backdrop closes; the sheet itself must not.
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-2xl max-h-[92dvh] flex flex-col bg-card border border-border
                   rounded-t-2xl sm:rounded-2xl shadow-modal"
      >
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border-subtle">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-foreground truncate">{invoiceNumber}</h3>
            {image !== 'loading' && image && (
              <p className="text-[11px] text-muted-foreground">
                {t('accounting.scannedOn')}{' '}
                {new Date(image.scannedAt).toLocaleDateString()}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted
                       transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-5">
          {image === 'loading' ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" aria-label={t('common.loading')} />
            </div>
          ) : image === null ? (
            // An invoice entered before photographs were kept, or one typed
            // in by hand. Said plainly rather than shown as a broken image.
            <div className="text-center py-12">
              <FileText className="w-8 h-8 mx-auto text-muted-foreground/40 mb-3" aria-hidden="true" />
              <p className="text-sm text-foreground">{t('accounting.noImageTitle')}</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">
                {t('accounting.noImageBody')}
              </p>
            </div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- served by
            // an authenticated route, which next/image cannot fetch.
            <img
              src={`/api/images/${image.imagePath}`}
              alt={t('accounting.previewTitle')}
              className="w-full rounded-xl border border-border-subtle bg-black/20"
            />
          )}
        </div>

        <div className="px-5 py-4 border-t border-border-subtle">
          {confirming ? (
            <div className="space-y-3">
              {/* Spelled out, because this does more than remove a picture:
                  the cost leaves the P&L and any ingredient priced from it
                  falls back to the invoice before. */}
              <p className="flex items-start gap-2 text-xs text-warning">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-px" aria-hidden="true" />
                <span>{t('accounting.deleteWarning')}</span>
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={remove}
                  disabled={busy}
                  className="cta-button !py-2 !px-4 !text-sm !bg-danger"
                >
                  {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
                  {t('accounting.deleteConfirm')}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="cta-button-secondary !py-2 !px-4 !text-sm"
                >
                  {t('common.cancel')}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-danger
                         hover:underline underline-offset-2 focus-visible:outline-none
                         focus-visible:ring-2 focus-visible:ring-ring rounded"
            >
              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
              {t('accounting.deleteInvoice')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
