'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Eye, EyeOff, ArrowLeft, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { useLanguage } from '@/lib/language-context';
import { translateError } from '@/lib/error-messages';
import { resetPasswordWithToken } from '@/app/forgot-password/actions';
import { MIN_PASSWORD_LENGTH } from '@/lib/validations';

function ResetPasswordForm() {
  const router = useRouter();
  const { t, language } = useLanguage();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);

  // The reset link carries a single-use token as a query parameter.
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';

  useEffect(() => {
    setSessionReady(Boolean(token));
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // The same two rules the sign-up form states, so they read identically.
    if (password !== confirmPassword) {
      setError(t('register.errors.passwordsDontMatch'));
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(t('register.errors.passwordTooShort'));
      return;
    }

    setIsLoading(true);

    try {
      const result = await resetPasswordWithToken(token, password);

      if (result.error) {
        setError(translateError(language, result.error));
        return;
      }

      setSuccess(true);
      setTimeout(() => {
        router.push('/login');
        router.refresh();
      }, 2000);
    } catch {
      setError(t('resetPassword.unexpectedError'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="flex-1 flex items-center justify-center min-h-screen pt-16 md:pt-20 px-4">
      <div className="w-full max-w-md">
        {/* Logo e Título */}
        <div className="text-center mb-8 space-y-4">
          <Link href="/" className="inline-flex items-center gap-2 group mb-6">
            <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center group-hover:scale-110 transition-transform">
              <span className="text-2xl font-bold text-primary-foreground">R</span>
            </div>
            <span className="text-2xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              REST Finance
            </span>
          </Link>
          <h1 className="text-3xl md:text-4xl font-bold">
            {success ? t('resetPassword.titleSuccess') : t('resetPassword.title')}
          </h1>
          <p className="text-muted-foreground">
            {success
              ? t('resetPassword.subtitleSuccess')
              : t('resetPassword.subtitle')}
          </p>
        </div>

        {success ? (
          <div className="card p-8 space-y-6 text-center">
            <div className="w-16 h-16 rounded-full bg-success/20 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8 text-green-400" />
            </div>
            <p className="text-muted-foreground">
              {t('resetPassword.successBody')}
            </p>
            <div className="w-full bg-border rounded-full h-1 overflow-hidden">
              <div className="h-full bg-primary rounded-full" style={{ width: '100%', transition: 'width 2s ease' }} />
            </div>
          </div>
        ) : !sessionReady ? (
          <div className="card p-8 text-center space-y-4">
            <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
            <p className="text-muted-foreground text-sm">{t('resetPassword.verifyingLink')}</p>
          </div>
        ) : (
          <div className="card p-8 space-y-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              {error && (
                <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-danger/10 border border-danger/20 text-sm text-red-400">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="space-y-2">
                <label htmlFor="new-password" className="text-sm font-semibold text-foreground">{t('resetPassword.newPasswordLabel')}</label>
                <div className="relative">
                  <input
                    id="new-password"
                    type={showPass ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder={t('resetPassword.newPasswordPlaceholder')}
                    required
                    autoComplete="new-password"
                    className="input-field pr-11"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    aria-label={showPass ? t('resetPassword.hidePassword') : t('resetPassword.showPassword')}
                  >
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="confirm-password" className="text-sm font-semibold text-foreground">{t('resetPassword.confirmPasswordLabel')}</label>
                <div className="relative">
                  <input
                    id="confirm-password"
                    type={showConfirm ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    placeholder={t('resetPassword.confirmPasswordPlaceholder')}
                    required
                    autoComplete="new-password"
                    className="input-field pr-11"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    aria-label={showConfirm ? t('resetPassword.hideConfirmPassword') : t('resetPassword.showConfirmPassword')}
                  >
                    {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button type="submit" disabled={isLoading} className="w-full cta-button flex items-center justify-center gap-2">
                {isLoading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" />{t('resetPassword.submitting')}</>
                ) : (
                  t('resetPassword.submit')
                )}
              </button>
            </form>

            <div className="pt-4 border-t border-border">
              <Link
                href="/login"
                className="flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>{t('resetPassword.backToLogin')}</span>
              </Link>
            </div>
          </div>
        )}

        <div className="text-center mt-6">
          <Link
            href="/"
            className="text-sm text-muted-foreground hover:text-primary transition-colors"
          >
            {t('resetPassword.backHome')}
          </Link>
        </div>
      </div>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
