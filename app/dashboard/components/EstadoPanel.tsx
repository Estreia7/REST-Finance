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

/**
 * IVA and IRC, as an owner needs to see them.
 *
 * The honest framing matters more here than anywhere else in the app. These
 * are estimates built on assumptions — the split of takings across VAT rates,
 * and the VAT rate assumed on purchases — because the underlying records hold
 * one gross figure per day and one amount per cost. That is enough to answer
 * "roughly what do I owe in November", which is the question that keeps an
 * owner awake, and it is not the return their accountant files. Every screen
 * says so, and none of it is presented as advice.
 */

interface VatData {
  year: number;
  quarter: Quarter;
  salesLines: Array<{ key: string; label: string; rate: number; sharePercent: number; gross: number; net: number; vat: number }>;
  purchaseLines: Array<{ label: string; gross: number; vatRate: number; vatCharged: number; vatDeductible: number }>;
  outputVat: number;
  deductibleVat: number;
  balance: number;
  payable: number;
  credit: number;
  deadline: { quarter: number; submit: string; pay: string } | null;
  grossRevenue: number;
  hasData: boolean;
  settings: { mix: SalesMix; derramaMunicipalRate: number; isPme: boolean };
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
  totalCosts: number;
  accountingProfit: number;
  nextYearInstalments: { total: number; perInstalment: number; exempt: boolean };
  hasData: boolean;
  settings: { mix: SalesMix; derramaMunicipalRate: number; isPme: boolean };
}

export default function EstadoPanel() {
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
        toast.error(r.error);
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
          Pressupostos
        </button>
      </div>

      {/* Said once, plainly, and never buried at the bottom. */}
      <div className="rounded-xl border border-info/25 bg-info/5 p-3 flex items-start gap-2.5">
        <Info className="w-4 h-4 text-info shrink-0 mt-0.5" aria-hidden="true" />
        <p className="text-xs text-muted-foreground leading-relaxed">
          Estes valores são uma <strong className="text-foreground">estimativa</strong>, calculada
          a partir das vendas e custos que registou. Servem para saber o que aí vem, não
          substituem a declaração — quem a entrega é o seu contabilista.
        </p>
      </div>

      {loading ? (
        <div className="card-glass p-6 flex items-center gap-3 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          A calcular...
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
          onClose={() => setShowSettings(false)}
          onSave={async (input) => {
            const result = await saveTaxSettings(input);
            if (result.success) {
              toast.success('Pressupostos guardados');
              setShowSettings(false);
              load();
            } else {
              toast.error(result.error || 'Não foi possível guardar');
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
  const nowQuarter = quarterOf(new Date());
  const isCurrent = year === new Date().getUTCFullYear() && quarter === nowQuarter;

  return (
    <>
      <div className="card-glass p-4 sm:p-5">
        <div className="flex items-center gap-3">
          <button
            type="button" onClick={() => onStep(-1)}
            className="w-11 h-11 shrink-0 rounded-xl border border-border flex items-center justify-center
                       text-muted-foreground hover:text-foreground hover:bg-muted transition-colors
                       focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Trimestre anterior"
          >
            <ChevronLeft className="w-5 h-5" aria-hidden="true" />
          </button>
          <button
            type="button" onClick={() => onStep(1)}
            className="w-11 h-11 shrink-0 rounded-xl border border-border flex items-center justify-center
                       text-muted-foreground hover:text-foreground hover:bg-muted transition-colors
                       focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Trimestre seguinte"
          >
            <ChevronRight className="w-5 h-5" aria-hidden="true" />
          </button>

          <h3 className="font-bold text-foreground min-w-0 flex-1 truncate">
            {quarterLabel(year, quarter, 'pt')}
          </h3>

          {!isCurrent && (
            <button
              type="button" onClick={onToday}
              className="text-xs font-semibold text-primary hover:underline px-2 py-1 shrink-0"
            >
              Trimestre atual
            </button>
          )}
        </div>

        {data?.deadline && <DeadlineNotice deadline={data.deadline} />}
      </div>

      {!data?.hasData ? (
        <div className="card-glass p-8 text-center text-sm text-muted-foreground">
          Sem vendas nem custos registados neste trimestre.
        </div>
      ) : (
        <>
          <div className="card-glass p-4 sm:p-5">
            <h4 className="font-semibold text-foreground mb-1">IVA liquidado</h4>
            <p className="text-xs text-muted-foreground mb-4">
              O que cobrou aos clientes. A repartição por taxa vem dos pressupostos
              que definiu — corrija-a se não bater certo com a sua casa.
            </p>

            <div className="-mx-4 sm:-mx-5 divide-y divide-border-subtle border-y border-border-subtle">
              {data.salesLines.map((line) => (
                <div key={line.key} className="px-4 sm:px-5 py-2.5 flex items-center gap-3">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-foreground truncate">{line.label}</span>
                    <span className="block text-[11px] text-muted-foreground">
                      {formatPercent(line.sharePercent, 0)} das vendas · IVA {formatPercent(line.rate, 0)}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-sm font-semibold text-foreground tabular-nums">
                      {formatMoneyExact(line.vat)}
                    </span>
                    <span className="block text-[11px] text-muted-foreground tabular-nums">
                      de {formatMoneyExact(line.gross)}
                    </span>
                  </span>
                </div>
              ))}
            </div>

            <div className="pt-3 flex items-baseline justify-between">
              <span className="text-sm font-semibold text-foreground">Total liquidado</span>
              <span className="font-bold text-foreground tabular-nums">
                {formatMoneyExact(data.outputVat)}
              </span>
            </div>
          </div>

          <div className="card-glass p-4 sm:p-5">
            <h4 className="font-semibold text-foreground mb-1">IVA dedutível</h4>
            <p className="text-xs text-muted-foreground mb-4">
              O que pagou aos fornecedores e pode recuperar. As mercadorias para revenda
              dão dedução total; representação e deslocações não dão nenhuma.
            </p>

            <div className="-mx-4 sm:-mx-5 divide-y divide-border-subtle border-y border-border-subtle">
              {data.purchaseLines.map((line) => (
                <div key={line.label} className="px-4 sm:px-5 py-2.5 flex items-center gap-3">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-foreground truncate">{line.label}</span>
                    <span className="block text-[11px] text-muted-foreground">
                      {formatMoneyExact(line.gross)} · IVA {formatPercent(line.vatRate, 0)} estimado
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-semibold text-foreground tabular-nums">
                    {formatMoneyExact(line.vatDeductible)}
                  </span>
                </div>
              ))}
            </div>

            <div className="pt-3 flex items-baseline justify-between">
              <span className="text-sm font-semibold text-foreground">Total dedutível</span>
              <span className="font-bold text-foreground tabular-nums">
                {formatMoneyExact(data.deductibleVat)}
              </span>
            </div>
          </div>

          <div className={`card-glass p-5 border ${data.payable > 0 ? 'border-warning/30' : 'border-success/30'}`}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-semibold text-foreground">
                {data.payable > 0 ? 'A entregar ao Estado' : 'Crédito a reportar'}
              </span>
              <span className={`text-2xl font-black tabular-nums ${data.payable > 0 ? 'text-foreground' : 'text-green-400'}`}>
                {formatMoneyExact(data.payable > 0 ? data.payable : data.credit)}
              </span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {data.payable > 0
                ? `${formatMoneyExact(data.outputVat)} liquidado menos ${formatMoneyExact(data.deductibleVat)} dedutível.`
                : 'Pagou mais IVA do que cobrou. O crédito transita para os períodos seguintes.'}
            </p>
          </div>
        </>
      )}
    </>
  );
}

function DeadlineNotice({ deadline }: { deadline: { submit: string; pay: string } }) {
  const days = daysUntil(deadline.submit);
  const past = days < 0;
  const soon = days >= 0 && days <= 15;

  const format = (iso: string) =>
    new Date(`${iso}T00:00:00Z`).toLocaleDateString('pt-PT', {
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
            ? `O prazo terminou a ${format(deadline.submit)}.`
            : days === 0
            ? 'A declaração entrega-se hoje.'
            : `Faltam ${days} dias para entregar a declaração.`}
        </p>
        <p className="text-muted-foreground mt-0.5">
          Declaração até {format(deadline.submit)} · pagamento até {format(deadline.pay)}
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
  const years = Array.from({ length: 5 }, (_, i) => new Date().getUTCFullYear() - 3 + i);

  return (
    <>
      <div className="card-glass p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-bold text-foreground">Estimativa de IRC</h3>
        <select
          value={year}
          onChange={(e) => onYear(Number(e.target.value))}
          className="input-field !py-2 !text-sm !w-[110px]"
          aria-label="Ano"
        >
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {!data?.hasData ? (
        <div className="card-glass p-8 text-center text-sm text-muted-foreground">
          Sem vendas nem custos registados em {year}.
        </div>
      ) : (
        <>
          <div className="card-glass p-4 sm:p-5">
            <h4 className="font-semibold text-foreground mb-1">Do resultado ao lucro tributável</h4>
            <p className="text-xs text-muted-foreground mb-4">
              O IRC incide sobre o lucro sem IVA — o IVA cobrado nunca foi dinheiro seu.
            </p>

            <div className="space-y-1.5 text-sm">
              <Line label="Vendas (com IVA)" value={formatMoneyExact(data.grossRevenue)} muted />
              <Line label="Vendas sem IVA" value={formatMoneyExact(data.netRevenue)} />
              <Line label="Custos" value={`-${formatMoneyExact(data.totalCosts)}`} tone="text-red-400" />
              <div className="pt-1.5 border-t border-border">
                <Line
                  label="Resultado do exercício"
                  value={formatMoneyExact(data.accountingProfit)}
                  tone={data.accountingProfit < 0 ? 'text-red-400' : 'text-green-400'}
                  bold
                />
              </div>
              {data.lossesUsed > 0 && (
                <Line label="Prejuízos anteriores usados" value={`-${formatMoneyExact(data.lossesUsed)}`} muted />
              )}
            </div>
          </div>

          {data.bands.length > 0 && (
            <div className="card-glass p-4 sm:p-5">
              <h4 className="font-semibold text-foreground mb-1">Colecta</h4>
              <p className="text-xs text-muted-foreground mb-4">
                Em {year}, a taxa reduzida aplica-se aos primeiros 50.000 € de matéria colectável.
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
                  <Line label="Derrama municipal" value={formatMoneyExact(data.derramaMunicipal)} />
                )}
              </div>
            </div>
          )}

          {data.autonomousLines.length > 0 && (
            <div className="card-glass p-4 sm:p-5">
              <h4 className="font-semibold text-foreground mb-1">Tributações autónomas</h4>
              <p className="text-xs text-muted-foreground mb-4">
                Pagam-se sobre a despesa, haja lucro ou não.
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
                O ano fechou com prejuízo, mas ainda assim há imposto a pagar sobre as
                tributações autónomas.
              </p>
            </div>
          )}

          <div className="card-glass p-5 border border-warning/30">
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-semibold text-foreground">IRC estimado</span>
              <span className="text-2xl font-black text-foreground tabular-nums">
                {formatMoneyExact(data.totalTax)}
              </span>
            </div>
            {!data.nextYearInstalments.exempt && data.nextYearInstalments.total > 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                Com base nisto, os pagamentos por conta de {year + 1} seriam de{' '}
                <strong className="text-foreground">
                  {formatMoneyExact(data.nextYearInstalments.perInstalment)}
                </strong>{' '}
                em julho, setembro e dezembro.
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
  settings, onClose, onSave,
}: {
  settings: { mix: SalesMix; derramaMunicipalRate: number; isPme: boolean } | null;
  onClose: () => void;
  onSave: (input: {
    mix: SalesMix; derramaMunicipalRate: number; isPme: boolean;
  }) => void;
}) {
  const [mix, setMix] = useState<SalesMix>(
    settings?.mix ?? { food: 72, softDrink: 12, refrigerante: 4, alcohol: 12 }
  );
  const [derrama, setDerrama] = useState(String(settings?.derramaMunicipalRate ?? 1.5));
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
        role="dialog" aria-modal="true" aria-label="Pressupostos"
        className="relative w-full sm:max-w-md bg-card border border-border rounded-t-2xl sm:rounded-2xl
                   p-5 shadow-modal max-h-[90dvh] overflow-y-auto overscroll-contain
                   pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:pb-5"
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <h4 className="font-bold text-foreground">Pressupostos</h4>
          <button
            type="button" onClick={onClose}
            className="p-1 -m-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
            aria-label="Fechar"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <p className="text-xs text-muted-foreground mb-4">
          As vendas são registadas como um valor único, por isso a repartição por taxa
          de IVA tem de ser estimada. Quanto mais perto isto estiver da sua casa, melhor
          a estimativa.
        </p>

        <div className="space-y-2.5">
          {SALES_VAT_CLASSES.map((cls) => (
            <label key={cls.key} className="block">
              <span className="flex items-baseline justify-between gap-2 mb-1">
                <span className="text-xs text-foreground">{cls.label}</span>
                <span className="text-[10px] text-muted-foreground">
                  IVA {cls.band === 'normal' ? '23%' : cls.band === 'intermedia' ? '13%' : '6%'}
                </span>
              </span>
              <span className="flex items-center gap-2">
                <input
                  type="number" min={0} max={100}
                  value={mix[cls.key] ?? 0}
                  onChange={(e) => setMix({ ...mix, [cls.key]: Number(e.target.value) || 0 })}
                  className="input-field !py-1.5 !text-sm w-24"
                />
                <span className="text-xs text-muted-foreground">% das vendas</span>
              </span>
              <span className="block text-[10px] text-muted-foreground mt-1">{cls.hint}</span>
            </label>
          ))}
        </div>

        <p className={`mt-2 text-[11px] ${Math.abs(total - 100) > 0.5 ? 'text-warning' : 'text-muted-foreground'}`}>
          Total: {formatPercent(total, 0)}
          {Math.abs(total - 100) > 0.5 && ' — não soma 100%, os valores serão ajustados proporcionalmente.'}
        </p>

        <label className="block mt-4">
          <span className="text-xs text-muted-foreground block mb-1.5">
            Derrama municipal
            <span className="block text-[10px] opacity-70">
              Cada município define a sua, até ao máximo de {DERRAMA_MUNICIPAL_MAX}%.
            </span>
          </span>
          <span className="flex items-center gap-2">
            <input
              type="number" min={0} max={DERRAMA_MUNICIPAL_MAX} step={0.1}
              value={derrama} onChange={(e) => setDerrama(e.target.value)}
              className="input-field !py-1.5 !text-sm w-24"
            />
            <span className="text-xs text-muted-foreground">%</span>
          </span>
        </label>

        <label className="flex items-start gap-2.5 mt-4 cursor-pointer">
          <input
            type="checkbox" checked={isPme} onChange={(e) => setIsPme(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            <span className="block text-sm text-foreground">É uma PME</span>
            <span className="block text-[11px] text-muted-foreground">
              Dá direito à taxa reduzida nos primeiros 50.000 € de matéria colectável.
              A maioria dos restaurantes é.
            </span>
          </span>
        </label>

        <button
          type="button"
          onClick={() => onSave({
            mix,
            derramaMunicipalRate: Number(derrama) || 0,
            isPme,
          })}
          className="cta-button w-full mt-5 !py-2.5 !text-sm"
        >
          <Check className="w-4 h-4" aria-hidden="true" />
          Guardar
        </button>
      </div>
    </div>
  );
}
