'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { FileText, Download, Loader2 } from 'lucide-react';
import InfoHint from '@/app/components/InfoHint';
import { useLanguage } from '@/lib/language-context';
import { downloadFile } from '@/lib/download-file';

/** Translated at render time. The index is the month, January first. */
const MONTH_KEYS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
] as const;

export default function MonthlyReportPanel() {
  const { t } = useLanguage();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await downloadFile(
        `/api/export/pdf?month=${month}&year=${year}`,
        `relatorio-${year}-${String(month).padStart(2, '0')}.pdf`,
      );
    } catch {
      toast.error(t('monthlyReport.error'));
    }
    setDownloading(false);
  };

  return (
    <div className="card-glass p-6">
      <div className="flex items-center gap-2 mb-5">
        <FileText className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-bold text-foreground">
          {t('monthlyReport.title')}<InfoHint term="monthlyReport" />
        </h2>
      </div>

      {/* "P&L e KPIs" is the jargon this whole pass exists to remove. */}
      <p className="text-sm text-muted-foreground mb-6">
        {t('monthlyReport.intro')}
      </p>

      <div className="flex items-end gap-4 mb-6">
        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-2">{t('monthlyReport.month')}</label>
          <select value={month} onChange={e => setMonth(parseInt(e.target.value))} className="input-field">
            {MONTH_KEYS.map((key, i) => (
              <option key={key} value={i + 1}>{t(`monthlyReport.monthName.${key}`)}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-2">{t('monthlyReport.year')}</label>
          <select value={year} onChange={e => setYear(parseInt(e.target.value))} className="input-field">
            {Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i).map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
        <button onClick={handleDownload} disabled={downloading} className="cta-button py-2.5 px-5 text-sm">
          {downloading
            ? <><Loader2 className="w-4 h-4 animate-spin" /> {t('monthlyReport.generating')}</>
            : <><Download className="w-4 h-4" /> {t('monthlyReport.download')}</>}
        </button>
      </div>

      <div className="p-3 rounded-lg bg-warning/5 border border-warning/20 text-xs text-amber-400">
        {t('monthlyReport.accuracyNote')}
      </div>
    </div>
  );
}
