'use client';

import { useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  Upload, Loader2, FileSpreadsheet, CheckCircle2, AlertTriangle, X,
} from 'lucide-react';
import { useLanguage } from '@/lib/language-context';
import { translateError } from '@/lib/error-messages';
import { formatMoney } from '@/lib/format';
import { previewPosImport, commitPosImport, type ImportPreview } from '../import-actions';

/**
 * Bringing a year of history in from the till.
 *
 * An owner arriving with a POS already has everything this app wants to
 * know — it is just locked in a report. Retyping it is why history never
 * gets entered, so they export the file and drop it here.
 *
 * Shown before it is written: how many days, how much money, which famílias,
 * and every day where the file disagrees with something already recorded.
 * Overwriting a figure the owner typed themselves is not something to do
 * quietly.
 */
export default function PosImportPanel({ onImported }: { onImported?: () => void }) {
  const { t, language } = useLanguage();
  const locale = language === 'pt' ? 'pt-PT' : 'en-GB';

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [reading, setReading] = useState(false);
  const [writing, setWriting] = useState(false);
  const [overwrite, setOverwrite] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setFile(null);
    setPreview(null);
    setOverwrite(false);
    if (inputRef.current) inputRef.current.value = '';
  };

  const handlePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    if (!picked) return;

    setFile(picked);
    setPreview(null);
    setReading(true);

    const form = new FormData();
    form.set('file', picked);
    const res = await previewPosImport(form);

    if (res.error) {
      toast.error(translateError(language, res.error));
      reset();
    } else if (res.success) {
      setPreview(res.data);
    }
    setReading(false);
  };

  const handleCommit = async () => {
    if (!file) return;
    setWriting(true);

    const form = new FormData();
    form.set('file', file);
    form.set('overwrite', String(overwrite));
    const res = await commitPosImport(form);

    if ('error' in res && res.error) {
      toast.error(translateError(language, res.error));
    } else if ('data' in res && res.data) {
      const { daysWritten, daysSkipped } = res.data;
      toast.success(
        t('import.done')
          .replace('{days}', String(daysWritten))
          .replace('{skipped}', String(daysSkipped)),
      );
      reset();
      onImported?.();
    }
    setWriting(false);
  };

  return (
    <div className="card-glass p-5 space-y-4">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <FileSpreadsheet className="w-4 h-4 text-primary" aria-hidden="true" />
          <h2 className="font-semibold text-foreground">{t('import.title')}</h2>
        </div>
        <p className="text-sm text-muted-foreground">{t('import.body')}</p>
      </div>

      {!preview && (
        <>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={reading}
            className="w-full flex flex-col items-center justify-center gap-2 p-6 rounded-xl
                       border-2 border-dashed border-border hover:border-primary
                       transition-colors disabled:opacity-50"
          >
            {reading
              ? <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" aria-hidden="true" />
              : <Upload className="w-5 h-5 text-muted-foreground" aria-hidden="true" />}
            <span className="text-sm font-medium text-foreground">
              {reading ? t('import.reading') : t('import.pick')}
            </span>
            <span className="text-xs text-muted-foreground">{t('import.formats')}</span>
          </button>

          <div className="rounded-xl bg-muted/40 p-3">
            <p className="text-xs font-semibold text-foreground mb-1">{t('import.howTitle')}</p>
            <p className="text-xs text-muted-foreground leading-relaxed">{t('import.howBody')}</p>
          </div>
        </>
      )}

      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
        onChange={handlePick}
        aria-label={t('import.pick')}
        className="hidden"
      />

      {preview && (
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{file?.name}</p>
              <p className="text-xs text-muted-foreground">
                {new Date(`${preview.from}T00:00:00Z`).toLocaleDateString(locale)}
                {' – '}
                {new Date(`${preview.to}T00:00:00Z`).toLocaleDateString(locale)}
              </p>
            </div>
            <button
              type="button"
              onClick={reset}
              aria-label={t('common.cancel')}
              className="shrink-0 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Figure label={t('import.statDays')} value={String(preview.days)} />
            <Figure label={t('import.statRevenue')} value={formatMoney(preview.grandTotal)} />
            <Figure label={t('import.statFamilias')} value={String(preview.familias.length)} />
          </div>

          <div>
            <p className="text-xs font-semibold text-foreground mb-1.5">{t('import.familiasFound')}</p>
            <div className="flex flex-wrap gap-1.5">
              {preview.familias.map((f) => (
                <span key={f} className="text-[11px] px-2 py-0.5 rounded-md bg-muted text-foreground">
                  {f}
                </span>
              ))}
            </div>
          </div>

          {preview.skipped > 0 && (
            <p className="text-xs text-warning">
              {t('import.skippedRows').replace('{n}', String(preview.skipped))}
            </p>
          )}

          {/* Days that already have a different figure. Never overwritten
              without the owner saying so. */}
          {preview.conflicts.length > 0 ? (
            <div className="rounded-xl border border-warning/30 bg-warning/5 p-3">
              <p className="text-xs font-semibold text-warning mb-1.5 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
                {t('import.conflictTitle').replace('{n}', String(preview.conflicts.length))}
              </p>
              <p className="text-xs text-muted-foreground mb-2">{t('import.conflictBody')}</p>

              <div className="space-y-0.5 max-h-32 overflow-y-auto">
                {preview.conflicts.slice(0, 10).map((c) => (
                  <div key={c.date} className="flex items-center gap-2 text-[11px] tabular-nums">
                    <span className="text-muted-foreground w-20 shrink-0">
                      {new Date(`${c.date}T00:00:00Z`).toLocaleDateString(locale)}
                    </span>
                    <span className="text-muted-foreground line-through">{formatMoney(c.existing)}</span>
                    <span className="text-foreground font-medium">→ {formatMoney(c.incoming)}</span>
                  </div>
                ))}
              </div>

              <label className="mt-2.5 flex items-center gap-2 text-xs text-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={overwrite}
                  onChange={(e) => setOverwrite(e.target.checked)}
                  className="rounded border-border"
                />
                {t('import.overwriteLabel')}
              </label>
            </div>
          ) : (
            <p className="text-xs text-success flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
              {preview.newDays === preview.days
                ? t('import.allNew')
                : t('import.noConflicts')}
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleCommit}
              disabled={writing}
              className="cta-button !py-2 !px-4 !text-xs disabled:opacity-50"
            >
              {writing
                ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                : <CheckCircle2 className="w-4 h-4" aria-hidden="true" />}
              {writing ? t('import.writing') : t('import.confirm')}
            </button>
            <button
              type="button"
              onClick={reset}
              disabled={writing}
              className="px-4 py-2 rounded-xl bg-muted text-muted-foreground hover:text-foreground
                         text-xs transition-colors disabled:opacity-50"
            >
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted/40 p-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="text-sm font-bold text-foreground tabular-nums mt-0.5 truncate">{value}</p>
    </div>
  );
}
