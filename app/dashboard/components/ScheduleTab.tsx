'use client';

import { useState } from 'react';
import { CalendarDays, Sigma } from 'lucide-react';
import { useLanguage } from '@/lib/language-context';
import SchedulePanel from './SchedulePanel';
import HoursSummaryPanel from './HoursSummaryPanel';

/**
 * The Horários tab: the rota itself, and what it adds up to. Only the open view
 * is mounted, so a shift changed on the rota is already in the summary when the
 * owner switches to it.
 */
export default function ScheduleTab() {
  const { t } = useLanguage();
  const [view, setView] = useState<'rota' | 'hours'>('rota');

  return (
    <div className="space-y-4">
      <div role="group" aria-label={t('scheduleTab.viewLabel')} className="inline-flex rounded-xl bg-muted p-1">
        {([
          ['rota', CalendarDays, t('scheduleTab.rota')],
          ['hours', Sigma, t('scheduleTab.hours')],
        ] as const).map(([value, Icon, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setView(value)}
            aria-pressed={view === value}
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-colors
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
              ${view === value ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
          >
            <Icon className="w-3.5 h-3.5" aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      {view === 'rota' ? <SchedulePanel /> : <HoursSummaryPanel />}
    </div>
  );
}
