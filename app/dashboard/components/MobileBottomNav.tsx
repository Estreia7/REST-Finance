'use client';

import { LayoutDashboard, TrendingUp, DollarSign, Users, Settings, BarChart3 } from 'lucide-react';

type Tab = 'dashboard' | 'revenue' | 'costs' | 'analytics' | 'users' | 'billing' | 'settings';

const items = [
  { id: 'dashboard' as Tab, icon: LayoutDashboard, label: 'Dashboard' },
  { id: 'revenue'   as Tab, icon: TrendingUp,       label: 'Receita' },
  { id: 'costs'     as Tab, icon: DollarSign,       label: 'Custos' },
  { id: 'analytics' as Tab, icon: BarChart3,         label: 'Análises' },
  { id: 'settings'  as Tab, icon: Settings,          label: 'Config.' },
];

export default function MobileBottomNav({ activeTab, onTabChange }: { activeTab: Tab; onTabChange: (t: Tab) => void }) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 md:hidden bg-card/80 backdrop-blur-xl border-t border-white/5">
      <div className="flex items-center justify-around px-2 py-2">
        {items.map(({ id, icon: Icon, label }) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              onClick={() => onTabChange(id)}
              className="flex flex-col items-center gap-1 px-3 py-1.5 rounded-xl transition-all duration-150"
            >
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${active ? 'gradient-bg shadow-glow-sm' : ''}`}>
                <Icon className={`w-4 h-4 ${active ? 'text-white' : 'text-muted-foreground'}`} />
              </div>
              <span className={`text-[10px] font-medium ${active ? 'text-primary' : 'text-muted-foreground'}`}>{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
