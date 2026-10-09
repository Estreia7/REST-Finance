'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Eye, Loader2, ArrowLeft } from 'lucide-react';
import { useLanguage } from '@/lib/language-context';
import { translateError } from '@/lib/error-messages';
import { getImpersonation, stopImpersonation } from '@/app/admin/impersonate-actions';

/**
 * Says, on every screen, that an administrator is looking at this account —
 * and is the way back.
 *
 * Floating at the bottom rather than across the top, so it never pushes the
 * client's own layout around: what support sees is what the client sees.
 * Renders nothing for the client themselves.
 */
export default function ImpersonationBanner() {
  const { t, language } = useLanguage();
  const locale = language === 'pt' ? 'pt-PT' : 'en-GB';
  const [info, setInfo] = useState<{ name: string; expiresAt: number } | null>(null);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    getImpersonation().then((r) => {
      if ('data' in r && r.data) setInfo(r.data);
    });
  }, []);

  if (!info) return null;

  const leave = async () => {
    setLeaving(true);
    const result = await stopImpersonation();
    if ('success' in result && result.success) {
      window.location.href = result.redirectTo;
      return;
    }
    setLeaving(false);
    toast.error(translateError(language, 'error' in result ? result.error : undefined));
  };

  const until = new Date(info.expiresAt).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="fixed inset-x-0 bottom-20 md:bottom-5 z-[60] flex justify-center px-4 pointer-events-none">
      <div
        role="status"
        className="pointer-events-auto flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-2xl bg-accent text-accent-foreground shadow-xl px-4 py-2.5 text-xs max-w-full"
      >
        <span className="flex items-center gap-2 min-w-0">
          <Eye className="w-4 h-4 shrink-0 text-primary" aria-hidden="true" />
          <span className="min-w-0">
            <span className="font-semibold">{t('impersonation.banner').replace('{name}', info.name)}</span>
            <span className="opacity-70"> · {t('impersonation.until').replace('{time}', until)}</span>
          </span>
        </span>
        <button
          type="button"
          onClick={leave}
          disabled={leaving}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-3 py-1.5 font-semibold disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {leaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />}
          {leaving ? t('impersonation.backing') : t('impersonation.back')}
        </button>
      </div>
    </div>
  );
}
