'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Delete, LogIn, LogOut, Lock, Loader2, X } from 'lucide-react';
import { useLanguage } from '@/lib/language-context';
import { translateError } from '@/lib/error-messages';
import { formatDuration } from '@/lib/schedule';
import { kioskPunch, exitKiosk, exitKioskBySigningOut } from './actions';

type Result = { name: string; action: 'in' | 'out'; at: string; minutes: number | null };

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

const upperFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export default function KioskPad({ restaurantName, off }: { restaurantName: string; off: boolean }) {
  const { t, language } = useLanguage();
  const router = useRouter();
  const locale = language === 'pt' ? 'pt-PT' : 'en-GB';
  const [now, setNow] = useState(() => new Date());
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [exiting, setExiting] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const clearSoon = (ms: number) => {
    clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => { setResult(null); setError(null); }, ms);
  };

  const submit = useCallback(async (value: string) => {
    setBusy(true);
    const r = await kioskPunch(value);
    setBusy(false);
    setPin('');
    if (!r.success) {
      setError(translateError(language, r.error));
      clearSoon(4000);
      return;
    }
    setError(null);
    setResult(r.data);
    clearSoon(5000);
  }, [language]);

  const press = useCallback((key: string) => {
    if (busy || result || pin.length >= 4) return;
    setError(null);
    const next = pin + key;
    setPin(next);
    if (next.length === 4) void submit(next);
  }, [busy, result, pin, submit]);

  // A USB or Bluetooth keypad works as well as the screen.
  useEffect(() => {
    if (exiting || off) return;
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') setPin((p) => p.slice(0, -1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [press, exiting, off]);

  const time = (d: Date) => d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });

  return (
    <main className="flex min-h-screen flex-col bg-background px-4 py-6 text-foreground">
      <header className="flex items-center justify-between">
        <p className="text-sm font-semibold text-muted-foreground">{restaurantName}</p>
        <button
          type="button"
          onClick={() => setExiting(true)}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Lock className="h-3.5 w-3.5" aria-hidden="true" />
          {t('kiosk.exit')}
        </button>
      </header>

      {off ? (
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col items-center justify-center text-center">
          <Lock className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
          <p className="mt-3 text-base font-semibold text-foreground">{t('kiosk.offTitle')}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t('kiosk.offBody')}</p>
        </div>
      ) : (
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col items-center justify-center">
        <p className="text-6xl font-bold tabular-nums tracking-tight sm:text-7xl" suppressHydrationWarning>{time(now)}</p>
        <p className="mt-1 text-sm text-muted-foreground" suppressHydrationWarning>
          {/* First letter only: "capitalize" would also make "De Novembro". */}
          {upperFirst(now.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' }))}
        </p>

        <div className="mt-8 flex h-24 w-full items-center justify-center" aria-live="polite">
          {result ? (
            <div className={`w-full rounded-2xl px-5 py-4 text-center ${result.action === 'in' ? 'bg-success/15 text-success' : 'bg-primary/10 text-foreground'}`}>
              <p className="flex items-center justify-center gap-2 text-lg font-bold">
                {result.action === 'in' ? <LogIn className="h-5 w-5" aria-hidden="true" /> : <LogOut className="h-5 w-5" aria-hidden="true" />}
                {t(result.action === 'in' ? 'kiosk.hello' : 'kiosk.bye').replace('{name}', result.name)}
              </p>
              <p className="mt-1 text-sm">
                {t(result.action === 'in' ? 'kiosk.inAt' : 'kiosk.outAt').replace('{time}', time(new Date(result.at)))}
                {result.minutes !== null && ` · ${t('kiosk.worked').replace('{duration}', formatDuration(result.minutes))}`}
              </p>
            </div>
          ) : error ? (
            <p role="alert" className="text-center text-sm font-medium text-danger">{error}</p>
          ) : (
            <div className="text-center">
              <p className="text-sm text-muted-foreground">{t('kiosk.enterPin')}</p>
              <div className="mt-3 flex justify-center gap-3" aria-label={t('kiosk.pinLabel')}>
                {[0, 1, 2, 3].map((i) => (
                  <span key={i} className={`h-4 w-4 rounded-full border-2 ${i < pin.length ? 'border-primary bg-primary' : 'border-border'}`} />
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="mt-6 grid w-full grid-cols-3 gap-3">
          {KEYS.map((k) => <PadKey key={k} onClick={() => press(k)} disabled={busy}>{k}</PadKey>)}
          <span aria-hidden="true" />
          <PadKey onClick={() => press('0')} disabled={busy}>0</PadKey>
          <PadKey onClick={() => setPin((p) => p.slice(0, -1))} disabled={busy || !pin} label={t('kiosk.erase')}>
            {busy ? <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" /> : <Delete className="h-6 w-6" aria-hidden="true" />}
          </PadKey>
        </div>
      </div>
      )}

      {exiting && <ExitDialog onClose={() => setExiting(false)} onLeft={() => router.replace('/dashboard?tab=users')} />}
    </main>
  );
}

function PadKey({ children, onClick, disabled, label }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="flex h-16 items-center justify-center rounded-2xl border border-border bg-card text-2xl font-semibold tabular-nums shadow-sm transition-colors hover:bg-muted active:bg-muted disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-20"
    >
      {children}
    </button>
  );
}

function ExitDialog({ onClose, onLeft }: { onClose: () => void; onLeft: () => void }) {
  const { t, language } = useLanguage();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noPassword, setNoPassword] = useState(false);

  const leave = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const r = await exitKiosk(password);
    setBusy(false);
    if (r.success) return onLeft();
    if (r.error === 'kiosk.errors.noPassword') setNoPassword(true);
    setError(translateError(language, r.error));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="kiosk-exit-title">
      <form onSubmit={leave} className="w-full max-w-sm rounded-2xl bg-card p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <h2 id="kiosk-exit-title" className="text-base font-bold text-foreground">{t('kiosk.exitTitle')}</h2>
          <button type="button" onClick={onClose} aria-label={t('common.close')} className="rounded-lg p-1 text-muted-foreground hover:bg-muted">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{t('kiosk.exitBody')}</p>
        {noPassword ? (
          <button type="button" onClick={() => exitKioskBySigningOut()} className="cta-button mt-4 w-full justify-center">
            {t('kiosk.signOut')}
          </button>
        ) : (
          <>
            <label htmlFor="kiosk-password" className="mt-4 block text-xs font-medium text-muted-foreground">{t('kiosk.password')}</label>
            <input
              id="kiosk-password"
              type="password"
              autoComplete="current-password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-field mt-1.5"
            />
            {error && <p role="alert" className="mt-2 text-xs font-medium text-danger">{error}</p>}
            <button type="submit" disabled={busy || !password} className="cta-button mt-4 w-full justify-center">
              {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {t('kiosk.leave')}
            </button>
          </>
        )}
      </form>
    </div>
  );
}
