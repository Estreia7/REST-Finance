'use client';

import type { ComponentType } from 'react';
import { LogOut, Moon, PanelLeft, Sun } from 'lucide-react';
import { useLanguage } from '@/lib/language-context';
import { Dock, DockDivider, DockItem } from '@/app/dashboard/components/Dock';

/** The console's destinations as a dock; see DashboardDock for the owner's. */
export default function AdminDock<T extends string>({
  items, activeTab, onTabChange, theme, onToggleTheme, onUseSidebar, onLogout,
}: {
  items: ReadonlyArray<{ id: T; icon: ComponentType; labelKey: string; badge?: number }>;
  activeTab: T;
  onTabChange: (tab: T) => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onUseSidebar: () => void;
  onLogout: () => void;
}) {
  const { t } = useLanguage();

  return (
    <Dock theme={theme} label={t('nav.dockLabel')}>
      {items.map(({ id, icon: Icon, labelKey, badge }) => (
        <DockItem
          key={id}
          label={t(labelKey)}
          icon={<Icon />}
          current={activeTab === id}
          badge={badge}
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
      <DockItem label={t('admin.nav.signOut')} icon={<LogOut />} onClick={onLogout} />
    </Dock>
  );
}
