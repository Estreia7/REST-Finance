'use client';

import { useLanguage } from '@/lib/language-context';
import { Wordmark } from '@/app/components/Logo';
import RestaurantSwitcher from './RestaurantSwitcher';
import { LayoutDashboard, TrendingUp, DollarSign, Users, CreditCard, Settings, LogOut, X, BarChart3, ShieldCheck, CalendarDays } from 'lucide-react';

type Tab = 'dashboard' | 'revenue' | 'costs' | 'analytics' | 'compliance' | 'schedule' | 'users' | 'billing' | 'settings';

interface SidebarProps {
  activeTab:    Tab;
  onTabChange:  (tab: Tab) => void;
  restaurant:   any;
  currentUser:  any;
  plan:         string;
  daysLeft?:    number;
  onLogout:     () => void;
  isOpen:       boolean;
  onClose:      () => void;
}

const NAV_MAIN = [
  { id: 'dashboard' as Tab, icon: LayoutDashboard, tKey: 'nav.dashboard' },
  { id: 'revenue'   as Tab, icon: TrendingUp,      tKey: 'nav.revenue' },
  { id: 'costs'     as Tab, icon: DollarSign,      tKey: 'nav.costs' },
  { id: 'analytics' as Tab, icon: BarChart3,       tKey: 'nav.analytics' },
  { id: 'compliance' as Tab, icon: ShieldCheck,    tKey: 'nav.compliance' },
  { id: 'schedule'  as Tab, icon: CalendarDays,    tKey: 'nav.schedule' },
] as const;

const NAV_MANAGE = [
  { id: 'users'    as Tab, icon: Users,      tKey: 'nav.team' },
  { id: 'billing'  as Tab, icon: CreditCard, tKey: 'nav.billing' },
  { id: 'settings' as Tab, icon: Settings,   tKey: 'nav.settings' },
] as const;

function SidebarContent({ activeTab, onTabChange, restaurant, currentUser, onLogout, onClose }: Omit<SidebarProps, 'isOpen'>) {
  const { t } = useLanguage();


  const NavItem = ({ id, icon: Icon, label }: { id: Tab; icon: any; label: string }) => (
    <button
      onClick={() => { onTabChange(id); onClose(); }}
      className={`nav-item w-full ${activeTab === id ? 'active' : ''}`}
    >
      <Icon className="w-4 h-4 shrink-0" />
      <span>{label}</span>
    </button>
  );

  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center justify-between px-4 h-16 border-b border-border-subtle shrink-0">
        <div className="flex items-center gap-2.5">
          <Wordmark markSize={30} />
        </div>
        <button onClick={onClose} className="md:hidden p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-all" aria-label="Fechar menu">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Renders nothing unless this person holds more than one restaurant. */}
      <div className="px-3 pt-3 empty:hidden">
        <RestaurantSwitcher />
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto no-scrollbar p-3 space-y-6 pt-4">
        <div>
          <div className="section-label px-3 mb-2">{t('nav.sectionMain')}</div>
          <div className="space-y-0.5">
            {NAV_MAIN.map(({ id, icon, tKey }) => (
              <NavItem key={id} id={id} icon={icon} label={t(tKey)} />
            ))}
          </div>
        </div>
        <div>
          <div className="section-label px-3 mb-2">{t('nav.sectionManage')}</div>
          <div className="space-y-0.5">
            {NAV_MANAGE.map(({ id, icon, tKey }) => (
              <NavItem key={id} id={id} icon={icon} label={t(tKey)} />
            ))}
          </div>
        </div>
      </nav>

      {/* User card */}
      <div className="p-3 border-t border-border-subtle shrink-0">
        <div className="flex items-center gap-3 p-3 rounded-xl bg-muted border border-border-subtle">
          <div className="w-8 h-8 rounded-lg gradient-bg flex items-center justify-center shrink-0">
            <span className="text-white font-bold text-xs">
              {(currentUser?.name || currentUser?.email || 'U').charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-foreground truncate">
              {currentUser?.name || 'Utilizador'}
            </div>
            <div className="text-[10px] text-muted-foreground truncate">
              {restaurant?.name || '—'}
            </div>
          </div>
          <button
            onClick={onLogout}
            title={t('nav.logout')}
            aria-label={t('nav.logout')}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-all shrink-0"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Sidebar(props: SidebarProps) {
  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col fixed left-0 top-0 bottom-0 w-60 bg-card/60 backdrop-blur-xl border-r border-border-subtle z-40">
        <SidebarContent {...props} onClose={() => {}} />
      </aside>

      {/* Mobile overlay */}
      {props.isOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 md:hidden animate-fade-in"
            onClick={props.onClose}
          />
          <aside className="fixed left-0 top-0 bottom-0 w-72 bg-card border-r border-border-subtle z-50 md:hidden animate-slide-in flex flex-col">
            <SidebarContent {...props} />
          </aside>
        </>
      )}
    </>
  );
}
