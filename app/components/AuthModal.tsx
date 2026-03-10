'use client';

import { useState, useCallback } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, X, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { loginWithPassword, checkUserRole } from '@/app/login/actions';
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
  const { t } = useLanguage();
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

      if (result.success) {
        const roleResult = await checkUserRole(result.user!.id);
        router.push(roleResult.isAdmin ? '/admin' : '/dashboard');
        router.refresh();
        return;
      }

      // Email not confirmed — auto-confirmed on server, ask user to retry
      if (result.error === 'EMAIL_CONFIRMED_RETRY') {
        const retry = await loginWithPassword(email, password);
        if (retry.success) {
          const roleResult = await checkUserRole(retry.user!.id);
          router.push(roleResult.isAdmin ? '/admin' : '/dashboard');
          router.refresh();
          return;
        }
      }

      setError(result.error || 'Erro ao iniciar sessão.');
    } catch {
      setError('Erro inesperado. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }, [email, password, router]);

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-danger/10 border border-danger/20 text-sm text-red-400">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground">Email</label>
        <input
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
        <label className="text-xs font-medium text-muted-foreground">Palavra-passe</label>
        <div className="relative">
          <input
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

      setSuccess(true);
      // Auto-login after short delay
      setTimeout(async () => {
        const loginResult = await loginWithPassword(form.email, form.password);
        if (loginResult.success || loginResult.error === 'EMAIL_CONFIRMED_RETRY') {
          const retry = loginResult.success
            ? loginResult
            : await loginWithPassword(form.email, form.password);
          if (retry.success) {
            router.push('/dashboard?onboarding=true');
            router.refresh();
          }
        }
      }, 1000);
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
          <div className="h-full bg-gradient-to-r from-violet-600 to-indigo-600 animate-gradient rounded-full" style={{ width: '100%', transition: 'width 1s ease' }} />
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-danger/10 border border-danger/20 text-sm text-red-400">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4">
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">O teu nome</label>
          <input
            type="text"
            value={form.name}
            onChange={update('name')}
            placeholder="João Silva"
            required
            className="input-field"
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">Nome do restaurante</label>
          <input
            type="text"
            value={form.restaurantName}
            onChange={update('restaurantName')}
            placeholder="Restaurante O Meu Lugar"
            required
            className="input-field"
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">Email</label>
          <input
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
          <label className="text-xs font-medium text-muted-foreground">Palavra-passe</label>
          <div className="relative">
            <input
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
            >
              {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">Confirmar palavra-passe</label>
          <div className="relative">
            <input
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

// ─── Main Modal ────────────────────────────────────────────────────────────
export default function AuthModal({ open, onOpenChange, defaultTab = 'login' }: AuthModalProps) {
  const [tab, setTab] = useState<AuthTab>(defaultTab);

  // Sync tab when defaultTab prop changes (e.g., opened from different buttons)
  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) setTab(defaultTab);
    onOpenChange(isOpen);
  };

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md data-[state=open]:animate-fade-in" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2
                     bg-card border border-white/10 rounded-2xl shadow-modal p-8
                     data-[state=open]:animate-fade-in-up outline-none"
          aria-describedby={undefined}
        >
          {/* Close button */}
          <Dialog.Close className="absolute right-4 top-4 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all">
            <X className="w-4 h-4" />
          </Dialog.Close>

          {/* Logo mark */}
          <div className="flex items-center gap-2.5 mb-6">
            <div className="w-8 h-8 rounded-lg gradient-bg flex items-center justify-center shadow-glow-sm">
              <span className="text-white font-black text-sm">R</span>
            </div>
            <span className="font-bold text-foreground">REST Finance</span>
          </div>

          {/* Tab switcher */}
          <div className="flex items-center gap-1 p-1 rounded-xl bg-muted mb-6">
            <button
              type="button"
              onClick={() => setTab('login')}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all duration-150 ${
                tab === 'login'
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Entrar
            </button>
            <button
              type="button"
              onClick={() => setTab('register')}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all duration-150 ${
                tab === 'register'
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Criar Conta
            </button>
          </div>

          {/* Form */}
          <Dialog.Title className="sr-only">
            {tab === 'login' ? 'Entrar na tua conta' : 'Criar conta gratuita'}
          </Dialog.Title>

          {tab === 'login' ? (
            <LoginForm onSwitchTab={() => setTab('register')} />
          ) : (
            <RegisterForm onSwitchTab={() => setTab('login')} />
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
