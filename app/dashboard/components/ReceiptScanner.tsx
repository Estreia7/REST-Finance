'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { Camera, Loader2, Check, X, RotateCcw, Receipt, FileText , AlertTriangle } from 'lucide-react';
import { createDailySummary, createCostEntry, getCategories } from '../actions';
import { useLanguage } from '@/lib/language-context';
import { translateError } from '@/lib/error-messages';
import { commitReconciliation } from '../reconcile-actions';
import InvoiceReconcile from './InvoiceReconcile';
import { measureImage, type QualityCheck } from '@/lib/image-quality';
import { findExistingInvoice } from '../reconcile-actions';
import type { LineResolution } from '../reconcile-actions';
import DocumentCamera from './DocumentCamera';
import ScanPageEditor, { type ScannedPage } from './ScanPageEditor';
import ScanTray, { type ScannedDocument, newDocumentId } from './ScanTray';
import SourcePickerSheet, { type PhotoSource } from './SourcePickerSheet';
import { loadFrameFromFile } from '@/lib/detect-in-file';

type ScanType = 'COST_RECEIPT' | 'DAILY_REPORT';

interface CostReceiptData {
  type: 'cost_receipt';
  date: string;
  vendor: string;
  vendorTaxId?: string;
  /** Extracted by the scanner and, until now, dropped on the way to the
      database — it is how an invoice is found again. */
  invoiceNumber?: string;
  /** `category` is the reader's guess, from the restaurant's own list. */
  items: Array<{
    product: string; quantity: number; unit?: string; unitPrice: number; total: number; category?: string;
    /** What one billed unit holds, as the reader read the description. */
    packAmount?: number; packUnit?: 'kg' | 'L';
  }>;
  grandTotal: number;
  suggestedType: 'COGS' | 'OPEX';
  suggestedCategory: string;
}

interface DailyReportData {
  type: 'daily_report';
  date: string;
  dineInRevenue: number;
  takeawayRevenue: number;
  dineInTickets: number;
  takeawayTickets: number;
}

type ExtractionResult = CostReceiptData | DailyReportData;

interface ReceiptScannerProps {
  onSaved?: () => void;
  /**
   * Which document this tab is for. The scanner sits under both Receita and
   * Custos, and a till report is not an invoice — starting on the wrong one
   * means the reader is asked the wrong question about the page.
   */
  defaultScanType?: ScanType;
  /**
   * Whether the owner may change that.
   *
   * Off under Receita and Custos, where the tab has already answered the
   * question: offering it again put "Relatório Diário" inside Custos, which
   * is a way to file a day's takings on the screen for money going out. The
   * toggle only earns its place somewhere that is about neither.
   */
  allowTypeChange?: boolean;
  /**
   * Opens the camera on mount rather than the idle screen.
   *
   * Set when the owner already said "Fotografar" on the way here. Asking
   * again, on a screen that looks like the start of the task, reads as the
   * first tap having failed.
   */
  autoStart?: boolean;
  /** Cleared once the camera has been opened, so it does not reopen. */
  onAutoStarted?: () => void;
}

export default function ReceiptScanner({
  onSaved,
  defaultScanType = 'DAILY_REPORT',
  allowTypeChange = false,
  autoStart = false,
  onAutoStarted,
}: ReceiptScannerProps) {
  const { t, language } = useLanguage();
  // Where the tab decides the type, it is the type — not just the starting
  // one. React keeps a mounted component's state across a prop change, so
  // without this a scanner reused between Receita and Custos would carry the
  // first tab's answer into the second.
  const [chosenType, setScanType] = useState<ScanType>(defaultScanType);
  const scanType = allowTypeChange ? chosenType : defaultScanType;
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  /**
   * What the photograph looks like to a reader.
   *
   * Measured here rather than after extraction, because a blurred invoice
   * does not fail loudly: the model returns names that are nearly words
   * and figures that are nearly right, and an owner saves a purchase that
   * never happened. Asking for a retake now costs seconds; finding it
   * later means finding it never.
   */
  const [quality, setQuality] = useState<QualityCheck | null>(null);
  /** An invoice already recorded under this number, shown instead of saving. */
  const [duplicate, setDuplicate] = useState<{
    invoiceNumber: string;
    vendorName: string;
    date: string | null;
    amount: number | null;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  /**
   * The invoice whose lines are being identified.
   *
   * Set once the cost entry is written, because the money should be
   * recorded whether or not the owner finishes saying what each line is.
   */
  const [reconciling, setReconciling] = useState<{
    costEntryId: string;
    data: CostReceiptData;
    /** The reading this invoice came from, so what was read can be compared with what was saved. */
    scanId: string | null;
  } | null>(null);
  /**
   * The lines handed to the reconcile screen, built once per invoice.
   *
   * Inline, a new array on every render made that screen fetch its preview
   * again and reset every answer the owner had given so far.
   */
  const reconcileLines = useMemo(
    () =>
      reconciling?.data.items.map((item) => ({
        productName: item.product,
        quantity: item.quantity,
        unit: item.unit,
        unitPrice: item.unitPrice,
        total: item.total,
        category: item.category,
        packSize: item.packAmount && item.packUnit
          ? { amount: item.packAmount, unit: item.packUnit }
          : null,
      })) ?? [],
    [reconciling],
  );
  const [extracted, setExtracted] = useState<ExtractionResult | null>(null);
  /** The stored reading behind `extracted`, kept to the end of the review. */
  const [scanId, setScanId] = useState<string | null>(null);
  const [editData, setEditData] = useState<ExtractionResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Capture flow ────────────────────────────────────────────────────────
  // The scanner walks camera -> page editor -> tray, and the tray decides
  // whether the next page joins this document or starts another one. Holding
  // the stage here rather than in the children keeps one source of truth for
  // what has been scanned and what is still being built.
  type Stage = 'idle' | 'camera' | 'editing' | 'tray';
  const [stage, setStage] = useState<Stage>('idle');
  const [captured, setCaptured] = useState<{ frame: HTMLCanvasElement; corners: any } | null>(null);
  const [currentPages, setCurrentPages] = useState<ScannedPage[]>([]);
  const [documents, setDocuments] = useState<ScannedDocument[]>([]);
  const [queue, setQueue] = useState<ScannedDocument[]>([]);
  /** The three-way choice, shown before anything opens. */
  const [pickingSource, setPickingSource] = useState(false);
  /** Detecting the document in a photograph that was chosen, not taken. */
  const [readingFile, setReadingFile] = useState(false);

  /**
   * Opens the camera straight away when that is what was already chosen.
   *
   * The + button asks "escrever ou fotografar" before it navigates here, so
   * arriving on the idle screen and asking again makes the first answer look
   * like it was thrown away. The flag is consumed immediately, so coming back
   * out of the camera leaves the owner on the tab rather than reopening it.
   */
  const autoStartedRef = useRef(false);
  useEffect(() => {
    // The ref, not just the flag: `onAutoStarted` is an inline arrow in the
    // parent, so this effect re-runs on every render, and the flag only
    // clears after the parent has re-rendered. Without the ref a render in
    // between would reopen the camera over a page the owner was editing.
    if (!autoStart) {
      // Armed again for the next time the + button asks for the camera: this
      // component stays mounted, so without this the second use would land
      // on the idle screen the first one was meant to skip.
      autoStartedRef.current = false;
      return;
    }
    if (autoStartedRef.current) return;
    autoStartedRef.current = true;
    onAutoStarted?.();
    setCurrentPages([]);
    setDocuments([]);
    setStage('camera');
  }, [autoStart, onAutoStarted]);

  /**
   * Acts on the three-way choice.
   *
   * Only the camera is ours. Reaching the gallery or the files app is
   * something only the browser can do, so those still go through a file
   * input — but without `capture`, which is what makes iOS offer its own
   * camera instead of the picker that was asked for.
   */
  const handleSource = (source: PhotoSource) => {
    setPickingSource(false);
    if (source === 'camera') {
      setCurrentPages([]);
      setDocuments([]);
      setStage('camera');
      return;
    }
    const input = fileRef.current;
    if (!input) return;
    // A gallery pick wants images only; "files" should also reach a PDF or a
    // scan saved from an email.
    input.accept = source === 'gallery' ? 'image/*' : 'image/*,application/pdf';
    input.click();
  };

  /**
   * A photograph that was chosen rather than taken.
   *
   * It goes through the same detector and the same editor as a live capture,
   * so a picture from the gallery is cropped and straightened exactly like one
   * taken through the camera. Anything else would make "choose a photo" the
   * worse option for no reason the owner could see.
   */
  const handlePickedFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Cleared straight away so picking the same file twice still fires.
    e.target.value = '';
    if (!file) return;

    setCurrentPages([]);
    setDocuments([]);
    setReadingFile(true);
    try {
      const { frame, corners } = await loadFrameFromFile(file);
      setCaptured({ frame, corners });
      setStage('editing');
    } catch {
      toast.error(t('scanner.couldNotReadFile'));
    } finally {
      setReadingFile(false);
    }
  };

  /** A frame arrived from the camera; hand it to the editor. */
  const handleCaptured = (frame: HTMLCanvasElement, corners: any) => {
    setCaptured({ frame, corners });
    setStage('editing');
  };

  /** The owner accepted a page: it joins the document being built. */
  const handlePageDone = (page: ScannedPage) => {
    setCurrentPages((pages) => [...pages, page]);
    setCaptured(null);
    setStage('tray');
  };

  /** Closes off the document being built, if it has anything in it. */
  const foldCurrent = (docs: ScannedDocument[], pages: ScannedPage[]) =>
    pages.length === 0
      ? docs
      : [...docs, { id: newDocumentId(), pages: pages.map((p) => p.dataUrl) }];

  const startNewDocument = () => {
    setDocuments((docs) => foldCurrent(docs, currentPages));
    setCurrentPages([]);
    setStage('camera');
  };

  /**
   * Finished scanning. Each document is read on its own, one after another,
   * because the extraction takes a single image: five invoices photographed in
   * one sitting are five separate costs, not one.
   */
  const handleTrayFinish = (docs: ScannedDocument[]) => {
    if (docs.length === 0) { resetCapture(); return; }
    setDocuments([]);
    setCurrentPages([]);
    setStage('idle');
    // The first document is read now; the rest wait their turn.
    setQueue(docs.slice(1));
    setImagePreview(docs[0].pages[0]);
  };

  const resetCapture = () => {
    setStage('idle');
    setCaptured(null);
    setCurrentPages([]);
    setDocuments([]);
    setQueue([]);
  };


  // Measured on arrival, whether the page came from the camera, the tray
  // or a file the owner picked — every route goes through the editor, so
  // what is measured here is always the finished page.
  //
  // That it is the *filtered* page matters more than it looks. The scan
  // filter lifts contrast hard, and the same Makro photograph measures 63
  // raw against 191 enhanced: measuring the file the owner picked would
  // refuse photographs the product then reads perfectly well. Do not move
  // this check earlier.
  useEffect(() => {
    if (!imagePreview) { setQuality(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const blob = await (await fetch(imagePreview)).blob();
        const reading = await measureImage(blob);
        if (!cancelled) setQuality(reading);
      } catch {
        // A measurement that cannot run must not block the scan.
        if (!cancelled) setQuality(null);
      }
    })();
    return () => { cancelled = true; };
  }, [imagePreview]);

  const handleScan = async () => {
    if (!imagePreview) return;
    setScanning(true);

    try {
      const base64 = imagePreview.split(',')[1];
      const mediaType = imagePreview.startsWith('data:image/png')
        ? 'image/png'
        : imagePreview.startsWith('data:image/webp')
        ? 'image/webp'
        : 'image/jpeg';

      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64, mediaType, scanType }),
      });

      const result = await res.json();
      if (result.success) {
        setExtracted(result.data);
        setScanId(typeof result.scanId === 'string' ? result.scanId : null);
        setEditData(result.data);
        toast.success(t('scanner.extracted'));
      } else {
        // The route answers with a key (`scanner.refused`…), resolved here.
        toast.error(result.error ? translateError(language, result.error) : t('scanner.scanFailed'));
      }
    } catch {
      toast.error(t('scanner.scanFailed'));
    }

    setScanning(false);
  };

  const handleConfirmSave = async () => {
    if (!editData) return;
    setSaving(true);

    try {
      if (editData.type === 'daily_report') {
        const d = editData as DailyReportData;
        const result = await createDailySummary({
          date: new Date(d.date),
          dineInRevenue: d.dineInRevenue,
          takeawayRevenue: d.takeawayRevenue,
          dineInTickets: d.dineInTickets,
          takeawayTickets: d.takeawayTickets,
        });
        if (result.success) {
          toast.success(t('scanner.revenueSaved'));
          resetState();
          onSaved?.();
        } else {
          toast.error(result.error || t('scanner.saveFailed'));
        }
      } else {
        const d = editData as CostReceiptData;
        // Find matching category
        const cats = await getCategories(d.suggestedType as any);
        const matchedCat = cats.data
          ? (cats.data as any[]).find((c: any) => c.name === d.suggestedCategory)
          : null;

        // Asked before anything is written. The guard inside the save
        // runs after the cost entry exists, so a repeated invoice was
        // refused its lines and kept its money — the worse half to
        // duplicate, since it moves the P&L.
        const existing = await findExistingInvoice({
          vendorName: d.vendor,
          invoiceNumber: d.invoiceNumber ?? null,
        });
        if ('data' in existing && existing.data) {
          setDuplicate(existing.data);
          setSaving(false);
          return;
        }

        const result = await createCostEntry({
          date: new Date(d.date),
          type: d.suggestedType,
          categoryId: matchedCat?.id,
          amount: d.grandTotal,
          description: `${d.vendor} - ${d.items.map(i => i.product).join(', ')}`,
        });
        if (result.success) {
          const entryId = (result as { data?: { id?: string } }).data?.id;

          // The money is recorded; what the lines are is a separate
          // question, and one only the owner can answer. Asking it here
          // rather than guessing is the difference between an invoice
          // that prices their Carne Smash and one that invents a second
          // ingredient beside it.
          if (entryId && d.items.length > 0) {
            toast.success(t('scanner.costSaved'));
            setReconciling({ costEntryId: entryId, data: d, scanId });
            onSaved?.();
            setSaving(false);
            return;
          }

          toast.success(t('scanner.costSaved'));
          resetState();
          onSaved?.();
        } else {
          toast.error(result.error || t('scanner.saveFailed'));
        }
      }
    } catch {
      toast.error(t('scanner.saveFailed'));
    }

    setSaving(false);
  };

  /**
   * Clears the current reading and, if several documents were scanned in one
   * sitting, brings up the next one rather than sending the owner back to the
   * camera for invoices they have already photographed.
   */
  const resetState = () => {
    setExtracted(null);
    setScanId(null);
    setEditData(null);
    if (fileRef.current) fileRef.current.value = '';

    if (queue.length > 0) {
      const [next, ...rest] = queue;
      setQueue(rest);
      setImagePreview(next.pages[0]);
      return;
    }
    setImagePreview(null);
  };

  return (
    <div className="card-glass p-6">
      {/* With the selector gone, the heading is what says which document
          this screen expects. */}
      <h2 className="text-xl font-bold text-foreground mb-6">
        {allowTypeChange
          ? t('scanner.title')
          : scanType === 'DAILY_REPORT'
            ? t('scanner.titleDailyReport')
            : t('scanner.titleCostReceipt')}
      </h2>

      {/* Already recorded. Shown rather than silently refused, because the
          owner may be holding a second genuine invoice that the supplier
          numbered badly — they can see what is on file and decide. */}
      {duplicate && (
        <div className="rounded-xl bg-warning/10 px-4 py-4 mb-4">
          <p className="flex items-start gap-2 text-sm font-semibold text-warning">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
            {t('scanner.duplicateTitle')}
          </p>
          <p className="text-xs text-muted-foreground mt-2 ml-6">
            {t('scanner.duplicateBody')
              .replace('{number}', duplicate.invoiceNumber)
              .replace('{vendor}', duplicate.vendorName)
              .replace('{date}', duplicate.date ?? '—')}
          </p>
          <div className="flex flex-wrap gap-2 mt-4 ml-6">
            <button
              type="button"
              onClick={() => { setDuplicate(null); resetState(); }}
              className="cta-button !py-2 !px-4 !text-sm"
            >
              {t('scanner.duplicateDiscard')}
            </button>
          </div>
        </div>
      )}

      {/* Identifying the lines. Everything else stands down: the invoice
          is saved, and this is the one thing left to do. */}
      {reconciling ? (
        <InvoiceReconcile
          vendorName={reconciling.data.vendor}
          vendorTaxId={reconciling.data.vendorTaxId ?? null}
          lines={reconcileLines}
          busy={saving}
          onResolved={async (lines: LineResolution[]) => {
            setSaving(true);
            const saved = await commitReconciliation({
              costEntryId: reconciling.costEntryId,
              vendorName: reconciling.data.vendor,
              // The NIF identifies the company; the name is however the
              // reader happened to read the letterhead that day.
              vendorTaxId: reconciling.data.vendorTaxId ?? null,
              invoiceDate: reconciling.data.date,
              invoiceNumber: reconciling.data.invoiceNumber ?? null,
              scanId: reconciling.scanId,
              lines,
            });
            setSaving(false);

            if ('error' in saved) {
              toast.error(t('scanner.saveFailed'));
              return;
            }

            const { itemsWritten, linked } = saved.data;
            toast.success(
              t('reconcile.saved')
                .replace('{items}', String(itemsWritten))
                .replace('{linked}', String(linked)),
            );
            setReconciling(null);
            resetState();
            onSaved?.();
          }}
        />
      ) : (<>

      {/* Scan type selector, only where the tab has not already settled it. */}
      {allowTypeChange && (
        <div className="flex gap-1 p-1 bg-muted rounded-xl w-fit border border-border-subtle mb-6">
          <button
            onClick={() => { setScanType('DAILY_REPORT'); resetState(); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${scanType === 'DAILY_REPORT' ? 'gradient-bg text-white shadow-glow-sm' : 'text-muted-foreground hover:text-foreground'}`}
          >
            <FileText className="w-3.5 h-3.5" /> {t('scanner.dailyReport')}
          </button>
          <button
            onClick={() => { setScanType('COST_RECEIPT'); resetState(); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${scanType === 'COST_RECEIPT' ? 'gradient-bg text-white shadow-glow-sm' : 'text-muted-foreground hover:text-foreground'}`}
          >
            <Receipt className="w-3.5 h-3.5" /> {t('scanner.costReceipt')}
          </button>
        </div>
      )}

      {/* Camera / upload */}
      {!imagePreview && (
        <button
          type="button"
          onClick={() => setPickingSource(true)}
          disabled={readingFile}
          className="w-full flex flex-col items-center justify-center gap-3 p-8 border-2 border-dashed border-border rounded-2xl hover:border-primary transition-colors"
        >
          <div className="w-14 h-14 rounded-2xl gradient-bg flex items-center justify-center shadow-glow-sm">
            <Camera className="w-6 h-6 text-white" aria-hidden="true" />
          </div>
          <div className="text-center">
            <div className="text-sm font-semibold text-foreground">
              {scanType === 'DAILY_REPORT'
                ? t('scanner.photographDailyReport')
                : t('scanner.photographReceipt')}
            </div>
            <div className="text-xs text-muted-foreground mt-1">{t('scanner.tapToOpenCamera')}</div>
          </div>
        </button>
      )}

      {/*
        Reaches the gallery and the files app. `accept` is set per choice just
        before it opens, and there is deliberately no `capture` attribute:
        that is what makes iOS ignore the request and open its own camera,
        which takes a plain photograph with none of the edge detection or
        automatic crop this app does.
      */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        onChange={handlePickedFile}
        className="hidden"
      />


      {/* Image preview */}
      {imagePreview && !extracted && (
        <div className="space-y-4">
          <div className="relative rounded-xl overflow-hidden border border-border">
            <img src={imagePreview} alt="Receipt" className="w-full max-h-[400px] object-contain bg-black/20" />
          </div>
          {/* Said before the scan, not after: once the model has read a
              blurred page it returns figures that look like an answer. */}
          {quality && quality.verdict !== 'good' && (
            <div
              role="status"
              className={`flex items-start gap-2 rounded-xl px-3.5 py-3 text-xs ${
                quality.verdict === 'unusable'
                  ? 'bg-danger/10 text-danger'
                  : 'bg-warning/10 text-warning'
              }`}
            >
              <AlertTriangle className="w-4 h-4 shrink-0 mt-px" aria-hidden="true" />
              <span>
                <span className="font-semibold block">
                  {quality.verdict === 'unusable'
                    ? t('quality.unusableTitle')
                    : t('quality.poorTitle')}
                </span>
                {t(`quality.${quality.reason ?? 'blurry'}`)}
              </span>
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={handleScan} disabled={scanning} className="cta-button flex-1 justify-center">
              {scanning
                ? <><Loader2 className="w-4 h-4 animate-spin" /> {t('scanner.processing')}</>
                : <><Camera className="w-4 h-4" /> {t('scanner.extractData')}</>
              }
            </button>
            <button onClick={resetState} className="px-4 py-2.5 rounded-xl bg-muted text-muted-foreground hover:bg-muted transition-colors">
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Extracted data - editable preview */}
      {editData && (
        <div className="space-y-4 mt-4">
          <div className="p-4 rounded-xl bg-success/5 border border-success/20">
            <div className="text-xs font-semibold text-green-400 mb-3">{t('scanner.reviewBeforeSaving')}</div>

            {editData.type === 'daily_report' ? (
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">{t('scanner.date')}</label>
                  <input type="date" value={(editData as DailyReportData).date} onChange={e => setEditData({ ...editData, date: e.target.value } as any)} className="input-field !py-1.5 !text-xs" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">{t('scanner.dineInRevenue')} (€)</label>
                    <input type="number" step="0.01" value={(editData as DailyReportData).dineInRevenue} onChange={e => setEditData({ ...editData, dineInRevenue: parseFloat(e.target.value) || 0 } as any)} className="input-field !py-1.5 !text-xs" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">{t('scanner.takeawayRevenue')} (€)</label>
                    <input type="number" step="0.01" value={(editData as DailyReportData).takeawayRevenue} onChange={e => setEditData({ ...editData, takeawayRevenue: parseFloat(e.target.value) || 0 } as any)} className="input-field !py-1.5 !text-xs" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">{t('scanner.dineInTickets')}</label>
                    <input type="number" value={(editData as DailyReportData).dineInTickets} onChange={e => setEditData({ ...editData, dineInTickets: parseInt(e.target.value) || 0 } as any)} className="input-field !py-1.5 !text-xs" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">{t('scanner.takeawayTickets')}</label>
                    <input type="number" value={(editData as DailyReportData).takeawayTickets} onChange={e => setEditData({ ...editData, takeawayTickets: parseInt(e.target.value) || 0 } as any)} className="input-field !py-1.5 !text-xs" />
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-muted text-sm font-bold text-foreground">
                  {t('scanner.total')}: €{((editData as DailyReportData).dineInRevenue + (editData as DailyReportData).takeawayRevenue).toFixed(2)}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">{t('scanner.date')}</label>
                    <input type="date" value={(editData as CostReceiptData).date} onChange={e => setEditData({ ...editData, date: e.target.value } as any)} className="input-field !py-1.5 !text-xs" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">{t('scanner.vendor')}</label>
                    <input type="text" value={(editData as CostReceiptData).vendor} onChange={e => setEditData({ ...editData, vendor: e.target.value } as any)} className="input-field !py-1.5 !text-xs" />
                  </div>
                </div>
                {/* Items list */}
                <div className="space-y-2">
                  <div className="text-xs text-muted-foreground">{t('scanner.items')}</div>
                  {(editData as CostReceiptData).items.map((item, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs bg-muted rounded-lg p-2">
                      <span className="flex-1 text-foreground [overflow-wrap:anywhere]">{item.product}</span>
                      {/* The unit price is the figure an ingredient cost
                          is built from, and it was being hidden: the
                          model extracts it, the screen showed only the
                          quantity and the total. */}
                      <span className="text-muted-foreground tabular-nums shrink-0 whitespace-nowrap">
                        {item.quantity}{item.unit ? ` ${item.unit}` : ''} × €{item.unitPrice.toFixed(2)}
                      </span>
                      <span className="font-semibold text-foreground tabular-nums shrink-0">€{item.total.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">{t('scanner.type')}</label>
                    <select value={(editData as CostReceiptData).suggestedType} onChange={e => setEditData({ ...editData, suggestedType: e.target.value } as any)} className="input-field !py-1.5 !text-xs">
                      <option value="COGS">COGS</option>
                      <option value="OPEX">OPEX</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">{t('scanner.total')} (€)</label>
                    <input type="number" step="0.01" value={(editData as CostReceiptData).grandTotal} onChange={e => setEditData({ ...editData, grandTotal: parseFloat(e.target.value) || 0 } as any)} className="input-field !py-1.5 !text-xs" />
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <button onClick={handleConfirmSave} disabled={saving} className="cta-button flex-1 justify-center">
              {saving
                ? <><Loader2 className="w-4 h-4 animate-spin" /> {t('scanner.saving')}</>
                : <><Check className="w-4 h-4" /> {t('scanner.confirmAndSave')}</>
              }
            </button>
            <button onClick={resetState} className="px-4 py-2.5 rounded-xl bg-muted text-muted-foreground hover:bg-muted text-sm transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {pickingSource && (
        <SourcePickerSheet
          onChoose={handleSource}
          onClose={() => setPickingSource(false)}
        />
      )}

      {/* Finding the document in a chosen photograph takes a moment on a
          phone, and a dead button in the meantime looks like a failed tap. */}
      {readingFile && (
        <div className="fixed inset-0 z-[85] flex flex-col items-center justify-center gap-3 bg-black/60 text-white">
          <Loader2 className="w-6 h-6 animate-spin" aria-hidden="true" />
          <p className="text-sm">{t('scanner.readingFile')}</p>
        </div>
      )}

      {/* ── Capture: camera, page editor, tray ─────────────────────────── */}
      </>)}

      {stage === 'camera' && (
        <DocumentCamera
          onCapture={handleCaptured}
          onClose={() => setStage(currentPages.length || documents.length ? 'tray' : 'idle')}
          onPickFile={() => { setStage('idle'); handleSource('gallery'); }}
        />
      )}

      {stage === 'editing' && captured && (
        <ScanPageEditor
          frame={captured.frame}
          detectedCorners={captured.corners}
          onDone={handlePageDone}
          onCancel={() => { setCaptured(null); setStage('camera'); }}
        />
      )}

      {stage === 'tray' && (
        <ScanTray
          currentPages={currentPages}
          documents={documents}
          onAddPageToCurrent={() => setStage('camera')}
          onStartNewDocument={startNewDocument}
          onRemovePage={(i) => setCurrentPages((pages) => pages.filter((_, idx) => idx !== i))}
          onRemoveDocument={(id) => setDocuments((docs) => docs.filter((d) => d.id !== id))}
          onFinish={handleTrayFinish}
          onCancel={resetCapture}
        />
      )}
    </div>
  );
}
