'use client';

import { LogOut, Moon, PanelLeft, Sun } from 'lucide-react';
import { useLanguage } from '@/lib/language-context';
import { hasModule, type ModuleKey } from '@/lib/modules';
import { Dock, DockDivider, DockItem } from './Dock';
import { NAV_MAIN, NAV_MANAGE, type Tab } from './Sidebar';

/**
 * The sidebar's destinations, as a dock. Loaded only when it is switched on,
 * so nobody who keeps the sidebar, and no phone, downloads the animation
 * library behind it.
 */
export default function DashboardDock({
  activeTab, onTabChange, theme, onToggleTheme, onUseSidebar, onLogout, badges, modules,
}: {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onUseSidebar: () => void;
  onLogout: () => void;
  badges?: Partial<Record<Tab, number>>;
  modules?: ModuleKey[];
}) {
  const { t } = useLanguage();
  const items = [
    ...NAV_MAIN.filter((item) => !item.module || hasModule(modules, item.module)),
    ...NAV_MANAGE,
  ];

  return (
    <Dock theme={theme} label={t('nav.dockLabel')}>
      {items.map(({ id, icon: Icon, tKey }) => (
        <DockItem
          key={id}
          label={t(tKey)}
          icon={<Icon />}
          current={activeTab === id}
          badge={badges?.[id]}
          tour={`nav-${id}`}
          onClick={() => onTabChange(id)}
        />
      ))}
      <DockDivider />
      <DockItem
        label={t(theme === 'dark' ? 'nav.dockLight' : 'nav.dockDark')}
        icon={theme === 'dark' ? <Sun /> : <Moon />}
        pressed={theme === 'dark'}
        onClick={onToggleTheme}
      />
      <DockItem label={t('nav.useSidebar')} icon={<PanelLeft />} onClick={onUseSidebar} />
      <DockItem label={t('nav.logout')} icon={<LogOut />} onClick={onLogout} />
    </Dock>
  );
}
