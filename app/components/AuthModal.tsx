'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, X, Loader2, AlertCircle, CheckCircle2, UtensilsCrossed } from 'lucide-react';
import { signIn } from 'next-auth/react';
import { loginWithPassword } from '@/app/login/actions';
import { registerUser } from '@/app/register/actions';
import { useLanguage } from '@/lib/language-context';

type AuthTab = 'login' | 'register';

interface AuthModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultTab?: AuthTab;
}

// ─── Login Form ────────────────────────────────────────────────────────────
function LoginForm({ onSwitchTab }: { onSwitchTab: () => void }) {
  useLanguage();
  const router = useRouter();

  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await loginWithPassword(email, password);

      if ('error' in result && result.error) {
        setError(result.error);
        return;
      }

      if ('redirectTo' in result && result.redirectTo) {
        router.push(result.redirectTo);
        router.refresh();
      }
    } catch {
      setError('Erro inesperado. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }, [email, password, router]);

  /** Hands off to Google; Auth.js returns to the callback URL. */
  const handleGoogle = useCallback(() => {
    setError('');
    setLoading(true);
    signIn('google', { callbackUrl: '/dashboard' });
  }, []);

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-danger/10 border border-danger/20 text-sm text-red-400 animate-auth-shake">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="space-y-2">
        <label htmlFor="login-email" className="text-xs font-medium text-muted-foreground">Email</label>
        <input
          id="login-email"
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="nome@restaurante.pt"
          required
          autoComplete="email"
          className="input-field"
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="login-password" className="text-xs font-medium text-muted-foreground">Palavra-passe</label>
        <div className="relative">
          <input
            id="login-password"
            type={showPass ? 'text' : 'password'}
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            autoComplete="current-password"
            className="input-field pr-11"
          />
          <button
            type="button"
            onClick={() => setShowPass(v => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            aria-label={showPass ? 'Ocultar palavra-passe' : 'Mostrar palavra-passe'}
          >
            {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        <div className="text-right">
          <a href="/forgot-password" className="text-xs text-muted-foreground hover:text-primary transition-colors">
            Esqueci-me da palavra-passe
          </a>
        </div>
      </div>

      <button type="submit" disabled={loading} className="cta-button w-full mt-2">
        {loading ? (
          <><Loader2 className="w-4 h-4 animate-spin" />A entrar...</>
        ) : (
          'Entrar'
        )}
      </button>

      <div className="flex items-center gap-3 pt-1">
        <span className="h-px flex-1 bg-border" />
        <span className="text-xs text-muted-foreground">ou</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <button
        type="button"
        onClick={handleGoogle}
        disabled={loading}
        className="cta-button-secondary w-full"
      >
        {/* Inline mark: no external request, and it keeps Google's brand
            colours in both themes. */}
        <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.57c2.08-1.92 3.28-4.74 3.28-8.09Z" />
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.76c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
          <path fill="#FBBC05" d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84Z" />
          <path fill="#EA4335" d="M12 4.75c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 1.46 14.97.5 12 .5A11 11 0 0 0 2.18 7.05l3.66 2.84c.87-2.6 3.3-4.14 6.16-4.14Z" />
        </svg>
        Continuar com Google
      </button>

      <p className="text-center text-sm text-muted-foreground pt-2">
        Não tens conta?{' '}
        <button type="button" onClick={onSwitchTab} className="text-primary hover:text-primary-hover font-medium transition-colors">
          Criar conta gratuita
        </button>
      </p>
    </form>
  );
}

// ─── Register Form ─────────────────────────────────────────────────────────
function RegisterForm({ onSwitchTab }: { onSwitchTab: () => void }) {
  const router = useRouter();

  const [form, setForm] = useState({
    name: '',
    email: '',
    restaurantName: '',
    password: '',
    confirmPassword: '',
  });
  const [showPass, setShowPass]         = useState(false);
  const [showConfirm, setShowConfirm]   = useState(false);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState('');
  const [success, setSuccess]           = useState(false);

  const update = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(prev => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (form.password !== form.confirmPassword) {
      setError('As palavras-passe não coincidem.');
      return;
    }
    if (form.password.length < 6) {
      setError('A palavra-passe deve ter pelo menos 6 caracteres.');
      return;
    }

    setLoading(true);

    try {
      const result = await registerUser({
        name: form.name,
        email: form.email,
        password: form.password,
        restaurantName: form.restaurantName,
      });

      if (result.error) {
        setError(result.error);
        return;
      }

      // registerUser signs the new owner in as part of the same call, so
      // there is nothing to retry here.
      setSuccess(true);
      if ('redirectTo' in result && result.redirectTo) {
        router.push(result.redirectTo);
        router.refresh();
      }
    } catch {
      setError('Erro inesperado. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }, [form, router]);

  if (success) {
    return (
      <div className="flex flex-col items-center text-center py-6 gap-4">
        <div className="w-14 h-14 rounded-full bg-success/15 border border-success/30 flex items-center justify-center">
          <CheckCircle2 className="w-7 h-7 text-green-400" />
        </div>
        <div>
          <p className="font-semibold text-foreground">Conta criada com sucesso!</p>
          <p className="text-sm text-muted-foreground mt-1">A redirecionar para o teu dashboard...</p>
        </div>
        <div className="w-full bg-border rounded-full h-1 overflow-hidden mt-2">
          <div className="h-full bg-primary animate-gradient rounded-full" style={{ width: '100%', transition: 'width 1s ease' }} />
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-danger/10 border border-danger/20 text-sm text-red-400 animate-auth-shake">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4">
        <div className="space-y-2">
          <label htmlFor="register-name" className="text-xs font-medium text-muted-foreground">O teu nome</label>
          <input
            id="register-name"
            type="text"
            value={form.name}
            onChange={update('name')}
            placeholder="João Silva"
            required
            className="input-field"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="register-restaurant" className="text-xs font-medium text-muted-foreground">Nome do restaurante</label>
          <input
            id="register-restaurant"
            type="text"
            value={form.restaurantName}
            onChange={update('restaurantName')}
            placeholder="Restaurante O Meu Lugar"
            required
            className="input-field"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="register-email" className="text-xs font-medium text-muted-foreground">Email</label>
          <input
            id="register-email"
            type="email"
            value={form.email}
            onChange={update('email')}
            placeholder="nome@restaurante.pt"
            required
            autoComplete="email"
            className="input-field"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="register-password" className="text-xs font-medium text-muted-foreground">Palavra-passe</label>
          <div className="relative">
            <input
              id="register-password"
              type={showPass ? 'text' : 'password'}
              value={form.password}
              onChange={update('password')}
              placeholder="Mínimo 6 caracteres"
              required
              autoComplete="new-password"
              className="input-field pr-11"
            />
            <button
              type="button"
              onClick={() => setShowPass(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              aria-label={showPass ? 'Ocultar palavra-passe' : 'Mostrar palavra-passe'}
            >
              {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <label htmlFor="register-confirm-password" className="text-xs font-medium text-muted-foreground">Confirmar palavra-passe</label>
          <div className="relative">
            <input
              id="register-confirm-password"
              type={showConfirm ? 'text' : 'password'}
              value={form.confirmPassword}
              onChange={update('confirmPassword')}
              placeholder="Repete a palavra-passe"
              required
              autoComplete="new-password"
              className="input-field pr-11"
            />
            <button
              type="button"
              onClick={() => setShowConfirm(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              aria-label={showConfirm ? 'Ocultar confirmação de palavra-passe' : 'Mostrar confirmação de palavra-passe'}
            >
              {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>

      <button type="submit" disabled={loading} className="cta-button w-full mt-2">
        {loading ? (
          <><Loader2 className="w-4 h-4 animate-spin" />A criar conta...</>
        ) : (
          'Começar gratuitamente — 14 dias'
        )}
      </button>

      <p className="text-center text-xs text-muted-foreground">
        Sem cartão de crédito · Cancela quando quiseres
      </p>

      <p className="text-center text-sm text-muted-foreground pt-1">
        Já tens conta?{' '}
        <button type="button" onClick={onSwitchTab} className="text-primary hover:text-primary-hover font-medium transition-colors">
          Entrar
        </button>
      </p>
    </form>
  );
}

// ─── Main Modal (custom implementation for smooth animations) ──────────────
export default function AuthModal({ open, onOpenChange, defaultTab = 'login' }: AuthModalProps) {
  const [tab, setTab] = useState<AuthTab>(defaultTab);
  const [visible, setVisible] = useState(false);
  const [animating, setAnimating] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  // Sync tab when defaultTab prop changes
  useEffect(() => {
    if (open) setTab(defaultTab);
  }, [open, defaultTab]);

  // Handle open/close with smooth transitions
  useEffect(() => {
    if (open) {
      setVisible(true);
      // Small delay to allow DOM to render before triggering animation
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setAnimating(true));
      });
    } else {
      setAnimating(false);
      const timer = setTimeout(() => setVisible(false), 300);
      return () => clearTimeout(timer);
    }
  }, [open]);

  const handleClose = () => {
    onOpenChange(false);
  };

  // Close on overlay click
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) handleClose();
  };

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  // Prevent body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-md transition-opacity duration-300 ease-out"
        style={{ opacity: animating ? 1 : 0 }}
        onClick={handleOverlayClick}
      />

      {/* Content */}
      <div className="absolute inset-0 flex items-center justify-center p-4" onClick={handleOverlayClick}>
        <div
          ref={contentRef}
          className="relative w-full max-w-md bg-card border border-border rounded-2xl shadow-modal p-6 sm:p-8 outline-none
                     transition-all duration-300 ease-out max-h-[90vh] overflow-y-auto no-scrollbar"
          style={{
            opacity: animating ? 1 : 0,
            transform: animating ? 'scale(1)' : 'scale(0.95)',
          }}
          onClick={e => e.stopPropagation()}
        >
          {/* Close button */}
          <button
            onClick={handleClose}
            className="absolute right-3 top-3 sm:right-4 sm:top-4 p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-all z-10"
            aria-label="Fechar"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Logo mark */}
          <div className="flex items-center gap-2.5 mb-6">
            <div className="w-8 h-8 rounded-lg gradient-bg flex items-center justify-center shadow-glow-sm">
              <UtensilsCrossed className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-foreground">REST Finance</span>
          </div>

          {/* Tab switcher */}
          <div className="flex items-center gap-1 p-1 rounded-xl bg-muted mb-6 relative">
            {/* Sliding indicator */}
            <div
              className="absolute top-1 bottom-1 rounded-lg bg-card shadow-sm transition-all duration-300 ease-out"
              style={{
                left: tab === 'login' ? '4px' : '50%',
                width: 'calc(50% - 4px)',
              }}
            />
            <button
              type="button"
              onClick={() => setTab('login')}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors duration-200 relative z-10 ${
                tab === 'login' ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Entrar
            </button>
            <button
              type="button"
              onClick={() => setTab('register')}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors duration-200 relative z-10 ${
                tab === 'register' ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Criar Conta
            </button>
          </div>

          {/* Form with transition */}
          <div className="transition-all duration-200 ease-out">
            {tab === 'login' ? (
              <LoginForm onSwitchTab={() => setTab('register')} />
            ) : (
              <RegisterForm onSwitchTab={() => setTab('login')} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
