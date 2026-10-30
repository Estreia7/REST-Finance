'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Mail } from 'lucide-react';
import { useLanguage } from '@/lib/language-context';
import { translateError } from '@/lib/error-messages';
import { getWeeklyReportPref, setWeeklyReportPref } from '../report-actions';

/**
 * Settings: the Monday email with last week's numbers. Hidden until the
 * server can send email.
 */
export default function WeeklyReportToggle() {
  const { t, language } = useLanguage();
  const [state, setState] = useState<{ on: boolean; mailReady: boolean } | null>(null);

  useEffect(() => { getWeeklyReportPref().then((r) => { if (r.success) setState(r.data); }); }, []);
  if (!state?.mailReady) return null;

  const toggle = async () => {
    const next = !state.on;
    setState({ ...state, on: next });
    const r = await setWeeklyReportPref(next);
    if (!r.success) {
      setState({ ...state, on: !next });
      toast.error(translateError(language, r.error));
    } else {
      toast.success(t(next ? 'weeklyReport.on' : 'weeklyReport.off'));
    }
  };

  return (
    <div className="card-glass p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <h2 className="text-lg font-bold text-foreground">{t('weeklyReport.title')}</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{t('weeklyReport.lead')}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={state.on}
          aria-label={t('weeklyReport.title')}
          onClick={toggle}
          className={`relative mt-1 h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${state.on ? 'bg-primary' : 'bg-border'}`}
        >
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${state.on ? 'translate-x-5' : 'translate-x-0.5'}`} />
        </button>
      </div>
    </div>
  );
}
