'use client';

import { LayoutDashboard, TrendingUp, DollarSign, Settings, BarChart3 } from 'lucide-react';
import { useLanguage } from '@/lib/language-context';

type Tab = 'dashboard' | 'revenue' | 'costs' | 'analytics' | 'compliance' | 'schedule' | 'estado' | 'users' | 'billing' | 'settings';

/** The label is a key: the bar is short on width, so it gets its own, abbreviated wording. */
const items = [
  { id: 'dashboard' as Tab, icon: LayoutDashboard, labelKey: 'mobileNav.dashboard' },
  { id: 'revenue'   as Tab, icon: TrendingUp,      labelKey: 'mobileNav.revenue' },
  { id: 'costs'     as Tab, icon: DollarSign,      labelKey: 'mobileNav.costs' },
  { id: 'analytics' as Tab, icon: BarChart3,       labelKey: 'mobileNav.analytics' },
  { id: 'settings'  as Tab, icon: Settings,        labelKey: 'mobileNav.settings' },
];

export default function MobileBottomNav({ activeTab, onTabChange }: { activeTab: Tab; onTabChange: (t: Tab) => void }) {
  const { t } = useLanguage();
  const activeIndex = items.findIndex(i => i.id === activeTab);

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 md:hidden">
      {/* Safe area background */}
      <div className="bg-card/90 backdrop-blur-2xl border-t border-border-subtle pb-[env(safe-area-inset-bottom)]">
        <div className="relative flex items-center justify-around px-1 py-1.5">
          {/* Sliding active indicator */}
          <div
            className="absolute top-1 h-[calc(100%-8px)] rounded-xl bg-muted transition-all duration-300 ease-out"
            style={{
              width: `${100 / items.length}%`,
              left: `${(activeIndex / items.length) * 100}%`,
            }}
          />

          {items.map(({ id, icon: Icon, labelKey }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onTabChange(id)}
                aria-current={active ? 'page' : undefined}
                // touch-manipulation drops the 300ms double-tap-to-zoom wait,
                // which is the delay that makes a tap feel like it was missed.
                className="relative flex flex-col items-center gap-0.5 flex-1 py-2 min-h-[48px]
                           rounded-xl transition-all duration-200 touch-manipulation
                           focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-300 ${
                    active ? 'gradient-bg shadow-glow-sm scale-110' : 'scale-100'
                  }`}
                >
                  <Icon className={`w-[18px] h-[18px] transition-colors duration-200 ${active ? 'text-white' : 'text-muted-foreground'}`} />
                </div>
                <span
                  className={`text-[10px] font-medium transition-all duration-200 ${
                    active ? 'text-primary opacity-100' : 'text-muted-foreground opacity-70'
                  }`}
                >
                  {t(labelKey)}
                </span>
                {/* Active dot */}
                <div
                  className={`absolute -bottom-0.5 w-1 h-1 rounded-full bg-primary transition-all duration-300 ${
                    active ? 'opacity-100 scale-100' : 'opacity-0 scale-0'
                  }`}
                />
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
