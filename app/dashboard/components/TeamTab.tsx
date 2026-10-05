'use client';

import { useState, type ReactNode } from 'react';
import { KeyRound, Palmtree } from 'lucide-react';
import { useLanguage } from '@/lib/language-context';
import LeavePanel from './LeavePanel';

/**
 * The Equipa tab: holidays for the people on the rota, and who can open the
 * app. Two different lists — the rota's people have no account — kept under
 * one tab because an owner thinks of both as "the team".
 *
 * Holidays first: they are the thing an owner comes back to every few weeks,
 * whereas access is set once when someone is hired.
 */
export default function TeamTab({ access }: { access: ReactNode }) {
  const { t } = useLanguage();
  const [view, setView] = useState<'leave' | 'access'>('leave');

  return (
    <div className="space-y-4">
      <div role="group" aria-label={t('teamTab.viewLabel')} className="inline-flex rounded-xl bg-muted p-1">
        {([
          ['leave', Palmtree, t('teamTab.leave')],
          ['access', KeyRound, t('teamTab.access')],
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

      {view === 'leave' ? <LeavePanel /> : access}
    </div>
  );
}
