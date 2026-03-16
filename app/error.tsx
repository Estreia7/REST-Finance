'use client';

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Global error:', error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="card-glass p-8 max-w-md w-full text-center space-y-4">
        <div className="w-16 h-16 mx-auto rounded-full bg-destructive/10 flex items-center justify-center">
          <span className="text-2xl text-destructive">!</span>
        </div>
        <h2 className="text-xl font-semibold text-foreground">Algo correu mal</h2>
        <p className="text-muted-foreground text-sm">
          Ocorreu um erro inesperado. Por favor tente novamente.
        </p>
        <button
          onClick={reset}
          className="cta-button px-6 py-2 text-sm"
        >
          Tentar novamente
        </button>
      </div>
    </div>
  );
}
