import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="card-glass p-8 max-w-md w-full text-center space-y-4">
        <div className="text-6xl font-bold text-primary/20">404</div>
        <h2 className="text-xl font-semibold text-foreground">Pagina nao encontrada</h2>
        <p className="text-muted-foreground text-sm">
          A pagina que procura nao existe ou foi movida.
        </p>
        <div className="flex gap-3 justify-center">
          <Link
            href="/dashboard"
            className="cta-button px-6 py-2 text-sm"
          >
            Ir para o Dashboard
          </Link>
          <Link
            href="/"
            className="px-6 py-2 text-sm rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors"
          >
            Pagina inicial
          </Link>
        </div>
      </div>
    </div>
  );
}
