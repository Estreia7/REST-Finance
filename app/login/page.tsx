'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Mail, Lock, ArrowRight, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { checkUserRole, loginWithPassword } from './actions';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      // Use server action to handle login (can auto-confirm email if needed)
      const result = await loginWithPassword(email, password);

      // If email was just confirmed, retry login automatically
      if (result.error === 'EMAIL_CONFIRMED_RETRY') {
        const supabase = createClient();
        const { data: retryData, error: retryError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (retryError || !retryData?.user) {
          setError('Email confirmado, mas falha ao fazer login. Tente novamente.');
          setIsLoading(false);
          return;
        }

        // Wait a bit to ensure cookies are set
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Check if user has PLATFORM_ADMIN role
        const roleCheck = await checkUserRole(retryData.user.id);
        
        // Refresh to update server-side cookies
        router.refresh();
        
        // Redirect to admin dashboard if user is admin, otherwise to regular dashboard
        if (roleCheck.isAdmin) {
          router.push('/admin');
        } else {
          router.push('/dashboard');
        }
        return;
      }

      if (!result.success || !result.user) {
        setError(result.error || 'Erro ao fazer login. Verifique suas credenciais.');
        setIsLoading(false);
        return;
      }

      // Wait a bit to ensure cookies are set
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Check if user has PLATFORM_ADMIN role
      const roleCheck = await checkUserRole(result.user.id);
      
      // Refresh to update server-side cookies
      router.refresh();
      
      // Redirect to admin dashboard if user is admin, otherwise to regular dashboard
      if (roleCheck.isAdmin) {
        router.push('/admin');
      } else {
        router.push('/dashboard');
      }
    } catch (err: any) {
      const errorMessage = err?.message || 'Ocorreu um erro inesperado. Tente novamente.';
      setError(errorMessage);
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
            Bem-vindo de volta
          </h1>
          <p className="text-muted-foreground">
            Entre na sua conta para continuar
          </p>
        </div>

        {/* Formulário */}
        <div className="card p-8 space-y-6">
          {error && (
            <div className="flex items-center gap-3 p-4 rounded-lg bg-danger/10 border border-danger/30 text-danger">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <p className="text-sm">{error}</p>
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-6">
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

            {/* Password */}
            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-semibold text-foreground">
                Palavra-passe
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full pl-10 pr-12 py-3 bg-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                >
                  {showPassword ? (
                    <EyeOff className="w-5 h-5" />
                  ) : (
                    <Eye className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>

            {/* Esqueceu a senha */}
            <div className="flex justify-end">
              <Link
                href="/forgot-password"
                className="text-sm text-primary hover:text-accent transition-colors font-medium"
              >
                Esqueceu a sua palavra-passe?
              </Link>
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
                  <span>A entrar...</span>
                </>
              ) : (
                <>
                  <span>Entrar</span>
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
          </form>

          {/* Divisor */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-4 bg-card text-muted-foreground">
                Ainda não tem conta?
              </span>
            </div>
          </div>

          {/* Link para Registar */}
          <Link
            href="/register"
            className="w-full cta-button-secondary flex items-center justify-center gap-2"
          >
            <span>Criar conta</span>
            <ArrowRight className="w-5 h-5" />
          </Link>
        </div>

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
