'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signIn, useSession } from 'next-auth/react';
import { ArrowLeft, BarChart3, Eye, EyeOff, Loader2, Receipt, TrendingUp } from 'lucide-react';
import { Wordmark } from '@/app/components/Logo';
import LanguageSelector from '@/app/components/LanguageSelector';
import { useLanguage } from '@/lib/language-context';
import { translateError } from '@/lib/error-messages';
import { markJustSignedIn } from '@/lib/welcome-signal';
import { MIN_PASSWORD_LENGTH } from '@/lib/validations';
import { loginWithPassword } from './actions';
import { registerUser } from '@/app/register/actions';
import RestaurantOrb from './RestaurantOrb';

/**
 * The way in. A split screen: the form on the left, the orb turning slowly on
 * deep navy on the right.
 *
 * Everything arrives in a short stagger (fade, rise, un-blur). On a correct
 * password the form steps aside and the navy panel widens to fill the screen
 * on the way to the dashboard. A wrong one shakes and says so.
 *
 * Signing in and creating an account share the screen, so moving between them
 * never loses the panel; /login and /register each open on their own form.
 */

const ENTER_MS = 620;

const POINTS = [
  { Icon: Receipt, key: 'invoices' },
  { Icon: TrendingUp, key: 'prices' },
  { Icon: BarChart3, key: 'results' },
] as const;

type Tab = 'login' | 'register';

const turn = (ms: number) => ({ '--d': `${ms}ms` }) as CSSProperties;

export default function AuthScreen({ initialTab, expired = false }: { initialTab: Tab; expired?: boolean }) {
  const { t } = useLanguage();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [entering, setEntering] = useState(false);

  return (
    <main className="auth-screen" data-entering={entering}>
      <section className="auth-form">
        <div className="auth-top">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded text-xs font-medium text-muted-foreground transition-colors hover:text-foreground
                       focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            {t('auth.backHome')}
          </Link>
          <LanguageSelector />
        </div>

        {/* Keyed, so the stagger plays again on the other form. */}
        <div key={tab} className="w-full max-w-sm">
          <div className="auth-in mb-10" style={turn(60)}>
            <Wordmark markSize={40} />
          </div>
          <h1 className="auth-in auth-title" style={turn(140)}>
            {t(tab === 'login' ? 'auth.loginTitle' : 'auth.registerTitle')}
          </h1>
          <p className="auth-in mb-8 mt-3 text-base leading-relaxed text-muted-foreground" style={turn(220)}>
            {t(tab === 'login' ? 'auth.loginBody' : 'auth.registerBody')}
          </p>

          {tab === 'login' ? (
            <LoginForm expired={expired} onEntering={() => setEntering(true)} onSwitch={() => setTab('register')} />
          ) : (
            <RegisterForm onEntering={() => setEntering(true)} onSwitch={() => setTab('login')} />
          )}
        </div>
      </section>

      <Hero />
    </main>
  );
}

/** Waits out the panel's widening, unless the visitor asked for no motion. */
function panelWidened(): Promise<void> {
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return new Promise((resolve) => window.setTimeout(resolve, still ? 0 : ENTER_MS));
}

function useEnter(onEntering: () => void) {
  const router = useRouter();
  const { update } = useSession();
  return useCallback(async (redirectTo: string) => {
    onEntering();
    // The session pulled now, so the destination renders signed in on its
    // first paint; the wait for the panel covers the trip.
    await Promise.all([update(), panelWidened()]);
    // Tells the destination this is a fresh sign-in, so it greets by name.
    markJustSignedIn();
    router.replace(redirectTo);
    router.refresh();
  }, [onEntering, router, update]);
}

function LoginForm({ expired, onEntering, onSwitch }: { expired: boolean; onEntering: () => void; onSwitch: () => void }) {
  const { t, language } = useLanguage();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [shake, setShake] = useState(0);
  const [busy, setBusy] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);
  const enter = useEnter(onEntering);

  const fail = (message: string) => {
    setError(message);
    setShake((n) => n + 1);
    setBusy(false);
  };

  // Ready to be typed over.
  useEffect(() => {
    if (shake) passwordRef.current?.select();
  }, [shake]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await loginWithPassword(email, password);
      if ('error' in result && result.error) return fail(translateError(language, result.error));
      if ('redirectTo' in result && result.redirectTo) await enter(result.redirectTo);
    } catch {
      fail(t('auth.errors.unexpected'));
    }
  };

  /** Hands off to Google; Auth.js returns to the callback URL. */
  const google = () => {
    setBusy(true);
    markJustSignedIn();
    signIn('google', { callbackUrl: '/dashboard' });
  };

  return (
    <form onSubmit={submit}>
      {expired && !error && (
        <p className="auth-in mb-4 rounded-xl bg-muted px-4 py-3 text-sm text-foreground" style={turn(260)}>
          {t('errors.auth')}
        </p>
      )}

      <div className="auth-in space-y-4" style={turn(300)}>
        <Field id="login-email" label={t('auth.email')} invalid={Boolean(error)}>
          <input
            id="login-email"
            type="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setError(''); }}
            placeholder={t('auth.emailPlaceholder')}
            required
            autoFocus
            autoComplete="email"
          />
        </Field>
        <div>
          <PasswordField
            id="login-password"
            ref_={passwordRef}
            label={t('auth.password')}
            value={password}
            onChange={(v) => { setPassword(v); setError(''); }}
            placeholder={t('auth.passwordPlaceholder')}
            autoComplete="current-password"
            invalid={Boolean(error)}
          />
          <div className="mt-2 text-right">
            <Link href="/forgot-password" className="text-xs text-muted-foreground transition-colors hover:text-primary-ink">
              {t('auth.forgot')}
            </Link>
          </div>
        </div>
      </div>

      <FormError message={error} shake={shake} />

      <button type="submit" disabled={busy} className="auth-in auth-submit" style={turn(380)}>
        {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        {t(busy ? 'auth.submitting' : 'auth.submit')}
      </button>

      <div className="auth-in" style={turn(440)}>
        <div className="my-4 flex items-center gap-3">
          <span className="h-px flex-1 bg-border" />
          <span className="text-xs text-muted-foreground">{t('auth.or')}</span>
          <span className="h-px flex-1 bg-border" />
        </div>
        <button type="button" onClick={google} disabled={busy} className="cta-button-secondary w-full">
          {/* Inline mark: no external request, and it keeps Google's brand
              colours in both themes. */}
          <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.57c2.08-1.92 3.28-4.74 3.28-8.09Z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.76c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
            <path fill="#FBBC05" d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84Z" />
            <path fill="#EA4335" d="M12 4.75c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 1.46 14.97.5 12 .5A11 11 0 0 0 2.18 7.05l3.66 2.84c.87-2.6 3.3-4.14 6.16-4.14Z" />
          </svg>
          {t('auth.google')}
        </button>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          {t('auth.noAccount')}{' '}
          <button type="button" onClick={onSwitch} className="font-medium text-primary-ink hover:underline underline-offset-2">
            {t('auth.createAccount')}
          </button>
        </p>
      </div>
    </form>
  );
}

function RegisterForm({ onEntering, onSwitch }: { onEntering: () => void; onSwitch: () => void }) {
  const { t, language } = useLanguage();
  const [form, setForm] = useState({ name: '', restaurantName: '', email: '', password: '', confirm: '' });
  const [error, setError] = useState('');
  const [shake, setShake] = useState(0);
  const [busy, setBusy] = useState(false);
  const enter = useEnter(onEntering);

  const set = (key: keyof typeof form) => (value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    setError('');
  };

  const fail = (message: string) => {
    setError(message);
    setShake((n) => n + 1);
    setBusy(false);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (form.password !== form.confirm) return fail(t('auth.errors.mismatch'));
    if (form.password.length < MIN_PASSWORD_LENGTH) {
      return fail(t('auth.errors.tooShort').replace('{n}', String(MIN_PASSWORD_LENGTH)));
    }

    setBusy(true);
    setError('');
    try {
      const result = await registerUser({
        name: form.name,
        email: form.email,
        password: form.password,
        restaurantName: form.restaurantName,
      });
      if (result.error) return fail(translateError(language, result.error));
      // registerUser signs the new owner in as part of the same call.
      if ('redirectTo' in result && result.redirectTo) await enter(result.redirectTo);
    } catch {
      fail(t('auth.errors.unexpected'));
    }
  };

  return (
    <form onSubmit={submit}>
      <div className="auth-in space-y-4" style={turn(300)}>
        <Field id="register-name" label={t('auth.name')}>
          <input
            id="register-name"
            type="text"
            value={form.name}
            onChange={(e) => set('name')(e.target.value)}
            placeholder={t('auth.namePlaceholder')}
            required
            autoFocus
            autoComplete="name"
          />
        </Field>
        <Field id="register-restaurant" label={t('auth.restaurant')}>
          <input
            id="register-restaurant"
            type="text"
            value={form.restaurantName}
            onChange={(e) => set('restaurantName')(e.target.value)}
            placeholder={t('auth.restaurantPlaceholder')}
            required
            autoComplete="organization"
          />
        </Field>
        <Field id="register-email" label={t('auth.email')}>
          <input
            id="register-email"
            type="email"
            value={form.email}
            onChange={(e) => set('email')(e.target.value)}
            placeholder={t('auth.emailPlaceholder')}
            required
            autoComplete="email"
          />
        </Field>
        <PasswordField
          id="register-password"
          label={t('auth.password')}
          value={form.password}
          onChange={set('password')}
          placeholder={t('auth.newPasswordPlaceholder').replace('{n}', String(MIN_PASSWORD_LENGTH))}
          autoComplete="new-password"
        />
        <PasswordField
          id="register-confirm-password"
          label={t('auth.confirm')}
          value={form.confirm}
          onChange={set('confirm')}
          placeholder={t('auth.confirmPlaceholder')}
          autoComplete="new-password"
        />
      </div>

      <FormError message={error} shake={shake} />

      <button type="submit" disabled={busy} className="auth-in auth-submit" style={turn(380)}>
        {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        {t(busy ? 'auth.registerSubmitting' : 'auth.registerSubmit')}
      </button>

      <div className="auth-in" style={turn(440)}>
        <p className="mt-3 text-center text-xs text-muted-foreground">{t('auth.registerNote')}</p>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          {t('auth.haveAccount')}{' '}
          <button type="button" onClick={onSwitch} className="font-medium text-primary-ink hover:underline underline-offset-2">
            {t('auth.signIn')}
          </button>
        </p>
      </div>
    </form>
  );
}

function Field({ id, label, invalid = false, children }: { id: string; label: string; invalid?: boolean; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-semibold text-foreground">{label}</label>
      <div className="auth-field" data-error={invalid}>{children}</div>
    </div>
  );
}

function PasswordField({
  id, ref_, label, value, onChange, placeholder, autoComplete, invalid,
}: {
  id: string;
  ref_?: React.Ref<HTMLInputElement>;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  autoComplete: string;
  invalid?: boolean;
}) {
  const { t } = useLanguage();
  const [show, setShow] = useState(false);
  return (
    <Field id={id} label={label} invalid={invalid}>
      <input
        ref={ref_}
        id={id}
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required
        autoComplete={autoComplete}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={t(show ? 'auth.hidePassword' : 'auth.showPassword')}
        aria-pressed={show}
      >
        {show ? <EyeOff className="h-5 w-5" aria-hidden="true" /> : <Eye className="h-5 w-5" aria-hidden="true" />}
      </button>
    </Field>
  );
}

/** Keyed by the attempt, so a second failure shakes again. */
function FormError({ message, shake }: { message: string; shake: number }) {
  return (
    <p key={shake} role="alert" className="auth-error" data-shake={Boolean(message)}>
      {message}
    </p>
  );
}

/**
 * The navy panel. The orb is only mounted on wide screens, so phones never run
 * a canvas behind a panel they cannot see.
 */
function Hero() {
  const { t } = useLanguage();
  const panel = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(0);

  useEffect(() => {
    const media = window.matchMedia('(min-width: 900px)');
    const measure = () => {
      const el = panel.current;
      if (!media.matches || !el) return setSize(0);
      const { width, height } = el.getBoundingClientRect();
      // Leaves room at the bottom for the cards.
      setSize(Math.round(Math.min(560, width * 0.86, (height - 180) * 0.92)));
    };
    measure();
    let timer = 0;
    const onResize = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(measure, 150);
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.clearTimeout(timer);
    };
  }, []);

  return (
    <section className="auth-hero" aria-hidden="true">
      <div ref={panel} className="auth-panel">
        {size > 0 && (
          <div className="auth-orb">
            <RestaurantOrb size={size} />
          </div>
        )}
        <div className="auth-points">
          {POINTS.map(({ Icon, key }, i) => (
            <div key={key} className="auth-point" style={turn(900 + i * 160)}>
              <span className="auth-point-icon">
                <Icon className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-semibold text-white">{t(`auth.points.${key}.title`)}</p>
                <p className="mt-0.5 text-[13px] leading-snug text-[#b9c1cc]">{t(`auth.points.${key}.text`)}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
