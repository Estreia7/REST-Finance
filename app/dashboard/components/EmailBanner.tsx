'use client';

import { Mail, Loader2 } from 'lucide-react';

interface EmailBannerProps {
  onResend:    () => void;
  isResending: boolean;
}

export default function EmailBanner({ onResend, isResending }: EmailBannerProps) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-2.5 text-sm bg-info/10 border-b border-info/20 text-blue-300">
      <div className="flex items-center gap-2">
        <Mail className="w-4 h-4 shrink-0" />
        <span>Confirma o teu email para garantir o acesso contínuo.</span>
      </div>
      <button
        onClick={onResend}
        disabled={isResending}
        className="shrink-0 flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold bg-info/20 hover:bg-info/30 transition-colors disabled:opacity-50"
      >
        {isResending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
        Reenviar email
      </button>
    </div>
  );
}
