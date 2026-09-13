'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { toast } from 'sonner';
import { FlaskConical, Loader2, ArrowRight, AlertTriangle } from 'lucide-react';
import { useLanguage } from '@/lib/language-context';
import { translateError } from '@/lib/error-messages';
import { signInAsDemo, getDemoStatus } from '../demo-actions';

type DemoStatus = {
  exists: boolean;
  restaurantName?: string;
  summaries?: number;
  costs?: number;
  from?: Date | null;
  to?: Date | null;
};

/**
 * Entry point to the demo restaurant.
 *
 * Signing in as the demo replaces the current session, so the admin is signed
 * out. That is stated plainly rather than discovered: it is surprising
 * otherwise, and the way back is simply to sign in again.
 */
export default function DemoAccountPanel() {
  const router = useRouter();
  const { update: updateSession } = useSession();
  const { t, language } = useLanguage();
  const [status, setStatus] = useState<DemoStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);

  const load = useCallback(async () => {
    const result = await getDemoStatus();
    if ('data' in result && result.data) setStatus(result.data);
    else if ('error' in result) toast.error(translateError(language, result.error));
    setLoading(false);
  }, [language]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSwitch = async () => {
    setSwitching(true);
    const result = await signInAsDemo();

    if (result.error) {
      toast.error(translateError(language, result.error));
      setSwitching(false);
      return;
    }

    // The session is now the demo owner's, so refresh the client session
    // before navigating or the dashboard mounts as the admin.
    await updateSession();
    router.replace(result.redirectTo ?? '/dashboard');
    router.refresh();
  };

  if (loading) {
    return (
      <div className="card-glass p-6 flex items-center gap-3 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
        {t('admin.demo.loading')}
      </div>
    );
  }

  const formatDate = (d?: Date | null) =>
    d
      ? new Date(d).toLocaleDateString(language === 'pt' ? 'pt-PT' : 'en-GB', {
          month: 'short', year: 'numeric',
        })
      : '';

  return (
    <div className="card-glass p-6 max-w-2xl">
      <div className="flex items-start gap-3">
        <div className="shrink-0 w-9 h-9 rounded-xl bg-primary-subtle flex items-center justify-center">
          <FlaskConical className="w-4 h-4 text-primary-ink" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h3 className="font-semibold text-foreground">{t('admin.demo.title')}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('admin.demo.description')}
          </p>
        </div>
      </div>

      {status?.exists ? (
        <>
          <dl className="mt-5 grid grid-cols-2 sm:grid-cols-3 gap-4 rounded-lg border border-border bg-surface p-4">
            <div>
              <dt className="text-xs text-muted-foreground">{t('admin.demo.restaurant')}</dt>
              {/* The restaurant's own name — data, not copy. */}
              <dd className="mt-0.5 text-sm font-medium text-foreground truncate">
                {status.restaurantName}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{t('admin.demo.period')}</dt>
              <dd className="mt-0.5 text-sm font-medium text-foreground figure">
                {formatDate(status.from)} {t('admin.demo.periodJoin')} {formatDate(status.to)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{t('admin.demo.records')}</dt>
              <dd className="mt-0.5 text-sm font-medium text-foreground figure">
                {t('admin.demo.recordsValue')
                  .replace('{days}', String(status.summaries ?? 0))
                  .replace('{costs}', String(status.costs ?? 0))}
              </dd>
            </div>
          </dl>

          <div className="mt-4 flex items-start gap-2 text-xs text-muted-foreground">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-warning" aria-hidden="true" />
            <span>{t('admin.demo.warning')}</span>
          </div>

          <button
            onClick={handleSwitch}
            disabled={switching}
            className="cta-button mt-4 group"
          >
            {switching ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                {t('admin.demo.opening')}
              </>
            ) : (
              <>
                {t('admin.demo.open')}
                <ArrowRight
                  className="w-4 h-4 transition-transform group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </>
            )}
          </button>
        </>
      ) : (
        <div className="mt-5 rounded-lg border border-border bg-surface p-4">
          <p className="text-sm text-muted-foreground">
            {t('admin.demo.missing')}
          </p>
          <code className="mt-2 block text-xs text-foreground break-all">
            npx ts-node scripts/seed-demo.ts
          </code>
        </div>
      )}
    </div>
  );
}
