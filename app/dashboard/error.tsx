'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Dashboard error:', error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="card-glass p-8 max-w-md w-full text-center space-y-4">
        <div className="w-16 h-16 mx-auto rounded-full bg-amber-500/10 flex items-center justify-center">
          <AlertTriangle className="w-8 h-8 text-amber-500" />
        </div>
        <h2 className="text-xl font-semibold text-foreground">Erro no Dashboard</h2>
        <p className="text-muted-foreground text-sm">
          Nao foi possivel carregar o dashboard. Verifique a sua ligacao e tente novamente.
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={reset}
            className="cta-button px-6 py-2 text-sm inline-flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Tentar novamente
          </button>
          <a
            href="/"
            className="px-6 py-2 text-sm rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors"
          >
            Voltar ao inicio
          </a>
        </div>
      </div>
    </div>
  );
}
