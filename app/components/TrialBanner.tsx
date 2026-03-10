'use client';

import { useState } from 'react';
import { X, Zap, Clock } from 'lucide-react';

interface TrialBannerProps {
  daysLeft: number;
  onUpgrade: () => void;
}

export default function TrialBanner({ daysLeft, onUpgrade }: TrialBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  const isUrgent = daysLeft <= 3;

  return (
    <div className={`relative flex items-center justify-between gap-4 px-4 py-2.5 text-sm ${
      isUrgent
        ? 'bg-amber-500/10 border-b border-amber-500/20 text-amber-300'
        : 'bg-violet-500/10 border-b border-violet-500/20 text-violet-300'
    }`}>
      <div className="flex items-center gap-2.5 flex-1 min-w-0">
        <Clock className="w-4 h-4 shrink-0" />
        <span className="truncate">
          {daysLeft === 0
            ? 'O teu trial termina hoje!'
            : `Trial gratuito: ${daysLeft} dia${daysLeft !== 1 ? 's' : ''} restante${daysLeft !== 1 ? 's' : ''}`}
        </span>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <button
          onClick={onUpgrade}
          className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold gradient-bg text-white shadow-glow-sm hover:shadow-glow transition-all"
        >
          <Zap className="w-3 h-3" />
          Fazer upgrade
        </button>
        <button
          onClick={() => setDismissed(true)}
          className="p-1 rounded opacity-60 hover:opacity-100 transition-opacity"
          aria-label="Fechar"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
