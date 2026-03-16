'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Mail, ArrowRight, ArrowLeft, AlertCircle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) {
        setError('Erro ao enviar email. Tente novamente.');
        return;
      }

      setIsSubmitted(true);
    } catch {
      setError('Erro inesperado. Tente novamente.');
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
            Recuperar palavra-passe
          </h1>
          <p className="text-muted-foreground">
            {isSubmitted 
              ? 'Verifique o seu email para redefinir a sua palavra-passe'
              : 'Digite o seu email e enviaremos um link para redefinir a sua palavra-passe'}
          </p>
        </div>

        {/* Formulário */}
        {!isSubmitted ? (
          <div className="card p-8 space-y-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              {error && (
                <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-danger/10 border border-danger/20 text-sm text-red-400">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
              {/* Email */}
              <div className="space-y-2">
                <label htmlFor="email" className="text-sm font-semibold text-foreground">
                  Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="seu@email.com"
                    required
                    className="w-full pl-10 pr-4 py-3 bg-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                  />
                </div>
              </div>

              {/* Botão Submit */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full cta-button flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin"></div>
                    <span>A enviar...</span>
                  </>
                ) : (
                  <>
                    <span>Enviar link de recuperação</span>
                    <ArrowRight className="w-5 h-5" />
                  </>
                )}
              </button>
            </form>

            {/* Link para voltar ao login */}
            <div className="pt-4 border-t border-border">
              <Link
                href="/login"
                className="flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Voltar para o login</span>
              </Link>
            </div>
          </div>
        ) : (
          <div className="card p-8 space-y-6 text-center">
            <div className="w-16 h-16 rounded-full bg-success/20 flex items-center justify-center mx-auto">
              <Mail className="w-8 h-8 text-success" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-bold">Email enviado!</h2>
              <p className="text-muted-foreground">
                Enviamos um link de recuperação para <strong className="text-foreground">{email}</strong>
              </p>
            </div>
            <div className="pt-4 border-t border-border space-y-3">
              <Link
                href="/login"
                className="w-full cta-button-secondary flex items-center justify-center gap-2"
              >
                <ArrowLeft className="w-5 h-5" />
                <span>Voltar para o login</span>
              </Link>
            </div>
          </div>
        )}

        {/* Voltar para home */}
        <div className="text-center mt-6">
          <Link
            href="/"
            className="text-sm text-muted-foreground hover:text-primary transition-colors"
          >
            ← Voltar para a página inicial
          </Link>
        </div>
      </div>
    </main>
  );
}
