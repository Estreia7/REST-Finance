'use client';

import { useState, useEffect } from 'react';
import { Menu, X, DollarSign, LogOut, LayoutDashboard, Moon, Sun, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/lib/language-context';
import LanguageSelector from './LanguageSelector';
import type { AuthChangeEvent } from '@supabase/supabase-js';

function openAuthModal(tab: 'login' | 'register') {
  window.dispatchEvent(new CustomEvent('open-auth', { detail: tab }));
}

export default function Navbar() {
  const router = useRouter();
  const { t } = useLanguage();
  const [isScrolled, setIsScrolled]         = useState(false);
  const [isMobileMenuOpen, setMobileMenu]   = useState(false);
  const [user, setUser]                      = useState<any>(null);
  const [isLoading, setIsLoading]            = useState(true);
  const [theme, setTheme]                    = useState<'light' | 'dark'>('dark');

  // Always dark on first render
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add('dark');
    root.style.colorScheme = 'dark';
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    root.style.colorScheme = theme;
  }, [theme]);

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const supabase = createClient();
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      setIsLoading(false);
    };
    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event: AuthChangeEvent) => {
      if (event === 'SIGNED_IN')  checkAuth();
      if (event === 'SIGNED_OUT') { setUser(null); setIsLoading(false); }
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    setUser(null);
    router.push('/');
    router.refresh();
  };

  const navLinks = [
    { href: '/about',   label: t('navbar.about') },
    { href: '/plans',   label: t('navbar.plans') },
    { href: '/contact', label: t('navbar.contact') },
  ];

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled
          ? 'bg-background/80 backdrop-blur-2xl border-b border-white/5 shadow-card'
          : 'bg-transparent'
      }`}
    >
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16 md:h-18">

          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-9 h-9 rounded-xl gradient-bg flex items-center justify-center shadow-glow-sm group-hover:shadow-glow transition-all duration-300">
              <DollarSign className="w-5 h-5 text-white" />
            </div>
            <span className="text-lg font-black tracking-tight gradient-text">
              REST Finance
            </span>
          </Link>

          {/* Desktop nav links */}
          <div className="hidden md:flex items-center gap-6">
            {navLinks.map(link => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors duration-150"
              >
                {link.label}
              </Link>
            ))}
          </div>

          {/* Desktop right side */}
          <div className="hidden md:flex items-center gap-3">
            <LanguageSelector />

            <button
              onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')}
              className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all"
              aria-label="Toggle theme"
            >
              {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
            </button>

            {!isLoading && (
              <>
                {user ? (
                  <>
                    <Link
                      href="/dashboard"
                      className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <LayoutDashboard className="w-4 h-4" />
                      {t('navbar.dashboard')}
                    </Link>
                    <button
                      onClick={handleLogout}
                      className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <LogOut className="w-4 h-4" />
                      {t('navbar.logout')}
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => openAuthModal('login')}
                      className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {t('navbar.login')}
                    </button>
                    <button
                      onClick={() => openAuthModal('register')}
                      className="cta-button py-2 px-5 text-sm"
                    >
                      {t('navbar.register')}
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
              </>
            )}
          </div>

          {/* Mobile burger */}
          <button
            className="md:hidden p-2 text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setMobileMenu(v => !v)}
            aria-label="Toggle menu"
          >
            {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {/* Mobile menu */}
        {isMobileMenuOpen && (
          <div className="md:hidden pb-5 border-t border-white/5 animate-fade-in">
            <div className="flex flex-col gap-1 pt-3">
              {navLinks.map(link => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileMenu(false)}
                  className="px-3 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-white/5 rounded-lg transition-all"
                >
                  {link.label}
                </Link>
              ))}

              <div className="pt-3 border-t border-white/5 mt-2 flex items-center justify-between px-3">
                <LanguageSelector />
                <button
                  onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')}
                  className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all"
                >
                  {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
                </button>
              </div>

              {!isLoading && (
                <div className="flex flex-col gap-2 pt-3 border-t border-white/5 mt-1">
                  {user ? (
                    <>
                      <Link
                        href="/dashboard"
                        onClick={() => setMobileMenu(false)}
                        className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-foreground hover:bg-white/5 rounded-lg transition-all"
                      >
                        <LayoutDashboard className="w-4 h-4" />
                        {t('navbar.dashboard')}
                      </Link>
                      <button
                        onClick={() => { handleLogout(); setMobileMenu(false); }}
                        className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-white/5 rounded-lg transition-all"
                      >
                        <LogOut className="w-4 h-4" />
                        {t('navbar.logout')}
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => { openAuthModal('login'); setMobileMenu(false); }}
                        className="w-full px-4 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-white/5 rounded-lg transition-all text-left"
                      >
                        {t('navbar.login')}
                      </button>
                      <button
                        onClick={() => { openAuthModal('register'); setMobileMenu(false); }}
                        className="cta-button w-full justify-center"
                      >
                        {t('navbar.register')}
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
