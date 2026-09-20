'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import {
  Loader2, Upload, Trash2, KeyRound, FlaskConical, CheckCircle2, XCircle,
  AlertTriangle, QrCode, ChevronDown, ChevronRight, Save, Eye,
} from 'lucide-react';
import { useLanguage } from '@/lib/language-context';
import { translateError } from '@/lib/error-messages';
import SourcePickerSheet, { type PhotoSource } from '@/app/dashboard/components/SourcePickerSheet';
import DocumentCamera from '@/app/dashboard/components/DocumentCamera';
import ScanPageEditor, { type ScannedPage } from '@/app/dashboard/components/ScanPageEditor';
import { loadFrameFromFile } from '@/lib/detect-in-file';
import {
  getExtractionSettings, setAnthropicApiKey, clearAnthropicApiKey,
  runExtractionTest, getExtractionTests, setExtractionTruth,
  deleteExtractionTest, getExtractionSummary,
} from '../extraction-actions';

type ScanType = 'COST_RECEIPT' | 'DAILY_REPORT';

interface TestRow {
  id: string;
  scanType: ScanType;
  imageName: string;
  imagePath: string;
  model: string;
  promptVersion: string;
  extracted: unknown;
  truth: unknown;
  fieldScores: unknown;
  accuracy: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  durationMs: number | null;
  status: string;
  error: string | null;
  notes: string | null;
  createdAt: Date;
  costUsd: number | null;
}

/**
 * The extraction bench.
 *
 * Photograph a real invoice or till report, see exactly what the reader made
 * of it, then type in what was actually on the paper. The point is to replace
 * "it seems to work" with a number, before any of this is put in front of a
 * restaurant owner who will trust it with their books.
 */
export default function ExtractionLabPanel() {
  const { t, language } = useLanguage();
  const locale = language === 'pt' ? 'pt-PT' : 'en-GB';

  const [settings, setSettings] = useState<Awaited<ReturnType<typeof getExtractionSettings>>['data'] | null>(null);
  const [summary, setSummary] = useState<Awaited<ReturnType<typeof getExtractionSummary>>['data'] | null>(null);
  const [rows, setRows] = useState<TestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [savingKey, setSavingKey] = useState(false);
  const [scanType, setScanType] = useState<ScanType>('COST_RECEIPT');
  const [notes, setNotes] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // The same capture flow the clients get: source sheet, our camera with its
  // automatic shutter, then the page editor that crops and straightens. A
  // bench that fed the reader differently from the app would measure the
  // wrong thing.
  const [pickingSource, setPickingSource] = useState(false);
  const [readingFile, setReadingFile] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [captured, setCaptured] = useState<{ frame: HTMLCanvasElement; corners: unknown } | null>(null);
  /** The prepared page waiting to be sent, with a preview to look at. */
  const [page, setPage] = useState<ScannedPage | null>(null);

  const load = useCallback(async () => {
    const [s, list, sum] = await Promise.all([
      getExtractionSettings(), getExtractionTests(), getExtractionSummary(),
    ]);
    if (s.success) setSettings(s.data);
    if (list.success) setRows(list.data as unknown as TestRow[]);
    if (sum.success) setSummary(sum.data);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleSaveKey = async () => {
    setSavingKey(true);
    const res = await setAnthropicApiKey(apiKey);
    if (res.error) toast.error(translateError(language, res.error));
    else { toast.success(t('admin.extraction.keySaved')); setApiKey(''); await load(); }
    setSavingKey(false);
  };

  const handleClearKey = async () => {
    if (!confirm(t('admin.extraction.confirmClearKey'))) return;
    const res = await clearAnthropicApiKey();
    if (res.error) toast.error(translateError(language, res.error));
    else { toast.success(t('admin.extraction.keyCleared')); await load(); }
  };

  /** Camera, gallery or files — the same three the clients are offered. */
  const handleSource = (source: PhotoSource) => {
    setPickingSource(false);
    if (source === 'camera') { setCameraOpen(true); return; }
    const input = fileRef.current;
    if (!input) return;
    input.accept = source === 'gallery' ? 'image/*' : 'image/*,application/pdf';
    input.click();
  };

  /** A chosen photograph goes through the same detector as a live capture. */
  const handlePickedFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setReadingFile(true);
    try {
      const { frame, corners } = await loadFrameFromFile(file);
      setCaptured({ frame, corners });
    } catch {
      toast.error(t('scanner.couldNotReadFile'));
    } finally {
      setReadingFile(false);
    }
  };

  /**
   * Sends the prepared page.
   *
   * What goes to the reader is the cropped, straightened, filtered page the
   * editor produced — not the original photograph. That is what the client
   * side will send, and a bench that sent something cleaner would report an
   * accuracy nobody is going to see in practice.
   */
  const handleRun = async () => {
    if (!page) { toast.error(t('admin.extraction.pickFirst')); return; }

    setRunning(true);
    try {
      const blob = await (await fetch(page.dataUrl)).blob();
      const form = new FormData();
      form.set('image', new File([blob], `bench-${Date.now()}.jpg`, { type: blob.type }));
      form.set('scanType', scanType);
      form.set('notes', notes);

      const res = await runExtractionTest(form);
      if (res.error) toast.error(translateError(language, res.error));
      else {
        toast.success(t('admin.extraction.done'));
        setNotes('');
        setPage(null);
        await load();
      }
    } catch {
      toast.error(t('scanner.couldNotReadFile'));
    }
    setRunning(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('admin.extraction.confirmDelete'))) return;
    const res = await deleteExtractionTest(id);
    if (res.error) toast.error(translateError(language, res.error));
    else { toast.success(t('admin.extraction.deleted')); await load(); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" aria-hidden="true" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {pickingSource && (
        <SourcePickerSheet onChoose={handleSource} onClose={() => setPickingSource(false)} />
      )}

      {cameraOpen && (
        <DocumentCamera
          onCapture={(frame, corners) => { setCameraOpen(false); setCaptured({ frame, corners }); }}
          onClose={() => setCameraOpen(false)}
          onPickFile={() => { setCameraOpen(false); handleSource('gallery'); }}
        />
      )}

      {captured && (
        <ScanPageEditor
          frame={captured.frame}
          detectedCorners={captured.corners as never}
          onDone={(prepared) => { setCaptured(null); setPage(prepared); }}
          onCancel={() => setCaptured(null)}
        />
      )}

      {/* ── The key ─────────────────────────────────────────────────────── */}
      <section className="card-glass p-5">
        <div className="flex items-center gap-2 mb-1">
          <KeyRound className="w-4 h-4 text-primary" aria-hidden="true" />
          <h2 className="font-semibold text-foreground">{t('admin.extraction.keyTitle')}</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-4">{t('admin.extraction.keyBody')}</p>

        {settings?.configured ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg bg-success/10 text-success">
              <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
              {t('admin.extraction.keyActive')}
            </span>
            <code className="text-xs text-muted-foreground font-mono">{settings.preview}</code>
            <span className="text-xs text-muted-foreground">
              {settings.fromDatabase ? t('admin.extraction.fromDatabase') : t('admin.extraction.fromEnv')}
            </span>
            {settings.fromDatabase && (
              <button
                type="button"
                onClick={handleClearKey}
                className="ml-auto inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg
                           text-destructive hover:bg-destructive/10 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                {t('admin.extraction.clearKey')}
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-ant-..."
              aria-label={t('admin.extraction.keyTitle')}
              className="input-field flex-1 font-mono !text-xs"
            />
            <button
              type="button"
              onClick={handleSaveKey}
              disabled={savingKey || !apiKey.trim()}
              className="cta-button !py-2 !px-4 !text-xs disabled:opacity-50"
            >
              {savingKey
                ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                : <Save className="w-4 h-4" aria-hidden="true" />}
              {t('common.save')}
            </button>
          </div>
        )}

        <p className="mt-3 text-xs text-muted-foreground">
          {t('admin.extraction.modelLine')} <code className="font-mono">{settings?.model}</code>
          {' · '}
          {t('admin.extraction.promptLine')} <code className="font-mono">{settings?.promptVersion}</code>
        </p>
      </section>

      {/* ── Where it stands ─────────────────────────────────────────────── */}
      {summary && summary.all.runs > 0 && (
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat label={t('admin.extraction.statRuns')} value={String(summary.all.runs)} />
          <Stat
            label={t('admin.extraction.statAccuracy')}
            value={summary.all.meanAccuracy === null
              ? '—'
              : `${Math.round(summary.all.meanAccuracy * 100)}%`}
            hint={t('admin.extraction.statAccuracyHint').replace('{n}', String(summary.all.scored))}
          />
          <Stat
            label={t('admin.extraction.statSpeed')}
            value={summary.all.meanDurationMs === null ? '—' : `${(summary.all.meanDurationMs / 1000).toFixed(1)}s`}
          />
          <Stat
            label={t('admin.extraction.statCost')}
            value={`$${summary.all.totalCostUsd.toFixed(3)}`}
            hint={t('admin.extraction.statCostHint')}
          />
        </section>
      )}

      {/* ── Run one ─────────────────────────────────────────────────────── */}
      <section className="card-glass p-5">
        <div className="flex items-center gap-2 mb-4">
          <FlaskConical className="w-4 h-4 text-primary" aria-hidden="true" />
          <h2 className="font-semibold text-foreground">{t('admin.extraction.runTitle')}</h2>
        </div>

        <div className="flex gap-1 p-1 bg-muted rounded-xl w-fit border border-border-subtle mb-4">
          {(['COST_RECEIPT', 'DAILY_REPORT'] as const).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setScanType(type)}
              className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                scanType === type ? 'gradient-bg text-white shadow-glow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t(`admin.extraction.type.${type}`)}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={handlePickedFile}
            aria-label={t('admin.extraction.pickImage')}
            className="hidden"
          />

          {page ? (
            <div className="relative rounded-xl overflow-hidden border border-border-subtle">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={page.dataUrl}
                alt={t('admin.extraction.pickImage')}
                className="w-full max-h-64 object-contain bg-black/20"
              />
              <button
                type="button"
                onClick={() => setPage(null)}
                aria-label={t('common.delete')}
                className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 text-white hover:bg-black/80"
              >
                <XCircle className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setPickingSource(true)}
              disabled={readingFile}
              className="w-full flex flex-col items-center justify-center gap-2 p-6 rounded-xl
                         border-2 border-dashed border-border hover:border-primary
                         transition-colors disabled:opacity-50"
            >
              {readingFile
                ? <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" aria-hidden="true" />
                : <Upload className="w-5 h-5 text-muted-foreground" aria-hidden="true" />}
              <span className="text-xs text-muted-foreground">
                {readingFile ? t('scanner.readingFile') : t('admin.extraction.pickImage')}
              </span>
            </button>
          )}
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t('admin.extraction.notesPlaceholder')}
            aria-label={t('admin.extraction.notes')}
            className="input-field w-full !text-xs"
          />
          <button
            type="button"
            onClick={handleRun}
            disabled={running || !settings?.configured || !page}
            className="cta-button !py-2 !px-4 !text-xs disabled:opacity-50"
          >
            {running
              ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              : <Upload className="w-4 h-4" aria-hidden="true" />}
            {running ? t('admin.extraction.running') : t('admin.extraction.run')}
          </button>
          {!settings?.configured && (
            <p className="text-xs text-warning">{t('admin.extraction.needKey')}</p>
          )}
        </div>
      </section>

      {/* ── The log ─────────────────────────────────────────────────────── */}
      <section className="card-glass p-5">
        <h2 className="font-semibold text-foreground mb-4">{t('admin.extraction.logTitle')}</h2>

        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">{t('admin.extraction.logEmpty')}</p>
        ) : (
          <div className="space-y-2">
            {rows.map((row) => (
              <TestRowCard
                key={row.id}
                row={row}
                locale={locale}
                expanded={expanded === row.id}
                onToggle={() => setExpanded(expanded === row.id ? null : row.id)}
                onDelete={() => handleDelete(row.id)}
                onSaved={load}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card-glass p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-bold text-foreground tabular-nums mt-0.5">{value}</p>
      {hint && <p className="text-[11px] text-muted-foreground mt-0.5">{hint}</p>}
    </div>
  );
}

/** One run: what came back, what was true, and what it cost. */
function TestRowCard({
  row, locale, expanded, onToggle, onDelete, onSaved,
}: {
  row: TestRow;
  locale: string;
  expanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onSaved: () => Promise<void>;
}) {
  const { t, language } = useLanguage();
  const [truth, setTruth] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  /** The photograph, full screen, for checking a reading against the paper. */
  const [previewing, setPreviewing] = useState(false);

  const extracted = (row.extracted ?? {}) as Record<string, unknown>;
  const scores = (row.fieldScores ?? {}) as {
    warnings?: Array<{ field: string; code: string; detail?: string }>;
    qr?: { issuerNif?: string; grandTotal?: number; date?: string; atcud?: string } | null;
    qrComparison?: Array<{ field: string; extracted: unknown; fromQr: unknown; agrees: boolean }>;
    /** Fields the QR put right after the reading got them wrong or missed them. */
    qrCorrected?: string[];
    fields?: Record<string, boolean>;
  };

  // The fields worth checking, per document type. Line items are deliberately
  // not scored field-by-field: counting thirty products would drown the four
  // numbers that actually reconcile against the bank.
  const fields = row.scanType === 'COST_RECEIPT'
    ? ['date', 'vendor', 'vendorTaxId', 'invoiceNumber', 'grandTotal']
    : ['date', 'dineInRevenue', 'takeawayRevenue', 'dineInTickets', 'takeawayTickets'];

  const handleSave = async () => {
    setSaving(true);
    const res = await setExtractionTruth(row.id, truth);
    if (res.error) toast.error(translateError(language, res.error));
    else { toast.success(t('admin.extraction.truthSaved')); await onSaved(); }
    setSaving(false);
  };

  const failed = row.status === 'FAILED';
  const warnings = scores.warnings ?? [];
  const qrDisagrees = (scores.qrComparison ?? []).filter((c) => !c.agrees);

  return (
    <div className="rounded-xl border border-border-subtle overflow-hidden">
      {/* The paper itself, for settling a disagreement between the reading
          and what was typed in as true. */}
      {previewing && (
        <div
          className="fixed inset-0 z-[95] flex items-center justify-center bg-black/80 p-4"
          onClick={() => setPreviewing(false)}
          role="dialog"
          aria-modal="true"
          aria-label={row.imageName}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/images/${row.imagePath}`}
            alt={row.imageName}
            className="max-w-full max-h-full object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            type="button"
            onClick={() => setPreviewing(false)}
            aria-label={t('common.close')}
            className="absolute top-4 right-4 p-2 rounded-lg bg-black/60 text-white hover:bg-black/80"
          >
            <XCircle className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>
      )}

      <div className="flex items-stretch">
        {/* A thumbnail beats a filename for recognising which invoice this
            was, and opens the full photograph. */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setPreviewing(true); }}
          aria-label={t('admin.extraction.viewImage')}
          title={t('admin.extraction.viewImage')}
          className="shrink-0 w-14 relative group border-r border-border-subtle
                     focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/images/${row.imagePath}`}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
          />
          <span className="absolute inset-0 flex items-center justify-center bg-black/0
                           group-hover:bg-black/40 transition-colors">
            <Eye className="w-4 h-4 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                 aria-hidden="true" />
          </span>
        </button>

      <button
        type="button"
        onClick={onToggle}
        className="flex-1 min-w-0 flex items-center gap-3 p-3 text-left hover:bg-muted/40 transition-colors"
      >
        {expanded
          ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />
          : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />}

        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground truncate">{row.imageName}</p>
          <p className="text-xs text-muted-foreground">
            {t(`admin.extraction.type.${row.scanType}`)}
            {' · '}
            {new Date(row.createdAt).toLocaleString(locale)}
            {row.durationMs !== null && ` · ${(row.durationMs / 1000).toFixed(1)}s`}
            {row.costUsd !== null && ` · $${row.costUsd.toFixed(4)}`}
          </p>
        </div>

        {/* The QR is the strongest signal there is, so it is shown first. */}
        {scores.qr && (
          <span
            className={`inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-md shrink-0 ${
              qrDisagrees.length > 0 ? 'bg-destructive/10 text-destructive' : 'bg-success/10 text-success'
            }`}
            title={t('admin.extraction.qrFound')}
          >
            <QrCode className="w-3 h-3" aria-hidden="true" />
            {qrDisagrees.length > 0 ? qrDisagrees.length : ''}
          </span>
        )}

        {warnings.length > 0 && (
          <span className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-md
                           bg-warning/10 text-warning shrink-0">
            <AlertTriangle className="w-3 h-3" aria-hidden="true" />
            {warnings.length}
          </span>
        )}

        {failed
          ? <XCircle className="w-4 h-4 text-destructive shrink-0" aria-hidden="true" />
          : row.accuracy !== null && (
              <span className={`text-xs font-bold tabular-nums shrink-0 ${
                row.accuracy >= 0.99 ? 'text-success' : row.accuracy >= 0.8 ? 'text-warning' : 'text-destructive'
              }`}>
                {Math.round(row.accuracy * 100)}%
              </span>
            )}
      </button>
      </div>

      {expanded && (
        <div className="border-t border-border-subtle p-4 space-y-4 bg-muted/20">
          {failed ? (
            <p className="text-xs text-destructive font-mono break-all">{row.error}</p>
          ) : (
            <>
              {scores.qr && (
                <div className="rounded-lg bg-card p-3 border border-border-subtle">
                  <p className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
                    <QrCode className="w-3.5 h-3.5" aria-hidden="true" />
                    {t('admin.extraction.qrTitle')}
                  </p>
                  <p className="text-[11px] text-muted-foreground mb-2">{t('admin.extraction.qrBody')}</p>
                  {(scores.qrCorrected?.length ?? 0) > 0 && (
                    <p className="text-[11px] text-success mb-2">
                      {t('admin.extraction.qrFixed')} {scores.qrCorrected!.join(', ')}
                    </p>
                  )}
                  <div className="space-y-1">
                    {(scores.qrComparison ?? []).map((c) => (
                      <div key={c.field} className="flex items-center gap-2 text-xs">
                        {c.agrees
                          ? <CheckCircle2 className="w-3 h-3 text-success shrink-0" aria-hidden="true" />
                          : <XCircle className="w-3 h-3 text-destructive shrink-0" aria-hidden="true" />}
                        <span className="text-muted-foreground w-28 shrink-0">{c.field}</span>
                        <span className="font-mono text-foreground truncate">{String(c.extracted ?? '—')}</span>
                        {!c.agrees && (
                          <span className="font-mono text-success truncate">→ {String(c.fromQr ?? '—')}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {warnings.length > 0 && (
                <div className="rounded-lg bg-warning/5 border border-warning/20 p-3">
                  <p className="text-xs font-semibold text-warning mb-1.5">{t('admin.extraction.warningsTitle')}</p>
                  <ul className="space-y-0.5">
                    {warnings.map((w, i) => (
                      <li key={i} className="text-xs text-muted-foreground">
                        <span className="font-mono">{w.field}</span>
                        {' — '}
                        {t(`admin.extraction.warning.${w.code}`)}
                        {w.detail && <span className="font-mono"> ({w.detail})</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Side by side: what came back, and what was really there. */}
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-semibold text-foreground mb-2">{t('admin.extraction.extractedTitle')}</p>
                  <pre className="text-[11px] font-mono bg-card p-3 rounded-lg border border-border-subtle
                                  overflow-x-auto max-h-64 overflow-y-auto">
                    {JSON.stringify(extracted, null, 2)}
                  </pre>
                </div>

                <div>
                  <p className="text-xs font-semibold text-foreground mb-2">{t('admin.extraction.truthTitle')}</p>
                  <p className="text-[11px] text-muted-foreground mb-2">{t('admin.extraction.truthBody')}</p>
                  <div className="space-y-1.5">
                    {fields.map((field) => {
                      const verdict = scores.fields?.[field];
                      return (
                        <div key={field} className="flex items-center gap-2">
                          <label htmlFor={`${row.id}-${field}`} className="text-xs text-muted-foreground w-32 shrink-0 truncate">
                            {field}
                          </label>
                          <input
                            id={`${row.id}-${field}`}
                            type="text"
                            defaultValue={
                              (row.truth as Record<string, string> | null)?.[field] ??
                              ''
                            }
                            onChange={(e) => setTruth((p) => ({ ...p, [field]: e.target.value }))}
                            placeholder={String(extracted[field] ?? '—')}
                            className="input-field flex-1 !py-1 !text-xs font-mono"
                          />
                          {verdict !== undefined && (verdict
                            ? <CheckCircle2 className="w-3.5 h-3.5 text-success shrink-0" aria-hidden="true" />
                            : <XCircle className="w-3.5 h-3.5 text-destructive shrink-0" aria-hidden="true" />)}
                        </div>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving || Object.keys(truth).length === 0}
                    className="mt-3 inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg
                               bg-muted text-foreground hover:bg-muted/70 disabled:opacity-50 transition-colors"
                  >
                    {saving
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                      : <Save className="w-3.5 h-3.5" aria-hidden="true" />}
                    {t('admin.extraction.saveTruth')}
                  </button>
                </div>
              </div>
            </>
          )}

          <div className="flex items-center justify-between pt-2 border-t border-border-subtle">
            <p className="text-[11px] text-muted-foreground font-mono">
              {row.model} · {row.promptVersion}
              {row.inputTokens !== null && ` · ${row.inputTokens}+${row.outputTokens} tok`}
            </p>
            <button
              type="button"
              onClick={onDelete}
              className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg
                         text-destructive hover:bg-destructive/10 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
              {t('common.delete')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
