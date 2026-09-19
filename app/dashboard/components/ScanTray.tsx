'use client';

import { useCallback, useMemo, useState } from 'react';
import { Check, FilePlus2, Files, Layers, Trash2, X } from 'lucide-react';
import { useLanguage } from '@/lib/language-context';

/**
 * The tray that holds what has been photographed so far.
 *
 * An owner clearing the end of service does not scan one thing. They have five
 * supplier invoices and a till report in a pile, and one of those invoices runs
 * to three pages. So the tray is a list of *documents*, each an ordered list of
 * *pages* — not a flat list of photographs someone has to sort out afterwards.
 *
 * Everything here turns on one decision, made once per page: does this page
 * belong to the invoice I am already holding, or is it the start of the next
 * one? Get that wrong and three invoices arrive as one nine-page document. So
 * the two choices are given equal weight, side by side, in different words,
 * with different icons — never a primary action and a smaller "or…" beneath it,
 * which is the shape that gets tapped without reading.
 */

/** A finished document: its pages in order, as JPEG data URLs. */
export interface ScannedDocument {
  id: string;
  pages: string[];
}

/** A page as the editor hands it over. */
export interface ScanTrayPage {
  dataUrl: string;
  thumbnail: string;
}

export interface ScanTrayProps {
  /** Pages of the document currently being built, oldest first. */
  currentPages: ScanTrayPage[];
  /** Documents already closed off. */
  documents: ScannedDocument[];
  /** Photograph another page for the document being built. */
  onAddPageToCurrent: () => void;
  /** Close the current document off and photograph the first page of the next. */
  onStartNewDocument: () => void;
  /** Drop one page from the document being built, by index. */
  onRemovePage: (index: number) => void;
  /** Drop a whole finished document. */
  onRemoveDocument: (id: string) => void;
  /** Hand everything up: the finished documents, plus the one in progress. */
  onFinish: (documents: ScannedDocument[]) => void;
  /** Abandon the whole tray. */
  onCancel: () => void;
}

/** Ids only have to be unique within one tray, so this is enough. */
export function newDocumentId(): string {
  return `doc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function ScanTray({
  currentPages,
  documents,
  onAddPageToCurrent,
  onStartNewDocument,
  onRemovePage,
  onRemoveDocument,
  onFinish,
  onCancel,
}: ScanTrayProps) {
  const { t } = useLanguage();
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);

  const totalPages = useMemo(
    () => documents.reduce((sum, doc) => sum + doc.pages.length, 0) + currentPages.length,
    [documents, currentPages],
  );

  const handleFinish = useCallback(() => {
    // The document in progress is a real document; it just has not been closed
    // off yet. Dropping it here would silently lose the last invoice scanned.
    const all = currentPages.length
      ? [...documents, { id: newDocumentId(), pages: currentPages.map((page) => page.dataUrl) }]
      : documents;
    onFinish(all);
  }, [documents, currentPages, onFinish]);

  const hasAnything = totalPages > 0;

  return (
    <div className="flex flex-col gap-4">
      {/* ── The document being built ─────────────────────────────── */}
      <section className="card-glass p-3" aria-labelledby="scan-tray-current">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3
            id="scan-tray-current"
            className="flex items-center gap-2 text-sm font-semibold text-foreground"
          >
            <Layers className="h-4 w-4 text-primary-ink" aria-hidden="true" />
            {t('scanEditor.tray.currentDocument')}
          </h3>
          <span className="text-xs text-muted-foreground">
            {currentPages.length === 1
              ? t('scanEditor.tray.onePage')
              : `${currentPages.length} ${t('scanEditor.tray.pages')}`}
          </span>
        </div>

        {currentPages.length === 0 ? (
          <p className="rounded-xl bg-muted px-3 py-4 text-center text-xs text-muted-foreground">
            {t('scanEditor.tray.emptyCurrent')}
          </p>
        ) : (
          <ul className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" aria-label={t('scanEditor.tray.pageStrip')}>
            {currentPages.map((page, index) => (
              <li key={`${index}-${page.thumbnail.length}`} className="relative shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={page.thumbnail}
                  alt={`${t('scanEditor.tray.page')} ${index + 1}`}
                  className="h-28 w-20 rounded-lg border border-border bg-muted object-cover"
                />
                <span
                  className="absolute bottom-1 left-1 rounded bg-background/85 px-1.5 py-0.5
                             text-[10px] font-semibold text-foreground"
                >
                  {index + 1}
                </span>
                <button
                  type="button"
                  onClick={() => onRemovePage(index)}
                  aria-label={`${t('scanEditor.tray.removePage')} ${index + 1}`}
                  className="absolute -right-1 -top-1 flex h-7 w-7 items-center justify-center rounded-full
                             border border-border bg-card text-muted-foreground shadow-sm
                             hover:text-danger focus-visible:outline-none focus-visible:ring-2
                             focus-visible:ring-ring"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── The one decision that matters ────────────────────────────
          Two full-width cards, stacked so neither is the "small" option on a
          narrow screen, each saying plainly what it does to the pile. */}
      <div className="grid gap-2">
        <button
          type="button"
          onClick={onAddPageToCurrent}
          className="flex min-h-[44px] items-start gap-3 rounded-xl border-2 border-primary/40 bg-primary/5
                     p-3 text-left transition-colors hover:bg-primary/10 focus-visible:outline-none
                     focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Layers className="mt-0.5 h-5 w-5 shrink-0 text-primary-ink" aria-hidden="true" />
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-foreground">
              {t('scanEditor.tray.addToSame')}
            </span>
            <span className="block text-xs text-muted-foreground">
              {t('scanEditor.tray.addToSameHint')}
            </span>
          </span>
        </button>

        <button
          type="button"
          onClick={onStartNewDocument}
          disabled={currentPages.length === 0}
          className="flex min-h-[44px] items-start gap-3 rounded-xl border-2 border-dashed border-border
                     bg-card p-3 text-left transition-colors hover:bg-muted focus-visible:outline-none
                     focus-visible:ring-2 focus-visible:ring-ring
                     disabled:cursor-not-allowed disabled:opacity-50"
        >
          <FilePlus2 className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-foreground">
              {t('scanEditor.tray.startNew')}
            </span>
            <span className="block text-xs text-muted-foreground">
              {t('scanEditor.tray.startNewHint')}
            </span>
          </span>
        </button>
      </div>

      {/* ── What has already been closed off ─────────────────────── */}
      {documents.length > 0 && (
        <section className="card-glass p-3" aria-labelledby="scan-tray-done">
          <h3
            id="scan-tray-done"
            className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground"
          >
            <Files className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            {t('scanEditor.tray.finishedDocuments')}
          </h3>
          <ul className="flex flex-col gap-1.5">
            {documents.map((doc, index) => (
              <li
                key={doc.id}
                className="flex items-center gap-2 rounded-lg border border-border bg-muted px-3 py-2"
              >
                <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
                  {`${t('scanEditor.tray.document')} ${index + 1}`}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {doc.pages.length === 1
                    ? t('scanEditor.tray.onePage')
                    : `${doc.pages.length} ${t('scanEditor.tray.pages')}`}
                </span>
                <button
                  type="button"
                  onClick={() => onRemoveDocument(doc.id)}
                  aria-label={`${t('scanEditor.tray.removeDocument')} ${index + 1}`}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg
                             text-muted-foreground hover:text-danger focus-visible:outline-none
                             focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Finish ───────────────────────────────────────────────── */}
      <div
        className="flex flex-col gap-2"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <button
          type="button"
          onClick={handleFinish}
          disabled={!hasAnything}
          className="cta-button min-h-[44px] w-full disabled:opacity-50"
        >
          <Check className="h-4 w-4" aria-hidden="true" />
          <span className="truncate">
            {hasAnything
              ? `${t('scanEditor.tray.finish')} (${totalPages})`
              : t('scanEditor.tray.finish')}
          </span>
        </button>

        {confirmingDiscard ? (
          // Inline rather than window.confirm: a native dialog on a phone is a
          // system sheet the owner has to read carefully, and it cannot be
          // translated by us anyway.
          <div className="rounded-xl border border-danger/30 bg-danger/5 p-3" role="alertdialog" aria-label={t('scanEditor.tray.discardAll')}>
            <p className="mb-2 text-xs text-foreground">{t('scanEditor.tray.discardConfirm')}</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onCancel}
                className="min-h-[44px] flex-1 rounded-xl bg-danger px-3 text-xs font-semibold text-white
                           focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {t('scanEditor.tray.discardAll')}
              </button>
              <button
                type="button"
                onClick={() => setConfirmingDiscard(false)}
                className="cta-button-secondary min-h-[44px] flex-1 !px-3 !py-2 !text-xs"
              >
                {t('scanEditor.tray.keepScanning')}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => (hasAnything ? setConfirmingDiscard(true) : onCancel())}
            className="min-h-[44px] w-full rounded-xl text-xs font-medium text-muted-foreground
                       hover:text-foreground focus-visible:outline-none focus-visible:ring-2
                       focus-visible:ring-ring"
          >
            {t('common.cancel')}
          </button>
        )}
      </div>
    </div>
  );
}
