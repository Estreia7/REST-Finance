'use client';

import { Menu } from 'lucide-react';
import LanguageSelector from '@/app/components/LanguageSelector';

type Tab = 'dashboard' | 'revenue' | 'costs' | 'analytics' | 'users' | 'billing' | 'settings';

const TAB_LABELS: Record<Tab, string> = {
  dashboard: 'Dashboard',
  revenue:   'Receita',
  costs:     'Custos',
  analytics: 'Análises',
  users:     'Equipa',
  billing:   'Faturação',
  settings:  'Configurações',
};

interface TopBarProps {
  activeTab:    Tab;
  restaurant:   any;
  onMenuClick:  () => void;
}

export default function TopBar({ activeTab, restaurant, onMenuClick }: TopBarProps) {
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between gap-4 h-14 px-4 md:px-6 bg-background/80 backdrop-blur-xl border-b border-white/5">
      {/* Mobile menu button */}
      <button
        onClick={onMenuClick}
        className="md:hidden p-2 -ml-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm min-w-0">
        <span className="text-muted-foreground hidden sm:block truncate">{restaurant?.name ?? '—'}</span>
        <span className="text-muted-foreground/40 hidden sm:block">/</span>
        <span className="font-semibold text-foreground">{TAB_LABELS[activeTab]}</span>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-2 shrink-0">
        <LanguageSelector />
      </div>
    </header>
  );
}
