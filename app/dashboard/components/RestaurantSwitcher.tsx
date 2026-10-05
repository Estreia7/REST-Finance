'use client';

import { useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { Check, ChevronDown, ImagePlus } from 'lucide-react';
import { getMyRestaurants, setActiveRestaurant } from '../restaurant-actions';
import { useLanguage } from '@/lib/language-context';
import RestaurantLogo from './RestaurantLogo';

type Restaurant = {
  id: string;
  name: string;
  logoPath: string | null;
  role: 'OWNER' | 'STAFF';
};

/**
 * Chooses which restaurant the dashboard is about.
 *
 * For the single-restaurant owner, which is almost everyone, it is not a
 * control at all: a dropdown with one entry does nothing but raise a question.
 * It shows whose dashboard this is instead — the restaurant's logo and name —
 * and, while there is no logo, a way to add one.
 *
 * Switching reloads rather than refetching panel by panel. Every figure on
 * screen belongs to the old restaurant the instant the cookie changes, and a
 * half-swapped dashboard showing one house's revenue against another's costs
 * would be worse than a moment's wait.
 */
export default function RestaurantSwitcher({
  current,
  onAddLogo,
}: {
  /**
   * The active restaurant as the dashboard last loaded it. Preferred over the
   * list fetched here, so a logo changed in Settings shows straight away.
   */
  current?: { name: string; logoPath: string | null } | null;
  /** Opens Settings. Given only to the owner, who is the one who can upload. */
  onAddLogo?: () => void;
} = {}) {
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

  const listed = restaurants.find((r) => r.id === activeId) ?? restaurants[0];
  const name = current?.name ?? listed?.name;
  const logoPath = current ? current.logoPath : listed?.logoPath ?? null;

  if (restaurants.length < 2) {
    if (!name) return null;
    return (
      <div className="flex items-center gap-3 rounded-xl border border-border-subtle bg-surface p-2.5">
        <RestaurantLogo logoPath={logoPath} name={name} size={40} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{name}</p>
          {!logoPath && onAddLogo ? (
            <button
              type="button"
              onClick={onAddLogo}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary-ink hover:underline"
            >
              <ImagePlus className="w-3 h-3" aria-hidden="true" />
              {t('restaurantSwitcher.addLogo')}
            </button>
          ) : (
            <p className="text-[11px] text-muted-foreground">{t('restaurantSwitcher.yourRestaurant')}</p>
          )}
        </div>
      </div>
    );
  }

  const active = listed;

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
        <RestaurantLogo logoPath={logoPath} name={name} size={28} />
        <span className="min-w-0 flex-1 truncate font-medium text-foreground">
          {switching ? t('restaurantSwitcher.switching') : name}
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
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm
                           hover:bg-muted transition-colors"
              >
                <RestaurantLogo logoPath={r.id === active.id ? logoPath : r.logoPath} name={r.name} size={24} />
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
