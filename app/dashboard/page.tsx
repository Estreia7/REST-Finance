'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { LogOut, User, DollarSign } from 'lucide-react';

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkUser = async () => {
      const supabase = createClient();
      const { data: { user }, error } = await supabase.auth.getUser();

      if (error || !user) {
        router.push('/login');
        return;
      }

      setUser(user);
      setIsLoading(false);
    };

    checkUser();
  }, [router]);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  if (isLoading) {
    return (
      <main className="flex-1 flex items-center justify-center min-h-screen pt-16 md:pt-20">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-muted-foreground">A carregar...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 min-h-screen pt-16 md:pt-20">
      <div className="container py-8 md:py-12">
        <div className="max-w-6xl mx-auto space-y-8">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold mb-2">
                Bem-vindo de volta!
              </h1>
              <p className="text-muted-foreground">
                {user?.email}
              </p>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors border border-border rounded-lg hover:bg-card"
            >
              <LogOut className="w-4 h-4" />
              Sair
            </button>
          </div>

          {/* Dashboard Content */}
          <div className="grid md:grid-cols-3 gap-6">
            <div className="card p-6 space-y-4">
              <div className="w-12 h-12 rounded-lg bg-primary/20 flex items-center justify-center">
                <DollarSign className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-xl font-semibold">Receita Total</h3>
              <p className="text-3xl font-bold">€0.00</p>
              <p className="text-sm text-muted-foreground">Este mês</p>
            </div>

            <div className="card p-6 space-y-4">
              <div className="w-12 h-12 rounded-lg bg-primary/20 flex items-center justify-center">
                <User className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-xl font-semibold">Restaurantes</h3>
              <p className="text-3xl font-bold">0</p>
              <p className="text-sm text-muted-foreground">Ativos</p>
            </div>

            <div className="card p-6 space-y-4">
              <div className="w-12 h-12 rounded-lg bg-primary/20 flex items-center justify-center">
                <DollarSign className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-xl font-semibold">Margem de Lucro</h3>
              <p className="text-3xl font-bold">0%</p>
              <p className="text-sm text-muted-foreground">Média</p>
            </div>
          </div>

          {/* Welcome Message */}
          <div className="card p-8 text-center space-y-4">
            <h2 className="text-2xl font-bold">Bem-vindo ao REST Finance!</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Você está logado com sucesso. Esta é a sua área de dashboard onde poderá gerenciar 
              os KPIs do seu restaurante. Em breve, você poderá adicionar restaurantes e começar 
              a rastrear suas finanças.
            </p>
            <Link
              href="/"
              className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-lg font-semibold hover:opacity-90 transition-opacity"
            >
              Voltar para a página inicial
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
