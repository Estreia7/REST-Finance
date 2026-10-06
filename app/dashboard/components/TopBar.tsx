'use client';

import { Menu } from 'lucide-react';
import LanguageSelector from '@/app/components/LanguageSelector';
import { useLanguage } from '@/lib/language-context';
import WhatsNew from './WhatsNew';
import RestaurantLogo from './RestaurantLogo';

type Tab = 'dashboard' | 'revenue' | 'costs' | 'analytics' | 'accounting' | 'compliance' | 'schedule' | 'estado' | 'users' | 'billing' | 'settings';

/** Which dictionary entry names each tab in the breadcrumb. */
const TAB_LABEL_KEYS: Record<Tab, string> = {
  dashboard:  'topBar.tabDashboard',
  revenue:    'topBar.tabRevenue',
  costs:      'topBar.tabCosts',
  analytics:  'topBar.tabAnalytics',
  accounting: 'topBar.tabAccounting',
  compliance: 'topBar.tabCompliance',
  schedule:   'topBar.tabSchedule',
  estado:     'topBar.tabEstado',
  users:      'topBar.tabTeam',
  billing:    'topBar.tabBilling',
  settings:   'topBar.tabSettings',
};

interface TopBarProps {
  activeTab:    Tab;
  restaurant:   any;
  onMenuClick:  () => void;
}

export default function TopBar({ activeTab, restaurant, onMenuClick }: TopBarProps) {
  const { t } = useLanguage();

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between gap-4 h-14 px-4 md:px-6 bg-background/80 backdrop-blur-xl border-b border-border-subtle">
      {/* Mobile menu button */}
      <button
        onClick={onMenuClick}
        className="md:hidden p-2 -ml-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
        aria-label={t('topBar.openMenu')}
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Breadcrumb. The logo stays on a phone, where the name does not fit,
          so the restaurant is still named on every screen. */}
      <div className="flex items-center gap-2 text-sm min-w-0">
        {restaurant && (
          <RestaurantLogo
            logoPath={restaurant.logoPath}
            name={restaurant.name}
            size={26}
            decorative={false}
            className="sm:hidden"
          />
        )}
        {restaurant && (
          <span className="hidden sm:flex items-center gap-2 min-w-0">
            <RestaurantLogo logoPath={restaurant.logoPath} name={restaurant.name} size={24} />
            <span className="text-muted-foreground truncate">{restaurant.name}</span>
          </span>
        )}
        <span className="text-muted-foreground/40 hidden sm:block">/</span>
        <span className="font-semibold text-foreground">{t(TAB_LABEL_KEYS[activeTab])}</span>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-2 shrink-0">
        <WhatsNew />
        <LanguageSelector />
      </div>
    </header>
  );
}
