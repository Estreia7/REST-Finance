'use client';

import { useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { Check, ChevronDown, Store } from 'lucide-react';
import { getMyRestaurants, setActiveRestaurant } from '../restaurant-actions';
import { useLanguage } from '@/lib/language-context';

type Restaurant = {
  id: string;
  name: string;
  logoPath: string | null;
  role: 'OWNER' | 'STAFF';
};

/**
 * Chooses which restaurant the dashboard is about.
 *
 * Renders nothing at all for the single-restaurant owner, which is almost
 * everyone: a dropdown with one entry is a control that does nothing but take
 * up space and raise a question.
 *
 * Switching reloads rather than refetching panel by panel. Every figure on
 * screen belongs to the old restaurant the instant the cookie changes, and a
 * half-swapped dashboard showing one house's revenue against another's costs
 * would be worse than a moment's wait.
 */
export default function RestaurantSwitcher() {
  const { t } = useLanguage();
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getMyRestaurants().then((result) => {
      if ('data' in result && result.data) {
        setRestaurants(result.data.restaurants);
        setActiveId(result.data.activeId);
      }
    });
  }, []);

  // A click anywhere else closes the menu, as does Escape.
  useEffect(() => {
    if (!open) return;

    const onClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (restaurants.length < 2) return null;

  const active = restaurants.find((r) => r.id === activeId) ?? restaurants[0];

  const choose = async (id: string) => {
    if (id === activeId) {
      setOpen(false);
      return;
    }

    setSwitching(true);
    const result = await setActiveRestaurant(id);

    if (result.error) {
      setSwitching(false);
      toast.error(result.error);
      return;
    }

    window.location.reload();
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={switching}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-lg border border-border bg-surface
                   px-3 py-2 text-left text-sm hover:bg-muted transition-colors
                   focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
                   disabled:opacity-60"
      >
        <Store className="w-4 h-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate font-medium text-foreground">
          {switching ? t('restaurantSwitcher.switching') : active.name}
        </span>
        <ChevronDown
          className={`w-4 h-4 shrink-0 text-muted-foreground transition-transform ${
            open ? 'rotate-180' : ''
          }`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label={t('restaurantSwitcher.chooseLabel')}
          className="absolute left-0 right-0 z-30 mt-1 overflow-hidden rounded-lg border
                     border-border bg-card shadow-modal"
        >
          {restaurants.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                role="option"
                aria-selected={r.id === active.id}
                onClick={() => choose(r.id)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm
                           hover:bg-muted transition-colors"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-foreground">{r.name}</span>
                  {r.role === 'STAFF' && (
                    <span className="block text-xs text-muted-foreground">{t('restaurantSwitcher.staff')}</span>
                  )}
                </span>
                {r.id === active.id && (
                  <Check className="w-4 h-4 shrink-0 text-primary-ink" aria-hidden="true" />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
