'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, ArrowRight, Check, Loader2, FileSpreadsheet, Camera, PenLine } from 'lucide-react';
import { useLanguage } from '@/lib/language-context';
import { translateError } from '@/lib/error-messages';
import { IVA_RATES, type Region } from '@/lib/tax-rules';
import {
  ONBOARDING_STEPS, FIXED_COST_PRESETS, FIRST_DATA_TARGETS,
  type OnboardingStep, type FixedCostKey, type FirstDataChoice,
} from '@/lib/onboarding';
import Logo from '@/app/components/Logo';
import LanguageSelector from '@/app/components/LanguageSelector';
import MunicipalityPicker from '@/app/dashboard/components/MunicipalityPicker';
import { saveRestaurantStep, saveRoomStep, saveFixedCostsStep, finishOnboarding } from './actions';

/**
 * The four-step setup a new owner sees once, before the dashboard.
 *
 * Every step can be skipped and so can the whole thing: what is left undone
 * stays on the dashboard checklist, so nothing here is a gate. The last step
 * does not ask for numbers itself — it opens the real screen for them, so the
 * first thing an owner does in the app is the thing they will do every day.
 */

export interface OnboardingInitial {
  name: string;
  taxId: string;
  municipalityCode: string | null;
  region: Region;
  seats: string;
  serviceHoursPerDay: string;
  monthlyRevenueTarget: string;
}

const REGIONS: Region[] = ['continente', 'madeira', 'acores'];
const FIRST_DATA: Array<{ key: FirstDataChoice; icon: typeof Camera }> = [
  { key: 'import', icon: FileSpreadsheet },
  { key: 'scan', icon: Camera },
  { key: 'revenue', icon: PenLine },
];

export default function OnboardingWizard({ initial }: { initial: OnboardingInitial }) {
  const router = useRouter();
  const { t, language } = useLanguage();

  const [step, setStep] = useState<OnboardingStep>('restaurant');
  const [busy, setBusy] = useState(false);
  const index = ONBOARDING_STEPS.indexOf(step);

  // Step 1
  const [name, setName] = useState(initial.name);
  const [taxId, setTaxId] = useState(initial.taxId);
  const [municipalityCode, setMunicipalityCode] = useState<string | null>(initial.municipalityCode);
  const [region, setRegion] = useState<Region>(initial.region);
  // Step 2
  const [seats, setSeats] = useState(initial.seats);
  const [hours, setHours] = useState(initial.serviceHoursPerDay);
  const [target, setTarget] = useState(initial.monthlyRevenueTarget);
  // Step 3
  const [amounts, setAmounts] = useState<Record<FixedCostKey, string>>(
    () => Object.fromEntries(FIXED_COST_PRESETS.map((p) => [p.key, ''])) as Record<FixedCostKey, string>,
  );
  const [directDebit, setDirectDebit] = useState<Record<FixedCostKey, boolean>>(
    () => Object.fromEntries(FIXED_COST_PRESETS.map((p) => [p.key, p.directDebit])) as Record<FixedCostKey, boolean>,
  );

  const goTo = (next: OnboardingStep) => {
    setStep(next);
    window.scrollTo({ top: 0 });
  };
  const advance = () => {
    const next = ONBOARDING_STEPS[index + 1];
    if (next) goTo(next);
  };
  const back = () => {
    const prev = ONBOARDING_STEPS[index - 1];
    if (prev) goTo(prev);
  };

  const showError = (error: string | undefined) => toast.error(translateError(language, error));

  /** Ends the wizard and opens the dashboard, on a given screen if asked. */
  const finish = async (destination?: FirstDataChoice) => {
    setBusy(true);
    const result = await finishOnboarding();
    if (!result.success) {
      setBusy(false);
      showError(result.error);
      return;
    }
    const target = destination ? FIRST_DATA_TARGETS[destination] : null;
    router.replace(target ? `/dashboard?tab=${target.tab}&sub=${target.sub}` : '/dashboard');
  };

  const saveAndContinue = async () => {
    setBusy(true);
    try {
      if (step === 'restaurant') {
        const r = await saveRestaurantStep({ name, taxId, municipalityCode, region });
        if (!r.success) return showError(r.error);
      } else if (step === 'room') {
        const r = await saveRoomStep({ seats, serviceHoursPerDay: hours, monthlyRevenueTarget: target });
        if (!r.success) return showError(r.error);
      } else if (step === 'fixedCosts') {
        const rows = FIXED_COST_PRESETS.map((p) => ({
          key: p.key,
          amount: amounts[p.key],
          label: t(`onboarding.fixedCosts.preset.${p.key}`),
          directDebit: directDebit[p.key],
        }));
        const r = await saveFixedCostsStep(rows);
        if (!r.success) return showError(r.error);
        if (r.data.booked > 0) toast.success(t('onboarding.fixedCosts.saved').replace('{count}', String(r.data.booked)));
      }
      advance();
    } finally {
      setBusy(false);
    }
  };

  const ratesLine = (r: Region) => {
    const rates = IVA_RATES[r];
    return `${t('onboarding.restaurant.vat')} ${rates.reduzida}% · ${rates.intermedia}% · ${rates.normal}%`;
  };

  return (
    <div className="min-h-dvh bg-background lg:grid lg:grid-cols-[minmax(300px,380px)_1fr]">
      {/* The steps, with what each one turns on. Desktop only: on a phone the
          header's "step 2 of 4" carries the same information. */}
      <aside className="hidden lg:flex flex-col border-r border-border bg-card px-10 py-10">
        <Logo size={44} priority />
        <p className="section-label mt-10">{t('onboarding.eyebrow')}</p>
        <h2 className="mt-2 text-xl font-bold text-foreground text-balance">
          {t('onboarding.railTitle').replace('{name}', name || initial.name)}
        </h2>
        <ol className="mt-8 space-y-1" aria-label={t('onboarding.stepsLabel')}>
          {ONBOARDING_STEPS.map((s, i) => {
            const state = i < index ? 'done' : i === index ? 'current' : 'todo';
            return (
              <li key={s}>
                <div
                  className={`flex gap-3 rounded-lg px-3 py-3 ${state === 'current' ? 'bg-primary/10' : ''}`}
                  aria-current={state === 'current' ? 'step' : undefined}
                >
                  <span
                    className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                      state === 'done'
                        ? 'bg-primary text-primary-foreground'
                        : state === 'current'
                          ? 'border-2 border-primary text-primary-ink'
                          : 'border border-border text-muted-foreground'
                    }`}
                    aria-hidden="true"
                  >
                    {state === 'done' ? <Check className="h-3.5 w-3.5" /> : i + 1}
                  </span>
                  <span className="min-w-0">
                    <span className={`block text-sm font-semibold ${state === 'todo' ? 'text-muted-foreground' : 'text-foreground'}`}>
                      {t(`onboarding.${s}.railTitle`)}
                    </span>
                    <span className="block text-xs text-muted-foreground mt-0.5 leading-relaxed">
                      {t(`onboarding.${s}.unlocks`)}
                    </span>
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
        <p className="mt-auto pt-10 text-xs text-muted-foreground leading-relaxed">{t('onboarding.changeLater')}</p>
      </aside>

      <div className="flex min-h-dvh flex-col">
        <header className="flex items-center justify-between gap-3 px-4 py-4 sm:px-8">
          <div className="flex items-center gap-3">
            <span className="lg:hidden"><Logo size={32} priority /></span>
            <p className="text-xs font-medium text-muted-foreground tabular-nums">
              {t('onboarding.stepOf').replace('{n}', String(index + 1)).replace('{total}', String(ONBOARDING_STEPS.length))}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <LanguageSelector />
            <button
              type="button"
              onClick={() => finish()}
              disabled={busy}
              className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
            >
              {t('onboarding.doLater')}
            </button>
          </div>
        </header>

        {/* Progress, mobile and desktop alike. */}
        <div className="px-4 sm:px-8" aria-hidden="true">
          <div className="mx-auto flex max-w-xl gap-1.5">
            {ONBOARDING_STEPS.map((s, i) => (
              <span key={s} className={`h-1 flex-1 rounded-full ${i <= index ? 'bg-primary' : 'bg-border'}`} />
            ))}
          </div>
        </div>

        <main className="flex flex-1 items-start justify-center px-4 py-8 sm:px-8 sm:py-14">
          <div key={step} className="w-full max-w-xl animate-fade-up">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground text-balance">
              {t(`onboarding.${step}.title`)}
            </h1>
            <p className="mt-2 text-sm sm:text-base text-muted-foreground leading-relaxed">
              {t(`onboarding.${step}.lead`)}
            </p>

            <div className="mt-8 space-y-5">
              {step === 'restaurant' && (
                <>
                  <Field id="ob-name" label={t('onboarding.restaurant.name')}>
                    <input id="ob-name" className="input-field" value={name} onChange={(e) => setName(e.target.value)} autoComplete="organization" />
                  </Field>
                  <Field id="ob-nif" label={t('onboarding.restaurant.nif')} hint={t('onboarding.restaurant.nifHint')}>
                    <input
                      id="ob-nif" className="input-field tabular-nums" inputMode="numeric" maxLength={11}
                      placeholder={t('onboarding.restaurant.nifPlaceholder')}
                      value={taxId} onChange={(e) => setTaxId(e.target.value)}
                    />
                  </Field>
                  <Field id="ob-municipality" label={t('onboarding.restaurant.municipality')} hint={t('onboarding.restaurant.municipalityHint')}>
                    <MunicipalityPicker id="ob-municipality" value={municipalityCode} onChange={setMunicipalityCode} />
                  </Field>
                  <fieldset>
                    <legend className="text-xs font-medium text-muted-foreground mb-2">{t('onboarding.restaurant.region')}</legend>
                    <div className="grid gap-2" role="radiogroup">
                      {REGIONS.map((r) => {
                        const selected = region === r;
                        return (
                          <button
                            key={r}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            onClick={() => setRegion(r)}
                            className={`flex items-center justify-between rounded-xl border bg-card px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                              selected ? 'border-primary ring-1 ring-primary' : 'border-border hover:bg-muted'
                            }`}
                          >
                            <span>
                              <span className="block text-sm font-semibold text-foreground">{t(`onboarding.restaurant.regions.${r}`)}</span>
                              <span className="block text-xs text-muted-foreground tabular-nums mt-0.5">{ratesLine(r)}</span>
                            </span>
                            {selected && <Check className="h-4 w-4 text-primary-ink" aria-hidden="true" />}
                          </button>
                        );
                      })}
                    </div>
                  </fieldset>
                </>
              )}

              {step === 'room' && (
                <>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field id="ob-seats" label={t('onboarding.room.seats')}>
                      <input id="ob-seats" className="input-field tabular-nums" inputMode="numeric" placeholder="40" value={seats} onChange={(e) => setSeats(e.target.value)} />
                    </Field>
                    <Field id="ob-hours" label={t('onboarding.room.hours')} hint={t('onboarding.room.hoursHint')}>
                      <input id="ob-hours" className="input-field tabular-nums" inputMode="decimal" placeholder="8" value={hours} onChange={(e) => setHours(e.target.value)} />
                    </Field>
                  </div>
                  <Field id="ob-target" label={t('onboarding.room.target')} hint={t('onboarding.room.targetHint')}>
                    <div className="relative">
                      <input id="ob-target" className="input-field tabular-nums !pr-10" inputMode="decimal" placeholder="25 000" value={target} onChange={(e) => setTarget(e.target.value)} />
                      <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">€</span>
                    </div>
                  </Field>
                  <p className="rounded-xl border border-border bg-card px-4 py-3 text-xs text-muted-foreground leading-relaxed">
                    {t('onboarding.room.why')}
                  </p>
                </>
              )}

              {step === 'fixedCosts' && (
                <>
                  <div className="rounded-xl border border-border bg-card divide-y divide-border">
                    {FIXED_COST_PRESETS.map((p) => {
                      const id = `ob-fixed-${p.key}`;
                      return (
                        <div key={p.key} className="flex items-center gap-3 px-4 py-2.5">
                          <label htmlFor={id} className="flex-1 min-w-0 text-sm text-foreground">{t(`onboarding.fixedCosts.preset.${p.key}`)}</label>
                          <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
                            <input
                              type="checkbox"
                              className="h-4 w-4 rounded border-border accent-primary"
                              checked={directDebit[p.key]}
                              onChange={(e) => setDirectDebit((d) => ({ ...d, [p.key]: e.target.checked }))}
                              aria-label={`${t('onboarding.fixedCosts.directDebit')} — ${t(`onboarding.fixedCosts.preset.${p.key}`)}`}
                            />
                            <span aria-hidden="true">{t('onboarding.fixedCosts.directDebitShort')}</span>
                          </label>
                          <div className="relative w-28 sm:w-36 shrink-0">
                            <input
                              id={id}
                              className="input-field !py-2 text-right tabular-nums !pr-10"
                              inputMode="decimal"
                              placeholder="0"
                              value={amounts[p.key]}
                              onChange={(e) => setAmounts((a) => ({ ...a, [p.key]: e.target.value }))}
                            />
                            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">€</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{t('onboarding.fixedCosts.how')}</p>
                </>
              )}

              {step === 'firstData' && (
                <div className="grid gap-3">
                  {FIRST_DATA.map(({ key, icon: Icon }) => (
                    <button
                      key={key}
                      type="button"
                      disabled={busy}
                      onClick={() => finish(key)}
                      className="group flex items-start gap-4 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-primary hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary-ink">
                        <Icon className="h-5 w-5" aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-foreground">{t(`onboarding.firstData.${key}.title`)}</span>
                        <span className="block text-xs text-muted-foreground mt-0.5 leading-relaxed">{t(`onboarding.firstData.${key}.body`)}</span>
                      </span>
                      <ArrowRight className="mt-2 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Back on the left; skip and continue on the right. The last step
                has no "continue": choosing a card is how it is finished. */}
            <div className="mt-10 flex items-center justify-between gap-3">
              {index > 0 ? (
                <button type="button" onClick={back} disabled={busy} className="cta-button-secondary !px-4">
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                  {t('common.back')}
                </button>
              ) : <span />}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => (step === 'firstData' ? finish() : advance())}
                  disabled={busy}
                  className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                >
                  {step === 'firstData' ? t('onboarding.goToDashboard') : t('onboarding.skip')}
                </button>
                {step !== 'firstData' && (
                  <button type="button" onClick={saveAndContinue} disabled={busy} className="cta-button">
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                    {t('onboarding.continue')}
                    {!busy && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
                  </button>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="text-xs font-medium text-muted-foreground block mb-2">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground mt-1.5 leading-relaxed">{hint}</p>}
    </div>
  );
}
