import { Loader2 } from 'lucide-react';

export default function DashboardLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background" role="status" aria-live="polite">
      <div className="text-center space-y-4">
        <div className="w-12 h-12 mx-auto rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center">
          <span className="text-white font-bold text-lg">R</span>
        </div>
        <Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" />
        <p className="text-muted-foreground text-sm">A carregar...</p>
      </div>
    </div>
  );
}
