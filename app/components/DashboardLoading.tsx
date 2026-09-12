'use client';

import { useMemo } from 'react';
import { WelcomeMark } from './WelcomeSplash';
import { useLanguage } from '@/lib/language-context';

/**
 * The screen between a page load and the dashboard.
 *
 * Distinct from WelcomeSplash on purpose. The splash belongs to the act of
 * signing in — it greets someone by name and shows them a line worth reading,
 * and replaying that every time an owner pulls to refresh at the end of
 * service would wear out fast.
 *
 * But the fallback was a static letter and the word "A carregar...", which on
 * a phone over mobile data is several seconds of a screen that looks stuck.
 * So this reuses the same animated mark and an indeterminate bar: the same
 * hand, quieter, with nothing that needs to be read.
 *
 * Indeterminate rather than a progress bar, because the wait has no known
 * length — a bar that fills to 90% and stops is a worse lie than one that
 * never claimed to measure anything.
 */
export default function DashboardLoading({
  audience = 'owner',
}: {
  audience?: 'owner' | 'admin';
}) {
  const { t } = useLanguage();

  const reducedMotion = useMemo(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
    [],
  );

  return (
    <div
      className="min-h-dvh flex items-center justify-center bg-background px-6"
      role="status"
      aria-live="polite"
    >
      {/* The same warm wash as the splash, so the two read as one product. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 70% 55% at 50% 42%, hsl(var(--primary) / 0.10), transparent 70%)',
        }}
      />

      <div className="relative flex flex-col items-center">
        <WelcomeMark audience={audience} reducedMotion={reducedMotion} />

        <div className="mt-8 w-40 h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className={reducedMotion ? 'h-full w-1/3 rounded-full bg-primary' : 'loading-sweep'}
          />
        </div>

        <p className="mt-3 text-xs text-muted-foreground">{t('welcome.loading')}</p>
      </div>
    </div>
  );
}
