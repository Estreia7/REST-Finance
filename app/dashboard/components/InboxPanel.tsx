'use client';

import { useEffect, useState } from 'react';
import { ArrowRight, CheckCircle2, Loader2 } from 'lucide-react';
import { useLanguage } from '@/lib/language-context';
import { formatMoney } from '@/lib/format';
import { inboxTotals, type InboxItem, type InboxSeverity } from '@/lib/inbox';
import { getInbox, type RestaurantInbox } from '../inbox-actions';

/**
 * "Precisa de ti": every decision the app is waiting on, worst first.
 *
 * Each row says what it is, how much money it touches, and opens the screen
 * where it is settled. Owners of several restaurants see them all, each under
 * its own name; opening another restaurant's item switches to it first.
 */

const DOT: Record<InboxSeverity, string> = {
  high: 'bg-danger',
  medium: 'bg-warning',
  low: 'bg-muted-foreground/40',
};

export default function InboxPanel({
  refreshKey,
  onOpen,
}: {
  refreshKey: number;
  onOpen: (item: InboxItem, restaurantId: string, isActive: boolean) => void;
}) {
  const { t } = useLanguage();
  const [groups, setGroups] = useState<RestaurantInbox[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let stale = false;
    getInbox().then((r) => {
      if (stale) return;
      if (r.success) setGroups(r.data);
      else setFailed(true);
    });
    return () => { stale = true; };
  }, [refreshKey]);

  if (failed) return <p className="text-sm text-muted-foreground">{t('inbox.failed')}</p>;
  if (!groups) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        {t('common.loading')}
      </div>
    );
  }

  const all = groups.flatMap((g) => g.items);
  const totals = inboxTotals(all);
  const several = groups.length > 1;
  const money = (n: number) => formatMoney(n);

  const titleFor = (item: InboxItem) =>
    t(`inbox.kinds.${item.kind}.${item.count === 1 ? 'one' : 'other'}`).replace('{count}', String(item.count));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{t('inbox.title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {totals.count === 0
            ? t('inbox.leadEmpty')
            : t(totals.amount > 0 ? 'inbox.leadWithMoney' : 'inbox.lead')
                .replace('{count}', String(totals.count))
                .replace('{amount}', money(totals.amount))}
        </p>
      </header>

      {totals.count === 0 ? (
        <div className="card-glass flex flex-col items-center px-6 py-14 text-center">
          <CheckCircle2 className="h-10 w-10 text-success" aria-hidden="true" />
          <p className="mt-4 text-base font-semibold text-foreground">{t('inbox.emptyTitle')}</p>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">{t('inbox.emptyBody')}</p>
        </div>
      ) : (
        groups.filter((g) => g.items.length > 0).map((g) => (
          <section key={g.restaurantId} aria-labelledby={several ? `inbox-${g.restaurantId}` : undefined}>
            {several && (
              <h2 id={`inbox-${g.restaurantId}`} className="section-label mb-2 px-1">
                {g.name}{g.active ? ` · ${t('inbox.current')}` : ''}
              </h2>
            )}
            <ul className="card-glass divide-y divide-border overflow-hidden">
              {g.items.map((item) => (
                <li key={item.kind}>
                  <button
                    type="button"
                    onClick={() => onOpen(item, g.restaurantId, g.active)}
                    className="group flex w-full items-center gap-4 px-4 py-4 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-5"
                  >
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${DOT[item.severity]}`} aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-foreground">{titleFor(item)}</span>
                      <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                        {t(`inbox.kinds.${item.kind}.body`)}
                      </span>
                    </span>
                    {item.amount !== null && item.amount > 0 && (
                      <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">{money(item.amount)}</span>
                    )}
                    <span className="hidden shrink-0 items-center gap-1 text-xs font-medium text-primary-ink sm:flex">
                      {t('inbox.resolve')}
                      <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                    </span>
                    <span className="sr-only">{t(`inbox.severity.${item.severity}`)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
