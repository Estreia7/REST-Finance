'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw, Cpu, ChevronRight, ArrowUpRight, AlertTriangle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useLanguage } from '@/lib/language-context';
import { translateError } from '@/lib/error-messages';
import ListSearch, { matchesSearch } from '@/app/dashboard/components/ListSearch';
import { USAGE_PERIODS, type UsagePeriod, type UsageSummary } from '@/lib/ai-usage';
import type { ModelPrice } from '@/lib/ai-models';
import { getAiUsage } from '../usage-actions';

interface UsageData {
  summary: UsageSummary;
  currentModel: string;
  prices: Array<ModelPrice & { model: string }>;
  firstLoggedAt: Date | null;
}

const PERIOD_KEY: Record<UsagePeriod, string> = {
  '7d': 'admin.aiUsage.period7d',
  '30d': 'admin.aiUsage.period30d',
  '90d': 'admin.aiUsage.period90d',
  all: 'admin.aiUsage.periodAll',
};

/**
 * What the AI costs, on which model, and who spends it.
 *
 * Money is in dollars because that is what Anthropic bills in; converting it
 * to euros would put an exchange rate we do not control between the console
 * and the invoice it has to agree with.
 */
export default function AiUsagePanel({ onOpenRestaurant }: { onOpenRestaurant: (id: string) => void }) {
  const { t, language } = useLanguage();
  const locale = language === 'pt' ? 'pt-PT' : 'en-GB';

  const [period, setPeriod] = useState<UsagePeriod>('30d');
  const [data, setData] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openOwners, setOpenOwners] = useState<Set<string>>(new Set());
  const [ownerSearch, setOwnerSearch] = useState('');
  const [restaurantSearch, setRestaurantSearch] = useState('');

  const load = useCallback(async (p: UsagePeriod) => {
    setLoading(true);
    const result = await getAiUsage(p);
    if (result.success && result.data) {
      setData(result.data as UsageData);
      setError(null);
    } else {
      setError(result.error ?? 'errors.generic');
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(period); }, [load, period]);

  // Calls cost fractions of a cent, so small sums keep four decimals: "$0.00"
  // for a week of scans would read as "free", which it is not.
  const usd = (v: number) => {
    const digits = v > 0 && v < 1 ? 4 : 2;
    return new Intl.NumberFormat(locale, {
      style: 'currency', currency: 'USD', minimumFractionDigits: digits, maximumFractionDigits: digits,
    }).format(v);
  };
  // Prices are quoted as published: "$0.10", not "$0.1000".
  const price = (v: number) =>
    new Intl.NumberFormat(locale, {
      style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 4,
    }).format(v);
  // Axis ticks only need to be told apart, and must fit a narrow gutter.
  const tick = (v: number) =>
    new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD', maximumSignificantDigits: 2 }).format(v);
  const compact = (v: number) =>
    new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(v);
  const int = (v: number) => new Intl.NumberFormat(locale).format(v);
  const pct = (v: number) =>
    new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: v < 0.1 ? 1 : 0 }).format(v);
  const day = (key: string, long = false) =>
    new Date(`${key}T12:00:00`).toLocaleDateString(locale, long
      ? { weekday: 'short', day: 'numeric', month: 'long' }
      : { day: '2-digit', month: '2-digit' });

  const toggleOwner = (id: string) =>
    setOpenOwners((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-16" role="status" aria-label={t('admin.aiUsage.loading')}>
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" aria-hidden="true" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="card-glass p-6 flex flex-col items-start gap-3">
        <p className="text-sm text-foreground">{translateError(language, error)}</p>
        <button onClick={() => load(period)} className="px-3 py-1.5 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{t('admin.aiUsage.refresh')}</button>
      </div>
    );
  }

  if (!data) return null;
  const { summary, currentModel, prices, firstLoggedAt } = data;
  const { totals } = summary;

  const ownerName = (o: { name: string | null; email: string }) => o.name || o.email;
  const owners = summary.owners.filter((o) =>
    matchesSearch(ownerSearch, o.owner.name, o.owner.email, ...o.restaurants.map((r) => r.name)),
  );
  const restaurants = summary.restaurants.filter((r) =>
    matchesSearch(restaurantSearch, r.name, ...r.owners.flatMap((o) => [o.name, o.email])),
  );
  const bench = summary.bySource.find((s) => s.source === 'bench');
  const spendByModel = new Map(summary.byModel.map((m) => [m.model, m]));
  // A model that answered but is missing from the price list still shows,
  // flagged, so its calls are not silently summed as free.
  const unpricedModels = summary.byModel.filter((m) => !m.priced);

  return (
    <div className="space-y-5">
      {/* ── Period and freshness ────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {firstLoggedAt
            ? t('admin.aiUsage.loggingSince').replace(
                '{date}',
                new Date(firstLoggedAt).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' }),
              )
            : null}
        </p>
        <div className="flex items-center gap-2">
          <div role="radiogroup" aria-label={t('admin.aiUsage.periodLabel')} className="inline-flex p-1 rounded-xl bg-muted">
            {USAGE_PERIODS.map((p) => (
              <button
                key={p}
                role="radio"
                aria-checked={period === p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  period === p ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t(PERIOD_KEY[p])}
              </button>
            ))}
          </div>
          <button
            onClick={() => load(period)}
            aria-label={t('admin.aiUsage.refresh')}
            title={t('admin.aiUsage.refresh')}
            className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
          </button>
        </div>
      </div>

      {!firstLoggedAt && (
        <div className="card-glass p-6 flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-primary-subtle flex items-center justify-center shrink-0">
            <Cpu className="w-5 h-5 text-primary-ink" aria-hidden="true" />
          </div>
          <p className="text-sm text-muted-foreground max-w-prose leading-relaxed">{t('admin.aiUsage.notLoggedYet')}</p>
        </div>
      )}

      {/* ── The figures: one strip, cost leading ───────────────────────── */}
      <section
        aria-label={t('admin.heading.aiUsage')}
        className={`card-glass grid grid-cols-2 md:grid-cols-5 transition-opacity ${loading ? 'opacity-60' : ''}`}
      >
        <Figure
          className="col-span-2 md:col-span-1 border-b md:border-b-0 md:border-r border-border-subtle"
          label={t('admin.aiUsage.cost')}
          value={usd(totals.costUsd)}
          caption={t('admin.aiUsage.costCaption').replace('{tokens}', compact(totals.inputTokens + totals.outputTokens))}
          lead
        />
        <Figure
          className="border-r border-border-subtle"
          label={t('admin.aiUsage.calls')}
          value={int(totals.calls)}
          caption={totals.meanDurationMs !== null
            ? t('admin.aiUsage.callsCaption').replace('{s}', (totals.meanDurationMs / 1000).toLocaleString(locale, { maximumFractionDigits: 1 }))
            : '—'}
        />
        <Figure
          className="md:border-r border-border-subtle"
          label={t('admin.aiUsage.failed')}
          value={int(totals.failed)}
          caption={totals.failed === 0
            ? t('admin.aiUsage.failedNone')
            : t('admin.aiUsage.failedCaption').replace('{n}', int(totals.refused))}
          lamp={totals.failed > 0}
        />
        <Figure
          className="border-t md:border-t-0 border-r border-border-subtle"
          label={t('admin.aiUsage.meanCost')}
          value={totals.meanCostUsd !== null ? usd(totals.meanCostUsd) : '—'}
          caption={t('admin.aiUsage.meanCostCaption')}
        />
        <Figure
          className="border-t md:border-t-0 border-border-subtle"
          label={t('admin.aiUsage.projection')}
          value={usd(totals.projected30dUsd)}
          caption={t('admin.aiUsage.projectionCaption')}
        />
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* ── Cost per day ─────────────────────────────────────────────── */}
        <section className="card-glass p-5 lg:col-span-2 min-w-0">
          <h2 className="text-base font-bold text-foreground">{t('admin.aiUsage.chartTitle')}</h2>
          <p className="text-xs text-muted-foreground mt-0.5 mb-4">{t('admin.aiUsage.chartSubtitle')}</p>
          {totals.calls > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={summary.byDay} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="hsl(var(--border-subtle))" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={(v: string) => day(v)}
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                  axisLine={false} tickLine={false} minTickGap={16}
                />
                <YAxis
                  tickFormatter={(v: number) => tick(v)}
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                  axisLine={false} tickLine={false} width={72}
                />
                <Tooltip
                  cursor={{ fill: 'hsl(var(--muted))' }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const p = payload[0].payload as UsageSummary['byDay'][number];
                    return (
                      <div className="bg-card border border-border rounded-xl px-3 py-2 shadow-lg text-xs">
                        <p className="text-muted-foreground mb-0.5">{day(p.date, true)}</p>
                        <p className="font-bold text-foreground tabular-nums">{usd(p.costUsd)}</p>
                        <p className="text-muted-foreground tabular-nums">{int(p.calls)} {t('admin.aiUsage.chartCalls')}</p>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="costUsd" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[220px] flex items-center justify-center text-sm text-muted-foreground">
              {t('admin.aiUsage.chartEmpty')}
            </div>
          )}
        </section>

        {/* ── Models: price list and spend, one place ──────────────────── */}
        <section className="card-glass p-5">
          <h2 className="text-base font-bold text-foreground">{t('admin.aiUsage.modelsTitle')}</h2>
          <p className="text-xs text-muted-foreground mt-0.5 mb-4">{t('admin.aiUsage.modelsSubtitle')}</p>
          <ul className="space-y-3">
            {prices.map((p) => {
              const spend = spendByModel.get(p.model);
              const inUse = p.model === currentModel;
              return (
                <li
                  key={p.model}
                  className={`rounded-xl border p-3 ${inUse ? 'border-primary/40 bg-primary-subtle/50' : 'border-border-subtle'}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-foreground">{p.label}</p>
                    {inUse && (
                      <span className="text-[10px] font-bold uppercase tracking-wide text-primary-ink bg-primary-subtle px-1.5 py-0.5 rounded-md">
                        {t('admin.aiUsage.inUse')}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-foreground tabular-nums mt-1">
                    {price(p.input)} <span className="text-muted-foreground">/</span> {price(p.output)}
                  </p>
                  {p.longPrompt && (
                    <p className="text-[11px] text-muted-foreground tabular-nums">
                      {t('admin.aiUsage.longPrompt')
                        .replace('{n}', compact(p.longPrompt.overInputTokens))
                        .replace('{in}', price(p.longPrompt.input))
                        .replace('{out}', price(p.longPrompt.output))}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground tabular-nums mt-2 pt-2 border-t border-border-subtle">
                    {spend
                      ? t('admin.aiUsage.modelSpend').replace('{n}', int(spend.calls)).replace('{cost}', usd(spend.costUsd))
                      : t('admin.aiUsage.modelIdle')}
                  </p>
                </li>
              );
            })}
            {unpricedModels.map((m) => (
              <li key={m.model} className="rounded-xl border border-border-subtle p-3">
                <p className="text-sm font-semibold text-foreground break-all">{m.model}</p>
                <p className="flex items-center gap-1.5 text-xs text-warning mt-1">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  {t('admin.aiUsage.unpriced')}
                </p>
                <p className="text-xs text-muted-foreground tabular-nums mt-2 pt-2 border-t border-border-subtle">
                  {t('admin.aiUsage.modelSpend').replace('{n}', int(m.calls)).replace('{cost}', usd(m.costUsd))}
                </p>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* ── Who spends it: owners ────────────────────────────────────────── */}
      <section className="card-glass p-5">
        <h2 className="text-base font-bold text-foreground">{t('admin.aiUsage.ownersTitle')}</h2>
        <p className="text-xs text-muted-foreground mt-0.5 mb-4">{t('admin.aiUsage.ownersSubtitle')}</p>
        <ListSearch
          value={ownerSearch}
          onChange={setOwnerSearch}
          placeholder={t('admin.aiUsage.searchOwners')}
          count={summary.owners.length}
          matches={owners.length}
        />
        {summary.owners.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">{t('admin.aiUsage.emptyRanking')}</p>
        ) : (
          <div className="-mx-5 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-subtle text-xs text-muted-foreground">
                  <th scope="col" className="text-left font-medium py-2 pl-5 pr-2 w-10"><span className="sr-only">{t('admin.aiUsage.colRank')}</span>#</th>
                  <th scope="col" className="text-left font-medium py-2 px-2">{t('admin.aiUsage.colOwner')}</th>
                  <th scope="col" className="text-right font-medium py-2 px-2 hidden sm:table-cell">{t('admin.aiUsage.colCalls')}</th>
                  <th scope="col" className="text-right font-medium py-2 px-2">{t('admin.aiUsage.colCost')}</th>
                  <th scope="col" className="text-left font-medium py-2 pl-2 pr-5 hidden md:table-cell w-48">{t('admin.aiUsage.colShare')}</th>
                </tr>
              </thead>
              <tbody>
                {owners.map((o) => {
                  const rank = summary.owners.indexOf(o) + 1;
                  const open = openOwners.has(o.owner.id);
                  const name = ownerName(o.owner);
                  return (
                    <Fragment key={o.owner.id}>
                      <tr className="border-b border-border-subtle hover:bg-muted/60">
                        <td className="py-2.5 pl-5 pr-2 text-xs text-muted-foreground tabular-nums align-top">{rank}</td>
                        <td className="py-2.5 px-2 align-top">
                          <button
                            onClick={() => toggleOwner(o.owner.id)}
                            aria-expanded={open}
                            aria-label={t('admin.aiUsage.showRestaurants').replace('{name}', name)}
                            className="flex items-start gap-1.5 text-left rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <ChevronRight
                              className={`w-4 h-4 mt-0.5 text-muted-foreground shrink-0 transition-transform duration-200 ${open ? 'rotate-90' : ''}`}
                              aria-hidden="true"
                            />
                            <span className="min-w-0">
                              <span className="block font-semibold text-foreground truncate">{name}</span>
                              <span className="block text-xs text-muted-foreground">
                                {o.restaurants.length === 1
                                  ? t('admin.aiUsage.restaurantsOne')
                                  : t('admin.aiUsage.restaurantsMany').replace('{n}', int(o.restaurants.length))}
                                {o.owner.name && <span className="hidden lg:inline"> · {o.owner.email}</span>}
                              </span>
                            </span>
                          </button>
                        </td>
                        <td className="py-2.5 px-2 text-right tabular-nums text-muted-foreground hidden sm:table-cell align-top">
                          {int(o.calls)}
                          {o.failed > 0 && (
                            <span className="block text-[11px] text-warning">{t('admin.aiUsage.failedCount').replace('{n}', int(o.failed))}</span>
                          )}
                        </td>
                        <td className="py-2.5 px-2 text-right tabular-nums font-semibold text-foreground align-top">{usd(o.costUsd)}</td>
                        <td className="py-2.5 pl-2 pr-5 hidden md:table-cell align-top"><ShareBar share={o.share} label={pct(o.share)} /></td>
                      </tr>
                      {open && o.restaurants.map((r) => (
                        <tr key={`${o.owner.id}:${r.id}`} className="border-b border-border-subtle bg-muted/40">
                          <td className="pl-5 pr-2" />
                          <td className="py-2 px-2 pl-8">
                            <button
                              onClick={() => onOpenRestaurant(r.id)}
                              aria-label={t('admin.aiUsage.openRestaurant').replace('{name}', r.name)}
                              className="inline-flex items-center gap-1 text-sm text-foreground hover:text-primary-ink rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              {r.name}
                              <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
                            </button>
                          </td>
                          <td className="py-2 px-2 text-right tabular-nums text-xs text-muted-foreground hidden sm:table-cell">{int(r.calls)}</td>
                          <td className="py-2 px-2 text-right tabular-nums text-xs text-foreground">{usd(r.costUsd)}</td>
                          <td className="pl-2 pr-5 hidden md:table-cell" />
                        </tr>
                      ))}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {summary.owners.length > 0 && (
          <p className="text-[11px] text-muted-foreground mt-3">{t('admin.aiUsage.sharedNote')}</p>
        )}
      </section>

      {/* ── Who spends it: restaurants ───────────────────────────────────── */}
      <section className="card-glass p-5">
        <h2 className="text-base font-bold text-foreground">{t('admin.aiUsage.restaurantsTitle')}</h2>
        <p className="text-xs text-muted-foreground mt-0.5 mb-4">{t('admin.aiUsage.restaurantsSubtitle')}</p>
        <ListSearch
          value={restaurantSearch}
          onChange={setRestaurantSearch}
          placeholder={t('admin.aiUsage.searchRestaurants')}
          count={summary.restaurants.length}
          matches={restaurants.length}
        />
        {summary.restaurants.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">{t('admin.aiUsage.emptyRanking')}</p>
        ) : (
          <div className="-mx-5 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-subtle text-xs text-muted-foreground">
                  <th scope="col" className="text-left font-medium py-2 pl-5 pr-2 w-10"><span className="sr-only">{t('admin.aiUsage.colRank')}</span>#</th>
                  <th scope="col" className="text-left font-medium py-2 px-2">{t('admin.aiUsage.colRestaurant')}</th>
                  <th scope="col" className="text-right font-medium py-2 px-2 hidden sm:table-cell">{t('admin.aiUsage.colCalls')}</th>
                  <th scope="col" className="text-right font-medium py-2 px-2">{t('admin.aiUsage.colCost')}</th>
                  <th scope="col" className="text-left font-medium py-2 pl-2 pr-5 hidden md:table-cell w-48">{t('admin.aiUsage.colShare')}</th>
                </tr>
              </thead>
              <tbody>
                {restaurants.map((r) => (
                  <tr key={r.id} className="border-b border-border-subtle hover:bg-muted/60">
                    <td className="py-2.5 pl-5 pr-2 text-xs text-muted-foreground tabular-nums align-top">{summary.restaurants.indexOf(r) + 1}</td>
                    <td className="py-2.5 px-2 align-top">
                      <button
                        onClick={() => onOpenRestaurant(r.id)}
                        aria-label={t('admin.aiUsage.openRestaurant').replace('{name}', r.name)}
                        className="group text-left rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <span className="flex items-center gap-1 font-semibold text-foreground group-hover:text-primary-ink">
                          {r.name}
                          <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {r.owners.length ? r.owners.map(ownerName).join(', ') : t('admin.aiUsage.noOwner')}
                        </span>
                      </button>
                    </td>
                    <td className="py-2.5 px-2 text-right tabular-nums text-muted-foreground hidden sm:table-cell align-top">
                      {int(r.calls)}
                      {r.failed > 0 && (
                        <span className="block text-[11px] text-warning">{t('admin.aiUsage.failedCount').replace('{n}', int(r.failed))}</span>
                      )}
                    </td>
                    <td className="py-2.5 px-2 text-right tabular-nums font-semibold text-foreground align-top">{usd(r.costUsd)}</td>
                    <td className="py-2.5 pl-2 pr-5 hidden md:table-cell align-top"><ShareBar share={r.share} label={pct(r.share)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {bench && bench.calls > 0 && (
        <p className="text-xs text-muted-foreground px-1">
          {t('admin.aiUsage.benchLine').replace('{cost}', usd(bench.costUsd)).replace('{n}', int(bench.calls))}
        </p>
      )}
    </div>
  );
}

function Figure({
  label, value, caption, lead = false, lamp = false, className = '',
}: {
  label: string; value: string; caption: string; lead?: boolean; lamp?: boolean; className?: string;
}) {
  return (
    <div className={`p-4 md:p-5 min-w-0 ${className}`}>
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {lamp && <span className="w-1.5 h-1.5 rounded-full bg-lamp-warning" aria-hidden="true" />}
        {label}
      </p>
      <p className={`tabular-nums text-foreground mt-1 truncate ${lead ? 'text-3xl font-black' : 'text-xl font-bold'}`}>
        {value}
      </p>
      <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{caption}</p>
    </div>
  );
}

/** The row's share of the period's spend, as a bar and a number. */
function ShareBar({ share, label }: { share: number; label: string }) {
  return (
    <div className="flex items-center gap-2 pt-1">
      <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden" aria-hidden="true">
        <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, share * 100)}%` }} />
      </div>
      <span className="text-xs tabular-nums text-muted-foreground w-10 text-right">{label}</span>
    </div>
  );
}
