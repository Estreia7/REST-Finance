'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { LogIn, Loader2 } from 'lucide-react';
import { useLanguage } from '@/lib/language-context';
import { translateError } from '@/lib/error-messages';
import { startImpersonation } from '../impersonate-actions';

/**
 * "Sign in as this user", for support.
 *
 * Two presses, because the first one ends the administrator's own session:
 * the second says so and says it is logged. A full page load follows, so
 * every screen starts from the client's session rather than the admin's.
 */
export default function ImpersonateButton({ userId, name, compact = false }: {
  userId: string;
  name: string;
  /** Icon only until pressed, for a row of icon buttons. */
  compact?: boolean;
}) {
  const { t, language } = useLanguage();
  const [confirming, setConfirming] = useState(false);
  const [working, setWorking] = useState(false);

  const go = async () => {
    setWorking(true);
    const result = await startImpersonation(userId);
    if ('success' in result && result.success) {
      window.location.href = result.redirectTo;
      return;
    }
    setWorking(false);
    setConfirming(false);
    toast.error(translateError(language, 'error' in result ? result.error : undefined));
  };

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        title={t('admin.impersonate.button')}
        aria-label={`${t('admin.impersonate.button')}: ${name}`}
        className={compact
          ? 'p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
          : 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-border text-[11px] font-semibold text-foreground hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'}
      >
        <LogIn className="w-3.5 h-3.5" aria-hidden="true" />
        {!compact && t('admin.impersonate.buttonShort')}
      </button>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-1.5 text-left" role="group" aria-label={t('admin.impersonate.confirm').replace('{name}', name)}>
      <span className="text-[11px] text-foreground max-w-[16rem]">
        <span className="font-semibold">{t('admin.impersonate.confirm').replace('{name}', name)}</span>{' '}
        <span className="text-muted-foreground">{t('admin.impersonate.confirmHint')}</span>
      </span>
      <button
        type="button"
        onClick={go}
        disabled={working}
        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary text-primary-foreground text-[11px] font-semibold disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {working ? <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" /> : <LogIn className="w-3 h-3" aria-hidden="true" />}
        {working ? t('admin.impersonate.working') : t('admin.impersonate.confirmYes')}
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        disabled={working}
        className="px-2.5 py-1 rounded-lg text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted"
      >
        {t('admin.impersonate.cancel')}
      </button>
    </span>
  );
}
