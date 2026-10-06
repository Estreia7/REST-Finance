'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import {
  Loader2, ChevronLeft, ChevronRight, Info, Settings2, X, Check,
  CalendarClock, AlertTriangle,
} from 'lucide-react';
import { getVatQuarter, getIrcYear, saveTaxSettings } from '../tax-actions';
import {
  quarterOf, quarterLabel, daysUntil, type Quarter,
} from '@/lib/tax-calc';
import type { SalesMix } from '@/lib/tax-calc';
import { SALES_VAT_CLASSES, DERRAMA_MUNICIPAL_MAX } from '@/lib/tax-rules';
import { formatMoneyExact, formatPercent } from '@/lib/format';
import { useLanguage } from '@/lib/language-context';
import { translateError } from '@/lib/error-messages';
import type { DerramaChoice, MunicipalDerrama, ResolvedDerrama } from '@/lib/derrama';
import type { Municipality } from '@/lib/municipalities';

/**
 * IVA and IRC, as an owner needs to see them.
 *
 * The honest framing matters more here than anywhere else in the app. Sales
 * VAT is the till's own figure wherever the takings were imported from it;
 * the rest is estimated — the split of hand-typed takings across VAT rates,
 * and the VAT rate assumed on purchases, which are recorded as one amount per
 * cost. Each part says which it is. That is enough to answer
 * "roughly what do I owe in November", which is the question that keeps an
 * owner awake, and it is not the return their accountant files. Every screen
 * says so, and none of it is presented as advice.
 */

/** The tax settings as the screen sees them. */
interface TaxSettingsView {
  mix: SalesMix;
  derramaMunicipalRate: number;
  derramaChoice: DerramaChoice;
  isPme: boolean;
}

/** Which council, its rates, and which one the estimate used. */
interface DerramaInfo {
  municipality: Municipality | null;
  resolved: ResolvedDerrama;
  council: MunicipalDerrama | null;
  /** The Tax Authority table read, and whether it is the period's own. */
  table: { year: number; exact: boolean };
  /** The period being estimated. */
  taxYear: number;
  /** Net takings the app holds for the period before; null when none. */
  previousTurnover: number | null;
}

interface VatData {
  year: number;
  quarter: Quarter;
  /** Sales VAT read off the till, per category. */
  tillLines: Array<{ label: string; gross: number; net: number; vat: number; rate: number }>;
  /** Sales VAT estimated from the mix, for takings the till did not break down. */
  salesLines: Array<{ key: string; label: string; rate: number; sharePercent: number; gross: number; net: number; vat: number }>;
  estimatedGross: number;
  purchaseLines: Array<{ labelKey: string; gross: number; vatRate: number; vatCharged: number; vatDeductible: number }>;
  outputVat: number;
  deductibleVat: number;
  balance: number;
  payable: number;
  credit: number;
  deadline: { quarter: number; submit: string; pay: string } | null;
  grossRevenue: number;
  hasData: boolean;
  settings: TaxSettingsView;
}

interface IrcData {
  year: number;
  taxableProfit: number;
  lossesUsed: number;
  taxableIncome: number;
  bands: Array<{ label: string; amount: number; rate: number; tax: number }>;
  collecta: number;
  derramaMunicipal: number;
  autonomousTax: number;
  autonomousLines: Array<{ label: string; base: number; rate: number; tax: number }>;
  totalTax: number;
  balance: number;
  taxDespiteLoss: boolean;
  grossRevenue: number;
  netRevenue: number;
  estimatedGross: number;
  totalCosts: number;
  accountingProfit: number;
  nextYearInstalments: { total: number; perInstalment: number; exempt: boolean };
  hasData: boolean;
  settings: TaxSettingsView;
  derrama: DerramaInfo;
}

export default function EstadoPanel() {
  const { t, language } = useLanguage();
  const now = new Date();
  const [view, setView] = useState<'iva' | 'irc'>('iva');
  const [year, setYear] = useState(now.getUTCFullYear());
  const [quarter, setQuarter] = useState<Quarter>(quarterOf(now));
  const [vat, setVat] = useState<VatData | null>(null);
  const [irc, setIrc] = useState<IrcData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    const job = view === 'iva' ? getVatQuarter(year, quarter) : getIrcYear(year);
    job.then((r) => {
      if (r.success) {
        if (view === 'iva') setVat(r.data as unknown as VatData);
        else setIrc(r.data as unknown as IrcData);
      } else {
        toast.error(translateError(language, r.error));
      }
      setLoading(false);
    });
  }, [view, year, quarter]);

  useEffect(() => { load(); }, [load]);

  const stepQuarter = (delta: number) => {
    let q = quarter + delta;
    let y = year;
    if (q > 4) { q = 1; y += 1; }
    if (q < 1) { q = 4; y -= 1; }
    setQuarter(q as Quarter);
    setYear(y);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 rounded-xl bg-muted w-fit">
          {([['iva', 'IVA'], ['irc', 'IRC']] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setView(value)}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                view === value ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
              aria-pressed={view === value}
            >
              {label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setShowSettings(true)}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground
                     hover:text-foreground px-2 py-1.5 rounded-lg hover:bg-muted transition-colors"
        >
          <Settings2 className="w-3.5 h-3.5" aria-hidden="true" />
          {t('estado.assumptions')}
        </button>
      </div>

      {/* Said once, plainly, and never buried at the bottom. */}
      <div className="rounded-xl border border-info/25 bg-info/5 p-3 flex items-start gap-2.5">
        <Info className="w-4 h-4 text-info shrink-0 mt-0.5" aria-hidden="true" />
        <p className="text-xs text-muted-foreground leading-relaxed">
          {t('estado.disclaimerBefore')}{' '}
          <strong className="text-foreground">{t('estado.disclaimerWord')}</strong>
          {t('estado.disclaimerAfter')}
        </p>
      </div>

      {loading ? (
        <div className="card-glass p-6 flex items-center gap-3 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          {t('estado.calculating')}
        </div>
      ) : view === 'iva' ? (
        <VatView
          data={vat}
          year={year}
          quarter={quarter}
          onStep={stepQuarter}
          onToday={() => { setYear(now.getUTCFullYear()); setQuarter(quarterOf(now)); }}
        />
      ) : (
        <IrcView data={irc} year={year} onYear={setYear} />
      )}

      {showSettings && (
        <SettingsDialog
          settings={(view === 'iva' ? vat?.settings : irc?.settings) ?? null}
          // The council's rates come with the IRC estimate, where they apply.
          derrama={view === 'irc' ? irc?.derrama ?? null : null}
          // The mix only matters while some takings lack the till's detail.
          // Unknown (nothing loaded yet) counts as in use, so it stays editable.
          mixInUse={((view === 'iva' ? vat?.estimatedGross : irc?.estimatedGross) ?? 1) > 0}
          onClose={() => setShowSettings(false)}
          onSave={async (input) => {
            const result = await saveTaxSettings(input);
            if (result.success) {
              toast.success(t('estado.assumptionsSaved'));
              setShowSettings(false);
              load();
            } else {
              toast.error(result.error ? translateError(language, result.error) : t('estado.saveFailed'));
            }
          }}
        />
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────

function VatView({
  data, year, quarter, onStep, onToday,
}: {
  data: VatData | null;
  year: number;
  quarter: Quarter;
  onStep: (delta: number) => void;
  onToday: () => void;
}) {
  const { t, language } = useLanguage();
  const nowQuarter = quarterOf(new Date());
  const isCurrent = year === new Date().getUTCFullYear() && quarter === nowQuarter;
  const hasTill = (data?.tillLines.length ?? 0) > 0;
  const hasEstimate = (data?.estimatedGross ?? 0) > 0;

  return (
    <>
      <div className="card-glass p-4 sm:p-5">
        <div className="flex items-center gap-3">
          <button
            type="button" onClick={() => onStep(-1)}
            className="w-11 h-11 shrink-0 rounded-xl border border-border flex items-center justify-center
                       text-muted-foreground hover:text-foreground hover:bg-muted transition-colors
                       focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={t('estado.previousQuarter')}
          >
            <ChevronLeft className="w-5 h-5" aria-hidden="true" />
          </button>
          <button
            type="button" onClick={() => onStep(1)}
            className="w-11 h-11 shrink-0 rounded-xl border border-border flex items-center justify-center
                       text-muted-foreground hover:text-foreground hover:bg-muted transition-colors
                       focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={t('estado.nextQuarter')}
          >
            <ChevronRight className="w-5 h-5" aria-hidden="true" />
          </button>

          <h3 className="font-bold text-foreground min-w-0 flex-1 truncate">
            {quarterLabel(year, quarter, language)}
          </h3>

          {!isCurrent && (
            <button
              type="button" onClick={onToday}
              className="text-xs font-semibold text-primary hover:underline px-2 py-1 shrink-0"
            >
              {t('estado.currentQuarter')}
            </button>
          )}
        </div>

        {data?.deadline && <DeadlineNotice deadline={data.deadline} />}
      </div>

      {!data?.hasData ? (
        <div className="card-glass p-8 text-center text-sm text-muted-foreground">
          {t('estado.noDataQuarter')}
        </div>
      ) : (
        <>
          <div className="card-glass p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3 mb-1">
              <h4 className="font-semibold text-foreground">{t('estado.outputVatTitle')}</h4>
              <SalesSource hasTill={hasTill} hasEstimate={hasEstimate} />
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              {hasTill
                ? hasEstimate ? t('estado.outputVatHintMixed') : t('estado.outputVatHintTill')
                : t('estado.outputVatHint')}
            </p>

            {/* What the till actually charged, family by family. A menu that
                mixes food and drink shows its blended rate, which is the
                honest figure for it. */}
            {hasTill && (
              <div className="-mx-4 sm:-mx-5 divide-y divide-border-subtle border-y border-border-subtle">
                {data.tillLines.map((line) => (
                  <div key={line.label} className="px-4 sm:px-5 py-2.5 flex items-center gap-3">
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm text-foreground truncate">{line.label}</span>
                      <span className="block text-[11px] text-muted-foreground">
                        IVA {formatRate(line.rate)}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-sm font-semibold text-foreground tabular-nums">
                        {formatMoneyExact(line.vat)}
                      </span>
                      <span className="block text-[11px] text-muted-foreground tabular-nums">
                        {t('estado.outOf')} {formatMoneyExact(line.gross)}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            )}

            {hasTill && hasEstimate && (
              <div className="mt-4 mb-2">
                <p className="text-xs font-semibold text-foreground">
                  {t('estado.estimatedPartTitle')} · {formatMoneyExact(data.estimatedGross)}
                </p>
                <p className="text-[11px] text-muted-foreground">{t('estado.estimatedPartHint')}</p>
              </div>
            )}

            {hasEstimate && (
            <div className="-mx-4 sm:-mx-5 divide-y divide-border-subtle border-y border-border-subtle">
              {data.salesLines.map((line) => (
                <div key={line.key} className="px-4 sm:px-5 py-2.5 flex items-center gap-3">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-foreground truncate">{line.label}</span>
                    <span className="block text-[11px] text-muted-foreground">
                      {formatPercent(line.sharePercent, 0)} {t('estado.ofSales')} · IVA {formatPercent(line.rate, 0)}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-sm font-semibold text-foreground tabular-nums">
                      {formatMoneyExact(line.vat)}
                    </span>
                    <span className="block text-[11px] text-muted-foreground tabular-nums">
                      {t('estado.outOf')} {formatMoneyExact(line.gross)}
                    </span>
                  </span>
                </div>
              ))}
            </div>
            )}

            <div className="pt-3 flex items-baseline justify-between">
              <span className="text-sm font-semibold text-foreground">{t('estado.totalOutput')}</span>
              <span className="font-bold text-foreground tabular-nums">
                {formatMoneyExact(data.outputVat)}
              </span>
            </div>
          </div>

          <div className="card-glass p-4 sm:p-5">
            <h4 className="font-semibold text-foreground mb-1">{t('estado.deductibleVatTitle')}</h4>
            <p className="text-xs text-muted-foreground mb-4">
              {t('estado.deductibleVatHint')}
            </p>

            <div className="-mx-4 sm:-mx-5 divide-y divide-border-subtle border-y border-border-subtle">
              {data.purchaseLines.map((line) => (
                <div key={line.labelKey} className="px-4 sm:px-5 py-2.5 flex items-center gap-3">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-foreground truncate">{t(line.labelKey)}</span>
                    <span className="block text-[11px] text-muted-foreground">
                      {formatMoneyExact(line.gross)} · IVA {formatPercent(line.vatRate, 0)} {t('estado.estimated')}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-semibold text-foreground tabular-nums">
                    {formatMoneyExact(line.vatDeductible)}
                  </span>
                </div>
              ))}
            </div>

            <div className="pt-3 flex items-baseline justify-between">
              <span className="text-sm font-semibold text-foreground">{t('estado.totalDeductible')}</span>
              <span className="font-bold text-foreground tabular-nums">
                {formatMoneyExact(data.deductibleVat)}
              </span>
            </div>
          </div>

          <div className={`card-glass p-5 border ${data.payable > 0 ? 'border-warning/30' : 'border-success/30'}`}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-semibold text-foreground">
                {data.payable > 0 ? t('estado.payableToState') : t('estado.creditToCarry')}
              </span>
              <span className={`text-2xl font-black tabular-nums ${data.payable > 0 ? 'text-foreground' : 'text-green-400'}`}>
                {formatMoneyExact(data.payable > 0 ? data.payable : data.credit)}
              </span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {data.payable > 0
                ? `${formatMoneyExact(data.outputVat)} ${t('estado.balanceOutput')} ${formatMoneyExact(data.deductibleVat)} ${t('estado.balanceDeductible')}`
                : t('estado.creditExplain')}
            </p>
          </div>
        </>
      )}
    </>
  );
}

/**
 * A rate as the till paid it: "13%" when it is a statutory rate, "15,4%"
 * when a category blends two (a menu with food and a drink).
 */
function formatRate(rate: number): string {
  return formatPercent(rate, Math.abs(rate - Math.round(rate)) < 0.15 ? 0 : 1);
}

/** Where the sales VAT figure came from, said in two words beside the title. */
function SalesSource({ hasTill, hasEstimate }: { hasTill: boolean; hasEstimate: boolean }) {
  const { t } = useLanguage();
  const [label, tone] = hasTill
    ? hasEstimate
      ? [t('estado.sourceMixed'), 'border-border text-muted-foreground']
      : [t('estado.sourceTill'), 'border-success text-success']
    : [t('estado.sourceEstimate'), 'border-border text-muted-foreground'];

  return (
    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${tone}`}>
      {label}
    </span>
  );
}

function DeadlineNotice({ deadline }: { deadline: { submit: string; pay: string } }) {
  const { t, language } = useLanguage();
  const days = daysUntil(deadline.submit);
  const past = days < 0;
  const soon = days >= 0 && days <= 15;

  const format = (iso: string) =>
    new Date(`${iso}T00:00:00Z`).toLocaleDateString(language === 'pt' ? 'pt-PT' : 'en-GB', {
      day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
    });

  return (
    <div
      className={`mt-4 rounded-xl p-3 flex items-start gap-2.5 border
        ${past ? 'border-border bg-muted' : soon ? 'border-warning/30 bg-warning/10' : 'border-border-subtle bg-surface'}`}
    >
      <CalendarClock
        className={`w-4 h-4 shrink-0 mt-0.5 ${soon && !past ? 'text-warning' : 'text-muted-foreground'}`}
        aria-hidden="true"
      />
      <div className="text-xs">
        <p className={soon && !past ? 'text-warning font-semibold' : 'text-foreground'}>
          {past
            ? `${t('estado.deadlinePassed')} ${format(deadline.submit)}.`
            : days === 0
            ? t('estado.deadlineToday')
            : `${t('estado.deadlineInDaysBefore')} ${days} ${t('estado.deadlineInDaysAfter')}`}
        </p>
        <p className="text-muted-foreground mt-0.5">
          {t('estado.submitBy')} {format(deadline.submit)} · {t('estado.payBy')} {format(deadline.pay)}
        </p>
      </div>
    </div>
  );
}

function IrcView({
  data, year, onYear,
}: {
  data: IrcData | null;
  year: number;
  onYear: (y: number) => void;
}) {
  const { t } = useLanguage();
  const years = Array.from({ length: 5 }, (_, i) => new Date().getUTCFullYear() - 3 + i);

  return (
    <>
      <div className="card-glass p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-bold text-foreground">{t('estado.ircEstimateTitle')}</h3>
        <select
          value={year}
          onChange={(e) => onYear(Number(e.target.value))}
          className="input-field !py-2 !text-sm !w-[110px]"
          aria-label={t('estado.year')}
        >
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {!data?.hasData ? (
        <div className="card-glass p-8 text-center text-sm text-muted-foreground">
          {t('estado.noDataYear')} {year}.
        </div>
      ) : (
        <>
          <div className="card-glass p-4 sm:p-5">
            <h4 className="font-semibold text-foreground mb-1">{t('estado.toTaxableProfitTitle')}</h4>
            <p className="text-xs text-muted-foreground mb-4">
              {t('estado.toTaxableProfitHint')}
            </p>

            <div className="space-y-1.5 text-sm">
              <Line label={t('estado.salesWithVat')} value={formatMoneyExact(data.grossRevenue)} muted />
              <Line label={t('estado.salesExVat')} value={formatMoneyExact(data.netRevenue)} />
              {data.estimatedGross === 0 && data.grossRevenue > 0 && (
                <p className="text-[11px] text-success">{t('estado.netFromTill')}</p>
              )}
              <Line label={t('estado.costs')} value={`-${formatMoneyExact(data.totalCosts)}`} tone="text-red-400" />
              <div className="pt-1.5 border-t border-border">
                <Line
                  label={t('estado.resultForYear')}
                  value={formatMoneyExact(data.accountingProfit)}
                  tone={data.accountingProfit < 0 ? 'text-red-400' : 'text-green-400'}
                  bold
                />
              </div>
              {data.lossesUsed > 0 && (
                <Line label={t('estado.lossesUsed')} value={`-${formatMoneyExact(data.lossesUsed)}`} muted />
              )}
            </div>
          </div>

          {data.bands.length > 0 && (
            <div className="card-glass p-4 sm:p-5">
              <h4 className="font-semibold text-foreground mb-1">{t('estado.collectaTitle')}</h4>
              <p className="text-xs text-muted-foreground mb-4">
                {t('estado.collectaHintBefore')} {year}{t('estado.collectaHintAfter')}
              </p>
              <div className="space-y-1.5 text-sm">
                {data.bands.map((band) => (
                  <Line
                    key={band.label}
                    label={`${band.label} · ${formatPercent(band.rate, 0)}`}
                    value={formatMoneyExact(band.tax)}
                  />
                ))}
                {data.derramaMunicipal > 0 && (
                  <Line
                    label={`${t('estado.derramaMunicipal')} (${
                      data.derrama.municipality ? `${data.derrama.municipality.name} · ` : ''
                    }${formatPercent(data.derrama.resolved.rate, 2)})`}
                    value={formatMoneyExact(data.derramaMunicipal)}
                  />
                )}
                {/* Said rather than left out, so a zero reads as the council's
                    decision and not as something the app forgot. */}
                {data.derrama.resolved.source === 'none' && data.derrama.municipality && (
                  <Line
                    label={t('estado.derramaNoneShort').replace('{name}', data.derrama.municipality.name)}
                    value={formatMoneyExact(0)}
                  />
                )}
              </div>
            </div>
          )}

          {data.autonomousLines.length > 0 && (
            <div className="card-glass p-4 sm:p-5">
              <h4 className="font-semibold text-foreground mb-1">{t('estado.autonomousTitle')}</h4>
              <p className="text-xs text-muted-foreground mb-4">
                {t('estado.autonomousHint')}
              </p>
              <div className="space-y-1.5 text-sm">
                {data.autonomousLines.map((line) => (
                  <Line
                    key={line.label}
                    label={`${line.label} · ${formatPercent(line.rate, 0)}`}
                    value={formatMoneyExact(line.tax)}
                  />
                ))}
              </div>
            </div>
          )}

          {data.taxDespiteLoss && (
            <div className="rounded-xl border border-warning/30 bg-warning/10 p-3 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" aria-hidden="true" />
              <p className="text-xs text-warning">
                {t('estado.taxDespiteLoss')}
              </p>
            </div>
          )}

          <div className="card-glass p-5 border border-warning/30">
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-semibold text-foreground">{t('estado.ircEstimated')}</span>
              <span className="text-2xl font-black text-foreground tabular-nums">
                {formatMoneyExact(data.totalTax)}
              </span>
            </div>
            {!data.nextYearInstalments.exempt && data.nextYearInstalments.total > 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                {t('estado.instalmentsBefore')} {year + 1} {t('estado.instalmentsMiddle')}{' '}
                <strong className="text-foreground">
                  {formatMoneyExact(data.nextYearInstalments.perInstalment)}
                </strong>{' '}
                {t('estado.instalmentsAfter')}
              </p>
            )}
          </div>
        </>
      )}
    </>
  );
}

function Line({
  label, value, tone = 'text-foreground', bold = false, muted = false,
}: {
  label: string; value: string; tone?: string; bold?: boolean; muted?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className={`text-xs ${bold ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
        {label}
      </span>
      <span className={`tabular-nums ${bold ? 'font-bold' : 'text-sm'} ${muted ? 'text-muted-foreground' : tone}`}>
        {value}
      </span>
    </div>
  );
}

function SettingsDialog({
  settings, derrama: derramaInfo, mixInUse, onClose, onSave,
}: {
  settings: TaxSettingsView | null;
  /** The council and its rates; null outside the IRC view. */
  derrama: DerramaInfo | null;
  /** False when the till covered every sale in view, so the mix changes nothing. */
  mixInUse: boolean;
  onClose: () => void;
  onSave: (input: {
    mix: SalesMix; derramaMunicipalRate: number; derramaChoice: DerramaChoice; isPme: boolean;
  }) => void;
}) {
  const { t } = useLanguage();
  const [mix, setMix] = useState<SalesMix>(
    settings?.mix ?? { food: 72, softDrink: 12, refrigerante: 4, alcohol: 12 }
  );
  const [derrama, setDerrama] = useState(String(settings?.derramaMunicipalRate ?? 1.5));
  const [derramaChoice, setDerramaChoice] = useState<DerramaChoice>(settings?.derramaChoice ?? 'general');
  const [isPme, setIsPme] = useState(settings?.isPme ?? true);

  const total = SALES_VAT_CLASSES.reduce((s, c) => s + (mix[c.key] || 0), 0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog" aria-modal="true" aria-label={t('estado.assumptions')}
        className="relative w-full sm:max-w-md bg-card border border-border rounded-t-2xl sm:rounded-2xl
                   p-5 shadow-modal max-h-[90dvh] overflow-y-auto overscroll-contain
                   pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:pb-5"
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <h4 className="font-bold text-foreground">{t('estado.assumptions')}</h4>
          <button
            type="button" onClick={onClose}
            className="p-1 -m-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
            aria-label={t('estado.close')}
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* Asking for a split the till already gives would be asking the
            owner to guess something we know. Hidden, not deleted: it still
            applies to any day typed in as a single total. */}
        {!mixInUse ? (
          <p className="text-xs text-muted-foreground rounded-xl border border-border p-3">
            {t('estado.mixNotUsed')}
          </p>
        ) : (
        <>
        <p className="text-xs text-muted-foreground mb-4">
          {t('estado.assumptionsHint')}
        </p>

        <div className="space-y-2.5">
          {SALES_VAT_CLASSES.map((cls) => (
            <label key={cls.key} className="block">
              <span className="flex items-baseline justify-between gap-2 mb-1">
                <span className="text-xs text-foreground">{t(`estado.vatClass.${cls.key}.label`)}</span>
                <span className="text-[10px] text-muted-foreground">
                  IVA {cls.band === 'normal' ? '23%' : cls.band === 'intermedia' ? '13%' : '6%'}
                </span>
              </span>
              <span className="flex items-center gap-2">
                <input
                  type="number" min={0} max={100}
                  value={mix[cls.key] ?? 0}
                  onChange={(e) => setMix({ ...mix, [cls.key]: Number(e.target.value) || 0 })}
                  aria-label={t(`estado.vatClass.${cls.key}.label`)}
                  className="input-field !py-1.5 !text-sm w-24"
                />
                <span className="text-xs text-muted-foreground">{t('estado.percentOfSales')}</span>
              </span>
              <span className="block text-[10px] text-muted-foreground mt-1">
                {t(`estado.vatClass.${cls.key}.hint`)}
              </span>
            </label>
          ))}
        </div>

        <p className={`mt-2 text-[11px] ${Math.abs(total - 100) > 0.5 ? 'text-warning' : 'text-muted-foreground'}`}>
          {t('estado.mixTotal')}: {formatPercent(total, 0)}
          {Math.abs(total - 100) > 0.5 && ` — ${t('estado.mixNotHundred')}`}
        </p>
        </>
        )}

        {derramaInfo?.municipality && derramaInfo.council ? (
          <DerramaChooser
            info={derramaInfo}
            choice={derramaChoice}
            onChoice={setDerramaChoice}
            manualRate={derrama}
            onManualRate={setDerrama}
          />
        ) : (
          <label className="block mt-4">
            <span className="text-xs text-muted-foreground block mb-1.5">
              {t('estado.derramaMunicipal')}
              <span className="block text-[10px] opacity-70">
                {derramaInfo
                  ? t('estado.derramaPickMunicipality')
                  : `${t('estado.derramaHintBefore')} ${DERRAMA_MUNICIPAL_MAX}%.`}
              </span>
            </span>
            <span className="flex items-center gap-2">
              <input
                type="number" min={0} max={DERRAMA_MUNICIPAL_MAX} step={0.1}
                value={derrama} onChange={(e) => setDerrama(e.target.value)}
                aria-label={t('estado.derramaMunicipal')}
                className="input-field !py-1.5 !text-sm w-24"
              />
              <span className="text-xs text-muted-foreground">%</span>
            </span>
          </label>
        )}

        <label className="flex items-start gap-2.5 mt-4 cursor-pointer">
          <input
            type="checkbox" checked={isPme} onChange={(e) => setIsPme(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            <span className="block text-sm text-foreground">{t('estado.isPme')}</span>
            <span className="block text-[11px] text-muted-foreground">
              {t('estado.isPmeHint')}
            </span>
          </span>
        </label>

        <button
          type="button"
          onClick={() => onSave({
            mix,
            derramaMunicipalRate: Number(derrama.replace(',', '.')) || 0,
            derramaChoice,
            isPme,
          })}
          className="cta-button w-full mt-5 !py-2.5 !text-sm"
        >
          <Check className="w-4 h-4" aria-hidden="true" />
          {t('estado.save')}
        </button>
      </div>
    </div>
  );
}

/**
 * The council's own rates, from the Tax Authority's table, to pick the one
 * that applies. The general rate is the default because it never understates
 * the bill; a reduced rate or exemption is the owner's call, since most turn
 * on conditions only they can confirm. Where the condition is plain turnover,
 * the app's own figure for the previous year is put next to it.
 */
function DerramaChooser({
  info, choice, onChoice, manualRate, onManualRate,
}: {
  info: DerramaInfo;
  choice: DerramaChoice;
  onChoice: (choice: DerramaChoice) => void;
  manualRate: string;
  onManualRate: (rate: string) => void;
}) {
  const { t } = useLanguage();
  const { municipality, council, table, taxYear, previousTurnover, resolved } = info;
  if (!municipality || !council) return null;

  const source = t('estado.derramaSource').replace('{year}', String(table.year)) +
    (table.exact ? '' : ` ${t('estado.derramaSourceNotYet').replace('{year}', String(taxYear))}`);

  return (
    <fieldset className="mt-4">
      <legend className="text-xs text-muted-foreground mb-1.5">
        {t('estado.derramaMunicipal')} · <strong className="font-semibold text-foreground">{municipality.name}</strong>
        <span className="block text-[10px] opacity-70">{source}</span>
      </legend>

      {council.generalRate === null ? (
        <p className="rounded-xl border border-border p-3 text-xs text-foreground">
          {t('estado.derramaNone')
            .replace('{name}', municipality.name)
            .replace('{year}', String(table.year))}
        </p>
      ) : (
        <div className="space-y-1.5" role="radiogroup">
          <DerramaOption
            checked={choice === 'general' || (resolved.choiceOutdated && choice !== 'manual')}
            onSelect={() => onChoice('general')}
            title={t('estado.derramaGeneral')}
            rate={formatPercent(council.generalRate, 2)}
          />
          {council.rules.map((rule, i) => {
            const value = `rule:${table.year}:${i}` as DerramaChoice;
            const met =
              rule.turnoverMax === null || previousTurnover === null ? null : previousTurnover <= rule.turnoverMax;
            return (
              <DerramaOption
                key={value}
                checked={choice === value}
                onSelect={() => onChoice(value)}
                title={rule.kind === 'exempt' ? t('estado.derramaExempt') : t('estado.derramaReduced')}
                rate={rule.kind === 'exempt' ? formatPercent(0, 0) : formatPercent(rule.rate, 2)}
                criterion={rule.criterion ? t(`estado.derramaCriterion.${rule.criterion}`) : null}
                scope={rule.scope}
                note={
                  rule.turnoverMax === null ? null
                    : met === null
                      ? { tone: 'muted', text: t('estado.derramaNoTurnover').replace('{year}', String(taxYear - 1)) }
                      : {
                          tone: met ? 'ok' : 'muted',
                          text: t(met ? 'estado.derramaTurnoverMet' : 'estado.derramaTurnoverNotMet')
                            .replace('{year}', String(taxYear - 1))
                            .replace('{amount}', formatMoneyExact(previousTurnover ?? 0)),
                        }
                }
              />
            );
          })}
          <DerramaOption
            checked={choice === 'manual'}
            onSelect={() => onChoice('manual')}
            title={t('estado.derramaManual')}
          >
            {choice === 'manual' && (
              <span className="mt-2 flex items-center gap-2">
                <input
                  type="text" inputMode="decimal"
                  value={manualRate} onChange={(e) => onManualRate(e.target.value)}
                  aria-label={t('estado.derramaManual')}
                  className="input-field !py-1.5 !text-sm !w-24"
                />
                <span className="text-xs text-muted-foreground">%</span>
              </span>
            )}
          </DerramaOption>
        </div>
      )}

      {resolved.choiceOutdated && (
        <p className="mt-2 text-[11px] text-warning">{t('estado.derramaChoiceOutdated')}</p>
      )}
    </fieldset>
  );
}

function DerramaOption({
  checked, onSelect, title, rate, criterion, scope, note, children,
}: {
  checked: boolean;
  onSelect: () => void;
  title: string;
  rate?: string;
  criterion?: string | null;
  scope?: string;
  note?: { tone: 'ok' | 'muted'; text: string } | null;
  children?: React.ReactNode;
}) {
  const { t } = useLanguage();
  const [expanded, setExpanded] = useState(false);
  const long = (scope?.length ?? 0) > 160;

  return (
    <label
      className={`flex items-start gap-2.5 rounded-xl border p-3 cursor-pointer transition-colors ${
        checked ? 'border-primary/60 bg-primary/5' : 'border-border hover:bg-muted/50'
      }`}
    >
      <input type="radio" name="derramaChoice" checked={checked} onChange={onSelect} className="mt-0.5 accent-primary" />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-3">
          <span className="text-sm text-foreground">
            {title}
            {criterion && <span className="text-muted-foreground"> · {criterion}</span>}
          </span>
          {rate && <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">{rate}</span>}
        </span>
        {scope && (
          // The circular's wording, untranslated: it is the legal condition.
          <span lang="pt" className={`block mt-1 text-[11px] text-muted-foreground ${long && !expanded ? 'line-clamp-3' : ''}`}>
            {scope}
          </span>
        )}
        {long && (
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); setExpanded((v) => !v); }}
            className="mt-0.5 text-[11px] font-semibold text-primary-ink hover:underline"
            aria-expanded={expanded}
          >
            {expanded ? t('estado.derramaShowLess') : t('estado.derramaShowMore')}
          </button>
        )}
        {note && (
          <span className={`block mt-1 text-[11px] ${note.tone === 'ok' ? 'text-green-400' : 'text-muted-foreground'}`}>
            {note.text}
          </span>
        )}
        {children}
      </span>
    </label>
  );
}
