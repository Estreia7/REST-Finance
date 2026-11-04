'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { saveNavPreferences } from '@/app/dashboard/nav-actions';
import { translateError } from '@/lib/error-messages';
import { useLanguage } from '@/lib/language-context';
import { isDockTheme, isNavMode, type DockTheme, type NavMode } from '@/lib/nav-preferences';

/**
 * The desktop navigation this person chose: the sidebar or the dock, and the
 * dock's look. Shared by the dashboard and the admin console, so the choice
 * made in one is the choice in the other.
 *
 * @param user the signed-in account as the page loaded it, null until then.
 */
export function useNavPreferences(user: { navMode?: unknown; dockTheme?: unknown } | null) {
  const { language } = useLanguage();
  const [navMode, setNavMode] = useState<NavMode>('sidebar');
  const [dockTheme, setDockTheme] = useState<DockTheme>('light');
  const docked = navMode === 'dock';

  // The account's choice, once it has loaded.
  useEffect(() => {
    if (isNavMode(user?.navMode)) setNavMode(user.navMode);
    if (isDockTheme(user?.dockTheme)) setDockTheme(user.dockTheme);
  }, [user]);

  // The assistant's button moves up out of the dock's way by this attribute.
  // See the dock rules in globals.css.
  useEffect(() => {
    document.documentElement.toggleAttribute('data-docked', docked);
    return () => document.documentElement.removeAttribute('data-docked');
  }, [docked]);

  /** Shown at once, then saved; a failed save puts the old value back. */
  const changeNav = async (key: 'navMode' | 'dockTheme', value: NavMode | DockTheme) => {
    const undo = key === 'navMode' ? navMode : dockTheme;
    const apply = (v: NavMode | DockTheme) => (key === 'navMode' ? setNavMode(v as NavMode) : setDockTheme(v as DockTheme));
    apply(value);
    const result = await saveNavPreferences({ [key]: value });
    if (!result.success) {
      apply(undo);
      toast.error(translateError(language, result.error));
    }
  };

  return { docked, dockTheme, changeNav };
}
