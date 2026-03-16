'use client';

import { LayoutDashboard, TrendingUp, DollarSign, Users, CreditCard, Settings, LogOut, X, BarChart3 } from 'lucide-react';

type Tab = 'dashboard' | 'revenue' | 'costs' | 'analytics' | 'users' | 'billing' | 'settings';

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
  { id: 'dashboard' as Tab, icon: LayoutDashboard, label: 'Dashboard' },
  { id: 'revenue'   as Tab, icon: TrendingUp,       label: 'Receita' },
  { id: 'costs'     as Tab, icon: DollarSign,       label: 'Custos' },
  { id: 'analytics' as Tab, icon: BarChart3,         label: 'Análises' },
] as const;

const NAV_MANAGE = [
  { id: 'users'    as Tab, icon: Users,      label: 'Equipa' },
  { id: 'billing'  as Tab, icon: CreditCard, label: 'Faturação' },
  { id: 'settings' as Tab, icon: Settings,   label: 'Configurações' },
] as const;

function SidebarContent({ activeTab, onTabChange, restaurant, currentUser, onLogout, onClose }: Omit<SidebarProps, 'isOpen'>) {

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
      <div className="flex items-center justify-between px-4 h-16 border-b border-white/5 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl gradient-bg flex items-center justify-center shadow-glow-sm">
            <span className="text-white font-black text-sm">R</span>
          </div>
          <span className="font-black text-sm gradient-text">REST Finance</span>
        </div>
        <button onClick={onClose} className="md:hidden p-1.5 rounded-lg hover:bg-white/5 text-muted-foreground hover:text-foreground transition-all" aria-label="Fechar menu">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto no-scrollbar p-3 space-y-6 pt-4">
        <div>
          <div className="section-label px-3 mb-2">Visão Geral</div>
          <div className="space-y-0.5">
            {NAV_MAIN.map(item => <NavItem key={item.id} {...item} />)}
          </div>
        </div>
        <div>
          <div className="section-label px-3 mb-2">Gestão</div>
          <div className="space-y-0.5">
            {NAV_MANAGE.map(item => <NavItem key={item.id} {...item} />)}
          </div>
        </div>
      </nav>

      {/* User card */}
      <div className="p-3 border-t border-white/5 shrink-0">
        <div className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/5">
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
            title="Sair"
            aria-label="Sair"
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all shrink-0"
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
      <aside className="hidden md:flex flex-col fixed left-0 top-0 bottom-0 w-60 bg-card/60 backdrop-blur-xl border-r border-white/5 z-40">
        <SidebarContent {...props} onClose={() => {}} />
      </aside>

      {/* Mobile overlay */}
      {props.isOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 md:hidden animate-fade-in"
            onClick={props.onClose}
          />
          <aside className="fixed left-0 top-0 bottom-0 w-72 bg-card border-r border-white/5 z-50 md:hidden animate-slide-in flex flex-col">
            <SidebarContent {...props} />
          </aside>
        </>
      )}
    </>
  );
}
