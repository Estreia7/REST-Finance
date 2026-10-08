'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, RefreshCw, Brain, AlertTriangle, CheckCircle2, ArrowRight, Wrench, Link2 } from 'lucide-react';
import { useLanguage } from '@/lib/language-context';
import { translateError } from '@/lib/error-messages';
import { formatMoney } from '@/lib/format';
import ListSearch, { matchesSearch } from '@/app/dashboard/components/ListSearch';
import type { BrainSummary } from '@/lib/brain-summary';
import { getRestaurantBrain, recomputeRestaurantCosts } from '../brain-actions';

type BrainData = BrainSummary & { windowDays: number };

const FIELD_KEY: Record<string, string> = {
  category: 'admin.brain.fieldCategory',
  pack: 'admin.brain.fieldPack',
  unitPrice: 'admin.brain.fieldUnitPrice',
  vendor: 'admin.brain.fieldVendor',
  date: 'admin.brain.fieldDate',
  total: 'admin.brain.fieldTotal',
  type: 'admin.brain.fieldType',
};

const BY_KEY: Record<string, string> = {
  owner: 'admin.brain.byOwner',
  memory: 'admin.brain.byMemory',
  check: 'admin.brain.byCheck',
};

/** The longest list rendered at once; the rest is reached by searching. */
const SHOWN = 150;

/**
 * One restaurant's brain, for the administrator.
 *
 * Read top to bottom it answers the questions asked when a client says "the
 * scanner got it wrong": which costs are wrong now, is the reading getting
 * better week by week, what kind of mistake it makes, and what it has learned.
 */
export default function RestaurantBrainPanel({ restaurantId }: { restaurantId: string }) {
  const { t, language } = useLanguage();
  const locale = language === 'pt' ? 'pt-PT' : 'en-GB';
  const [data, setData] = useState<BrainData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recomputing, setRecomputing] = useState(false);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const result = await getRestaurantBrain(restaurantId);
    if (result.success && result.data) {
      setData(result.data as BrainData);
      setError(null);
    } else {
      setError(result.error ?? 'errors.generic');
    }
    setLoading(false);
  }, [restaurantId]);

  useEffect(() => { load(); }, [load]);

  const recompute = async () => {
    setRecomputing(true);
    const result = await recomputeRestaurantCosts(restaurantId);
    setRecomputing(false);
    if (!result.success || !result.data) {
      toast.error(translateError(language, result.error));
      return;
    }
    toast.success(result.data.changed > 0
      ? t('admin.brain.recomputed').replace('{n}', String(result.data.changed))
      : t('admin.brain.recomputedNone'));
    load();
  };

  const pct = (v: number | null) =>
    v === null ? '—' : new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }).format(v);
  const date = (d: Date | string) =>
    new Date(d).toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: '2-digit' });
  const perUnit = (v: number | null, unit: string) => (v === null ? '—' : `${formatMoney(v, { decimals: 2 })}/${unit}`);

  /** A stored value, as the person reading the table would write it. */
  const shownValue = (field: string, value: string | null) => {
    if (value === null || value === '') return t('admin.brain.nothingRead');
    if (field === 'pack' && value === 'un') return t('admin.brain.packages');
    if (field === 'total' || field === 'unitPrice') {
      const n = Number(value);
      return Number.isFinite(n) ? formatMoney(n, { decimals: 2 }) : value;
    }
    if (field === 'date') return date(value);
    return value;
  };

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-16" role="status" aria-label={t('admin.brain.loading')}>
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" aria-hidden="true" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="card-glass p-6 flex flex-col items-start gap-3">
        <p className="text-sm text-foreground">{translateError(language, error)}</p>
        <button
          onClick={load}
          className="px-3 py-1.5 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {t('admin.brain.refresh')}
        </button>
      </div>
    );
  }

  if (!data) return null;
  const { knowledge, efficacy, byField, recent, entries, attention } = data;

  const entriesShown = entries.filter((e) =>
    matchesSearch(search, e.sourceName, e.vendorName, e.categoryName, ...e.ingredients),
  );
  const maxWeek = Math.max(1, ...efficacy.weekly.map((w) => w.lines));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {t('admin.brain.window').replace('{n}', String(data.windowDays))}
        </p>
        <button
          onClick={load}
          aria-label={t('admin.brain.refresh')}
          title={t('admin.brain.refresh')}
          className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
        </button>
      </div>

      {/* ── The figures ─────────────────────────────────────────────────── */}
      <section className={`card-glass grid grid-cols-2 md:grid-cols-4 transition-opacity ${loading ? 'opacity-60' : ''}`}>
        <Figure
          className="border-r border-b md:border-b-0 border-border-subtle"
          label={t('admin.brain.figLines')}
          value={efficacy.lines.toLocaleString(locale)}
          caption={t('admin.brain.figLinesCaption')
            .replace('{reviewed}', String(efficacy.reviewed))
            .replace('{scans}', String(efficacy.scans))}
        />
        <Figure
          className="border-b md:border-b-0 md:border-r border-border-subtle"
          label={t('admin.brain.figMemory')}
          value={pct(efficacy.memoryRate)}
          caption={t('admin.brain.figMemoryCaption')}
        />
        <Figure
          className="border-r border-border-subtle"
          label={t('admin.brain.figAccepted')}
          value={pct(efficacy.acceptedRate)}
          caption={efficacy.acceptedRate === null ? t('admin.brain.figAcceptedNone') : t('admin.brain.figAcceptedCaption')}
        />
        <Figure
          label={t('admin.brain.figKnown')}
          value={knowledge.wordings.toLocaleString(locale)}
          caption={t('admin.brain.figKnownCaption')
            .replace('{pack}', String(knowledge.withPack))
            .replace('{linked}', String(knowledge.linked))}
        />
      </section>

      {/* ── Costs that disagree with their invoices ─────────────────────── */}
      <section className="card-glass p-5">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div>
            <h3 className="text-base font-bold text-foreground">{t('admin.brain.attentionTitle')}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{t('admin.brain.attentionSubtitle')}</p>
          </div>
          {attention.some((a) => a.kind === 'wrong') && (
            <button
              onClick={recompute}
              disabled={recomputing}
              className="cta-button !py-1.5 !px-3 !text-xs"
            >
              {recomputing
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                : <Wrench className="w-3.5 h-3.5" aria-hidden="true" />}
              {recomputing ? t('admin.brain.recomputing') : t('admin.brain.recompute')}
            </button>
          )}
        </div>
        {attention.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-success">
            <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
            {t('admin.brain.attentionNone')}
          </p>
        ) : (
          <div className="-mx-5 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-subtle text-xs text-muted-foreground">
                  <th scope="col" className="text-left font-medium py-2 pl-5 pr-2">{t('admin.brain.colIngredient')}</th>
                  <th scope="col" className="text-right font-medium py-2 px-2">{t('admin.brain.colNow')}</th>
                  <th scope="col" className="text-right font-medium py-2 px-2">{t('admin.brain.colShould')}</th>
                  <th scope="col" className="text-left font-medium py-2 pl-2 pr-5 hidden md:table-cell">{t('admin.brain.colFrom')}</th>
                </tr>
              </thead>
              <tbody>
                {attention.map((a) => (
                  <tr key={a.ingredientId} className="border-b border-border-subtle">
                    <td className="py-2.5 pl-5 pr-2">
                      <span className="flex items-center gap-1.5 font-semibold text-foreground">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-warning" aria-hidden="true" />
                        {a.name}
                      </span>
                    </td>
                    <td className="py-2.5 px-2 text-right tabular-nums text-muted-foreground line-through decoration-warning/60">
                      {perUnit(a.current, a.unit)}
                    </td>
                    <td className="py-2.5 px-2 text-right tabular-nums font-semibold text-foreground">
                      {a.kind === 'wrong' ? perUnit(a.expected, a.unit) : '—'}
                    </td>
                    <td className="py-2.5 pl-2 pr-5 text-xs text-muted-foreground hidden md:table-cell">
                      {a.kind === 'wrong' ? a.productName : t('admin.brain.unpriceable').replace('{unit}', a.unit)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* ── Week by week ───────────────────────────────────────────────── */}
        <section className="card-glass p-5">
          <h3 className="text-base font-bold text-foreground">{t('admin.brain.weeklyTitle')}</h3>
          <p className="text-xs text-muted-foreground mt-0.5 mb-3">{t('admin.brain.weeklySubtitle')}</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground mb-3" aria-hidden="true">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-lamp-success" />{t('admin.brain.legendMemory')}</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-primary" />{t('admin.brain.legendOwner')}</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-muted-foreground/30" />{t('admin.brain.legendOther')}</span>
          </div>
          {efficacy.weekly.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">{t('admin.brain.weeklyEmpty')}</p>
          ) : (
            <ul className="space-y-2">
              {efficacy.weekly.map((w) => {
                const other = Math.max(0, w.lines - w.memory - w.owner);
                const label = t('admin.brain.weekOf').replace('{date}', date(w.week));
                return (
                  <li key={w.week} className="grid grid-cols-[5.5rem_1fr_3.5rem] items-center gap-2 text-xs">
                    <span className="text-muted-foreground tabular-nums">{date(w.week)}</span>
                    <div
                      className="flex h-3 rounded-full overflow-hidden bg-muted"
                      style={{ width: `${(w.lines / maxWeek) * 100}%` }}
                      role="img"
                      aria-label={`${label}: ${w.memory} ${t('admin.brain.legendMemory')}, ${w.owner} ${t('admin.brain.legendOwner')}, ${other} ${t('admin.brain.legendOther')}`}
                    >
                      <span className="bg-lamp-success" style={{ width: `${(w.memory / w.lines) * 100}%` }} />
                      <span className="bg-primary" style={{ width: `${(w.owner / w.lines) * 100}%` }} />
                      <span className="bg-muted-foreground/30" style={{ width: `${(other / w.lines) * 100}%` }} />
                    </div>
                    <span className="text-right tabular-nums text-muted-foreground">
                      {t('admin.brain.weekLines').replace('{n}', String(w.lines))}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* ── What the reader gets wrong ─────────────────────────────────── */}
        <section className="card-glass p-5">
          <h3 className="text-base font-bold text-foreground">{t('admin.brain.fieldsTitle')}</h3>
          <p className="text-xs text-muted-foreground mt-0.5 mb-3">{t('admin.brain.fieldsSubtitle')}</p>
          {byField.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 max-w-prose">{t('admin.brain.fieldsEmpty')}</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-subtle text-xs text-muted-foreground">
                  <th scope="col" className="text-left font-medium py-2 pr-2">{t('admin.brain.colField')}</th>
                  <th scope="col" className="text-right font-medium py-2 px-2">{t('admin.brain.byOwner')}</th>
                  <th scope="col" className="text-right font-medium py-2 px-2">{t('admin.brain.byMemory')}</th>
                  <th scope="col" className="text-right font-medium py-2 pl-2">{t('admin.brain.byCheck')}</th>
                </tr>
              </thead>
              <tbody>
                {byField.map((f) => (
                  <tr key={f.field} className="border-b border-border-subtle last:border-0">
                    <td className="py-2 pr-2 text-foreground">{FIELD_KEY[f.field] ? t(FIELD_KEY[f.field]) : f.field}</td>
                    <td className="py-2 px-2 text-right tabular-nums font-semibold text-foreground">{f.owner || '—'}</td>
                    <td className="py-2 px-2 text-right tabular-nums text-muted-foreground">{f.memory || '—'}</td>
                    <td className="py-2 pl-2 text-right tabular-nums text-muted-foreground">{f.check || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      {/* ── Recent corrections ────────────────────────────────────────────── */}
      {recent.length > 0 && (
        <section className="card-glass p-5">
          <h3 className="text-base font-bold text-foreground">{t('admin.brain.recentTitle')}</h3>
          <p className="text-xs text-muted-foreground mt-0.5 mb-4">{t('admin.brain.recentSubtitle')}</p>
          <div className="-mx-5 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-subtle text-xs text-muted-foreground">
                  <th scope="col" className="text-left font-medium py-2 pl-5 pr-2 hidden sm:table-cell">{t('admin.brain.colDate')}</th>
                  <th scope="col" className="text-left font-medium py-2 px-2">{t('admin.brain.colLine')}</th>
                  <th scope="col" className="text-left font-medium py-2 px-2">{t('admin.brain.colRead')} → {t('admin.brain.colSaved')}</th>
                  <th scope="col" className="text-left font-medium py-2 pl-2 pr-5 hidden md:table-cell">{t('admin.brain.colBy')}</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((c, i) => (
                  <tr key={`${c.receiptScanId}:${c.productName}:${c.field}:${i}`} className="border-b border-border-subtle align-top">
                    <td className="py-2.5 pl-5 pr-2 text-xs text-muted-foreground tabular-nums whitespace-nowrap hidden sm:table-cell">{date(c.createdAt)}</td>
                    <td className="py-2.5 px-2">
                      <span className="block text-foreground [overflow-wrap:anywhere]">{c.productName ?? t('admin.brain.invoiceItself')}</span>
                      <span className="block text-xs text-muted-foreground">
                        {FIELD_KEY[c.field] ? t(FIELD_KEY[c.field]) : c.field}
                        {c.vendorName && ` · ${c.vendorName}`}
                      </span>
                    </td>
                    <td className="py-2.5 px-2">
                      <span className="inline-flex flex-wrap items-center gap-1.5 text-xs">
                        <span className="text-muted-foreground line-through decoration-warning/60">{shownValue(c.field, c.readValue)}</span>
                        <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" aria-hidden="true" />
                        <span className="font-semibold text-foreground">{shownValue(c.field, c.savedValue)}</span>
                      </span>
                    </td>
                    <td className="py-2.5 pl-2 pr-5 text-xs text-muted-foreground hidden md:table-cell">
                      {BY_KEY[c.fixedBy] ? t(BY_KEY[c.fixedBy]) : c.fixedBy}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── What it knows ────────────────────────────────────────────────── */}
      <section className="card-glass p-5">
        <h3 className="flex items-center gap-2 text-base font-bold text-foreground">
          <Brain className="w-4 h-4 text-success" aria-hidden="true" />
          {t('admin.brain.knowsTitle')}
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5 mb-4">{t('admin.brain.knowsSubtitle')}</p>
        <ListSearch
          value={search}
          onChange={setSearch}
          placeholder={t('admin.brain.knowsSearch')}
          count={entries.length}
          matches={entriesShown.length}
        />
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">{t('admin.brain.knowsEmpty')}</p>
        ) : (
          <ul className="divide-y divide-border-subtle -mx-5">
            {entriesShown.slice(0, SHOWN).map((e) => (
              <li key={`${e.sourceName}|${e.vendorName ?? ''}`} className="px-5 py-2.5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <div className="min-w-0">
                  <p className="text-sm text-foreground uppercase [overflow-wrap:anywhere]">{e.sourceName}</p>
                  <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                    {e.vendorName ?? t('admin.brain.anyVendor')}
                    {e.ingredients.length > 0 && (
                      <span className="inline-flex items-center gap-1 text-foreground">
                        <Link2 className="w-3 h-3 text-muted-foreground" aria-hidden="true" />
                        {e.ingredients.join(', ')}
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                  {e.notIngredient && (
                    <span className="rounded-md bg-muted px-1.5 py-0.5 text-muted-foreground">{t('admin.brain.notIngredient')}</span>
                  )}
                  {e.categoryName && (
                    <span className="rounded-md bg-muted px-1.5 py-0.5 text-foreground">{e.categoryName}</span>
                  )}
                  {e.pack && (
                    <span className="rounded-md bg-success/10 px-1.5 py-0.5 text-success tabular-nums">
                      {e.pack === 'un' ? t('admin.brain.packages') : e.pack}
                    </span>
                  )}
                  {e.confirmations > 0 && (
                    <span className="text-muted-foreground tabular-nums">
                      {t('admin.brain.confirmations').replace('{n}', String(e.confirmations))}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {entriesShown.length > SHOWN && (
          <p className="text-[11px] text-muted-foreground mt-3">{t('admin.brain.showingFirst').replace('{n}', String(SHOWN))}</p>
        )}
      </section>
    </div>
  );
}

function Figure({ label, value, caption, className = '' }: { label: string; value: string; caption: string; className?: string }) {
  return (
    <div className={`p-4 md:p-5 min-w-0 ${className}`}>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="text-xl md:text-2xl font-bold tabular-nums text-foreground mt-1 truncate">{value}</p>
      <p className="text-[11px] leading-snug text-muted-foreground mt-0.5">{caption}</p>
    </div>
  );
}
