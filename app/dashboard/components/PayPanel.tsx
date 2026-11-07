'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Check, ChevronRight, Loader2, Users } from 'lucide-react';
import { useLanguage } from '@/lib/language-context';
import { formatMoney } from '@/lib/format';
import { employeeColor } from '@/lib/schedule';
import { EMPLOYER_TSU } from '@/lib/budget';
import { monthlyEmployerCost, parseSalary, payrollLines } from '@/lib/payroll';
import { getTeamPay, setEmployeePay, type TeamMemberPay } from '../payroll-actions';
import Dialog from './Dialog';

/**
 * Colaboradores: what each person on the rota is paid.
 *
 * A gross salary typed here is booked every month as two costs, the salary
 * and the employer's Social Security, so the P&L has its labour without
 * anyone typing it again. Opened one person at a time, because a salary is
 * set when someone is hired and changed rarely.
 */

type Data = { people: TeamMemberPay[]; handTypedLabour: { count: number; amount: number } };

const money = (n: number) => formatMoney(n, { decimals: 2 });

export default function PayPanel() {
  const { t } = useLanguage();
  const [data, setData] = useState<Data | null>(null);
  const [open, setOpen] = useState<TeamMemberPay | null>(null);

  const load = useCallback(() => {
    getTeamPay().then((r) => {
      if (r.success) setData(r.data);
      else toast.error(t(r.error));
    });
  }, [t]);
  useEffect(() => { load(); }, [load]);

  if (!data) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        {t('common.loading')}
      </div>
    );
  }

  if (data.people.length === 0) {
    return (
      <div className="card-glass flex flex-col items-center px-6 py-14 text-center">
        <Users className="h-9 w-9 text-muted-foreground" aria-hidden="true" />
        <p className="mt-4 text-base font-semibold text-foreground">{t('payroll.emptyTitle')}</p>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">{t('payroll.emptyBody')}</p>
      </div>
    );
  }

  const total = data.people.reduce((s, p) => s + p.monthlyCost, 0);
  const withPay = data.people.some((p) => p.grossSalary);

  return (
    <div className="max-w-3xl space-y-4">
      <div className="card-glass overflow-hidden">
        <div className="flex items-start justify-between gap-4 px-5 py-4 sm:px-6">
          <div>
            <h2 className="text-lg font-bold text-foreground">{t('payroll.title')}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">{t('payroll.lead')}</p>
          </div>
          {withPay && (
            <span className="shrink-0 text-right">
              <span className="block text-[11px] text-muted-foreground">{t('payroll.teamPerMonth')}</span>
              <span className="block text-base font-bold tabular-nums text-foreground">{money(total)}</span>
            </span>
          )}
        </div>

        {data.handTypedLabour.count > 0 && (
          <p className="mx-5 mb-4 flex gap-2 rounded-lg bg-warning/10 p-3 text-xs text-foreground sm:mx-6">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
            <span>{t('payroll.handTyped').replace('{amount}', money(data.handTypedLabour.amount))}</span>
          </p>
        )}

        <ul className="divide-y divide-border-subtle border-t border-border-subtle">
          {data.people.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => setOpen(p)}
                className="group flex w-full items-center gap-3 px-5 py-3.5 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-6"
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: employeeColor(p.color).dot }} aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-foreground">{p.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {p.grossSalary
                      ? `${t('payroll.grossShort')} ${money(p.grossSalary)}${p.role ? ` · ${p.role}` : ''}`
                      : (p.role ? `${p.role} · ` : '') + t('payroll.noSalary')}
                  </span>
                </span>
                {p.grossSalary ? (
                  <span className="shrink-0 text-right">
                    <span className="block text-sm font-semibold tabular-nums text-foreground">{money(p.monthlyCost)}</span>
                    <span className="block text-[11px] text-muted-foreground">{t('payroll.perMonthShort')}</span>
                  </span>
                ) : (
                  <span className="shrink-0 text-xs font-semibold text-primary-ink">{t('payroll.add')}</span>
                )}
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      </div>

      {open && (
        <PayDialog
          person={open}
          onClose={() => setOpen(null)}
          onSaved={() => { setOpen(null); load(); }}
        />
      )}
    </div>
  );
}

function PayDialog({ person, onClose, onSaved }: { person: TeamMemberPay; onClose: () => void; onSaved: () => void }) {
  const { t, language } = useLanguage();
  const [gross, setGross] = useState(person.grossSalary ? String(person.grossSalary).replace('.', language === 'pt' ? ',' : '.') : '');
  const [spread, setSpread] = useState(person.subsidiesSpread);
  const [payDay, setPayDay] = useState(person.payDay);
  const [saving, setSaving] = useState(false);

  const parsed = parseSalary(gross);
  const amount = typeof parsed === 'number' ? parsed : 0;
  const lines = payrollLines({ grossSalary: amount, subsidiesSpread: spread });
  const part = (kind: string) => lines.find((l) => l.kind === kind)?.amount ?? 0;
  const tsuRate = `${(EMPLOYER_TSU * 100).toLocaleString(language === 'pt' ? 'pt-PT' : 'en-GB')}%`;

  const save = async (value: string) => {
    setSaving(true);
    const r = await setEmployeePay(person.id, { grossSalary: value, subsidiesSpread: spread, payDay });
    setSaving(false);
    if (!r.success) { toast.error(t(r.error)); return; }
    toast.success(t(parseSalary(value) ? 'payroll.saved' : 'payroll.cleared'));
    onSaved();
  };

  const choice = (on: boolean) =>
    `flex-1 rounded-lg px-3 py-2 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
      on ? 'bg-card text-foreground shadow-sm font-semibold' : 'text-muted-foreground hover:text-foreground'}`;

  return (
    <Dialog title={person.name} onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); if (parsed !== 'invalid') void save(gross); }} className="space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-xs text-muted-foreground">{t('payroll.gross')}</span>
          <span className="relative block">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground" aria-hidden="true">€</span>
            <input
              type="text"
              inputMode="decimal"
              value={gross}
              onChange={(e) => setGross(e.target.value)}
              className="input-field !py-2 !pl-7 tabular-nums"
              aria-invalid={parsed === 'invalid'}
              autoFocus
            />
          </span>
          {parsed === 'invalid' && <span className="mt-1 block text-[11px] text-danger">{t('payroll.errors.salary')}</span>}
        </label>

        <fieldset>
          <legend className="mb-1.5 text-xs text-muted-foreground">{t('payroll.subsidies')}</legend>
          <div className="flex gap-1 rounded-xl bg-muted p-1">
            <button type="button" aria-pressed={spread} onClick={() => setSpread(true)} className={choice(spread)}>
              {t('payroll.spread')}
            </button>
            <button type="button" aria-pressed={!spread} onClick={() => setSpread(false)} className={choice(!spread)}>
              {t('payroll.wholeMonths')}
            </button>
          </div>
        </fieldset>

        <label className="block">
          <span className="mb-1.5 block text-xs text-muted-foreground">{t('payroll.payDay')}</span>
          <select value={payDay} onChange={(e) => setPayDay(Number(e.target.value))} className="input-field !py-2">
            {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>{d === 31 ? t('payroll.lastDay') : String(d)}</option>
            ))}
          </select>
        </label>

        {amount > 0 && (
          <div className="rounded-xl border border-border-subtle bg-surface p-3 text-xs">
            <div className="flex justify-between gap-3 text-muted-foreground">
              <span>{t(spread ? 'payroll.lines.salarySpreadShort' : 'payroll.lines.salaryShort')}</span>
              <span className="tabular-nums">{money(part('salary'))}</span>
            </div>
            <div className="mt-1 flex justify-between gap-3 text-muted-foreground">
              <span>{t('payroll.lines.socialSecurityShort').replace('{rate}', tsuRate)}</span>
              <span className="tabular-nums">{money(part('socialSecurity'))}</span>
            </div>
            <div className="mt-2 flex justify-between gap-3 border-t border-border-subtle pt-2 font-semibold text-foreground">
              <span>{t('payroll.costPerMonth')}</span>
              <span className="tabular-nums">{money(part('salary') + part('socialSecurity'))}</span>
            </div>
            {!spread && (
              <p className="mt-1.5 text-muted-foreground">
                {t('payroll.subsidyMonths').replace('{amount}', money(part('subsidy') + part('subsidySocialSecurity')))}
              </p>
            )}
            {!spread && <p className="mt-1.5 text-muted-foreground">
              {t('payroll.average').replace('{amount}', money(monthlyEmployerCost({ grossSalary: amount, subsidiesSpread: spread })))}
            </p>}
          </div>
        )}

        <p className="text-[11px] text-muted-foreground">{t('payroll.hint')}</p>

        <div className="flex gap-2">
          <button type="submit" disabled={saving || parsed === 'invalid'} className="cta-button flex-1 !py-2.5 !text-sm disabled:opacity-40">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}
            {t('payroll.save')}
          </button>
          {person.grossSalary && (
            <button type="button" onClick={() => void save('')} disabled={saving} className="cta-button-secondary !px-3 !py-2.5 !text-sm">
              {t('payroll.stop')}
            </button>
          )}
        </div>
      </form>
    </Dialog>
  );
}
