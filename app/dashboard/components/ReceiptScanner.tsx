'use client';

import { useState, useRef } from 'react';
import { toast } from 'sonner';
import { Camera, Loader2, Check, X, RotateCcw, Receipt, FileText } from 'lucide-react';
import { createDailySummary, createCostEntry, getCategories } from '../actions';
import { useLanguage } from '@/lib/language-context';
import DocumentCamera from './DocumentCamera';
import ScanPageEditor, { type ScannedPage } from './ScanPageEditor';
import ScanTray, { type ScannedDocument, newDocumentId } from './ScanTray';

type ScanType = 'COST_RECEIPT' | 'DAILY_REPORT';

interface CostReceiptData {
  type: 'cost_receipt';
  date: string;
  vendor: string;
  items: Array<{ product: string; quantity: number; unitPrice: number; total: number }>;
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

export default function ReceiptScanner({ onSaved }: { onSaved?: () => void }) {
  const { t } = useLanguage();
  const [scanType, setScanType] = useState<ScanType>('DAILY_REPORT');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [extracted, setExtracted] = useState<ExtractionResult | null>(null);
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


  const handleCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setImagePreview(dataUrl);
      setExtracted(null);
      setEditData(null);
    };
    reader.readAsDataURL(file);
  };

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
        setEditData(result.data);
        toast.success(t('scanner.extracted'));
      } else {
        toast.error(result.error || t('scanner.scanFailed'));
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

        const result = await createCostEntry({
          date: new Date(d.date),
          type: d.suggestedType,
          categoryId: matchedCat?.id,
          amount: d.grandTotal,
          description: `${d.vendor} - ${d.items.map(i => i.product).join(', ')}`,
        });
        if (result.success) {
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
      <h2 className="text-xl font-bold text-foreground mb-6">{t('scanner.title')}</h2>

      {/* Scan type selector */}
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

      {/* Camera / upload */}
      {!imagePreview && (
        <button
          type="button"
          onClick={() => { setCurrentPages([]); setDocuments([]); setStage('camera'); }}
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

      {/* Kept for the fallback when the camera cannot be opened. */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleCapture}
        className="hidden"
      />


      {/* Image preview */}
      {imagePreview && !extracted && (
        <div className="space-y-4">
          <div className="relative rounded-xl overflow-hidden border border-border">
            <img src={imagePreview} alt="Receipt" className="w-full max-h-[400px] object-contain bg-black/20" />
          </div>
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
                      <span className="flex-1 text-foreground">{item.product}</span>
                      <span className="text-muted-foreground">{item.quantity}x</span>
                      <span className="font-semibold text-foreground">€{item.total.toFixed(2)}</span>
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

      {/* ── Capture: camera, page editor, tray ─────────────────────────── */}
      {stage === 'camera' && (
        <DocumentCamera
          onCapture={handleCaptured}
          onClose={() => setStage(currentPages.length || documents.length ? 'tray' : 'idle')}
          onPickFile={() => { setStage('idle'); fileRef.current?.click(); }}
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
