'use client';

import { useState, useEffect, useRef } from 'react';
import { Wordmark } from './Logo';
import { Menu, X, LogOut, LayoutDashboard, Moon, Sun, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/lib/language-context';
import LanguageSelector from './LanguageSelector';
import { useTheme } from '@/lib/theme-context';

function openAuthModal(tab: 'login' | 'register') {
  window.dispatchEvent(new CustomEvent('open-auth', { detail: tab }));
}

export default function Navbar() {
  const router = useRouter();
  const { t } = useLanguage();
  const [isScrolled, setIsScrolled]         = useState(false);
  const [isMobileMenuOpen, setMobileMenu]   = useState(false);
  const [mobileAnimating, setMobileAnimating] = useState(false);
  const { resolvedTheme, toggleTheme } = useTheme();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // useSession tracks sign-in and sign-out on its own.
  const { data: session, status } = useSession();
  const user = session?.user ?? null;
  const isLoading = status === 'loading';

  // Smooth mobile menu open/close
  const openMobileMenu = () => {
    setMobileMenu(true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setMobileAnimating(true));
    });
  };

  const closeMobileMenu = () => {
    setMobileAnimating(false);
    setTimeout(() => setMobileMenu(false), 250);
  };

  // Close mobile menu on resize to desktop
  useEffect(() => {
    const handler = () => { if (window.innerWidth >= 768) closeMobileMenu(); };
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isMobileMenuOpen]);

  const handleLogout = async () => {
    // Clears the database session, not just a local token.
    await signOut({ callbackUrl: '/' });
  };

  const navLinks = [
    { href: '/#features', label: t('landing.nav.features') },
    { href: '/#metrics',  label: t('landing.nav.metrics') },
    { href: '/#faq',      label: t('landing.nav.faq') },
    { href: '/about',     label: t('navbar.about') },
  ];

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled
          ? 'bg-background/80 backdrop-blur-2xl border-b border-border-subtle shadow-card'
          : 'bg-transparent'
      }`}
    >
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-14 sm:h-16 md:h-18">

          {/* Logo */}
          <Link href="/" className="shrink-0" aria-label="REST Finance">
            <Wordmark markSize={34} priority />
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
              onClick={toggleTheme}
              className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
              aria-label={resolvedTheme === 'light' ? 'Mudar para tema escuro' : 'Mudar para tema claro'}
            >
              {resolvedTheme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
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
            className="md:hidden p-2 -mr-1 text-muted-foreground hover:text-foreground transition-colors relative z-50"
            onClick={() => isMobileMenuOpen ? closeMobileMenu() : openMobileMenu()}
            aria-label="Toggle menu"
          >
            <div className="relative w-5 h-5">
              <Menu className={`w-5 h-5 absolute inset-0 transition-all duration-300 ${isMobileMenuOpen ? 'opacity-0 rotate-90 scale-50' : 'opacity-100 rotate-0 scale-100'}`} />
              <X className={`w-5 h-5 absolute inset-0 transition-all duration-300 ${isMobileMenuOpen ? 'opacity-100 rotate-0 scale-100' : 'opacity-0 -rotate-90 scale-50'}`} />
            </div>
          </button>
        </div>
      </div>

      {/* Mobile menu - fullscreen overlay */}
      {isMobileMenuOpen && (
        <div
          className="md:hidden fixed inset-0 top-0 z-40 transition-all duration-300 ease-out"
          style={{ opacity: mobileAnimating ? 1 : 0 }}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-background/95 backdrop-blur-2xl" onClick={closeMobileMenu} />

          {/* Content */}
          <div
            ref={menuRef}
            className="relative flex flex-col h-full pt-14 sm:pt-16 transition-all duration-300 ease-out"
            style={{
              transform: mobileAnimating ? 'translateY(0)' : 'translateY(-10px)',
            }}
          >
            <div className="flex-1 overflow-y-auto p-6 space-y-2">
              {/* Nav links */}
              {navLinks.map((link, i) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={closeMobileMenu}
                  className="flex items-center justify-between px-4 py-3.5 text-base font-medium text-foreground hover:bg-muted rounded-xl transition-all"
                  style={{
                    opacity: mobileAnimating ? 1 : 0,
                    transform: mobileAnimating ? 'translateX(0)' : 'translateX(-12px)',
                    transition: `all 0.3s ${100 + i * 60}ms ease-out`,
                  }}
                >
                  {link.label}
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </Link>
              ))}

              {/* Divider */}
              <div className="border-t border-border-subtle my-4" />

              {/* Actions */}
              <div
                className="space-y-2"
                style={{
                  opacity: mobileAnimating ? 1 : 0,
                  transform: mobileAnimating ? 'translateX(0)' : 'translateX(-12px)',
                  transition: `all 0.3s 280ms ease-out`,
                }}
              >
                {!isLoading && (
                  <>
                    {user ? (
                      <>
                        <Link
                          href="/dashboard"
                          onClick={closeMobileMenu}
                          className="flex items-center gap-3 px-4 py-3.5 text-base font-medium text-foreground hover:bg-muted rounded-xl transition-all"
                        >
                          <LayoutDashboard className="w-5 h-5 text-primary" />
                          {t('navbar.dashboard')}
                        </Link>
                        <button
                          onClick={() => { handleLogout(); closeMobileMenu(); }}
                          className="flex items-center gap-3 w-full px-4 py-3.5 text-base font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-all"
                        >
                          <LogOut className="w-5 h-5" />
                          {t('navbar.logout')}
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => { openAuthModal('login'); closeMobileMenu(); }}
                          className="flex items-center justify-center w-full px-4 py-3.5 text-base font-medium text-foreground border border-border bg-muted rounded-xl hover:bg-muted transition-all"
                        >
                          {t('navbar.login')}
                        </button>
                        <button
                          onClick={() => { openAuthModal('register'); closeMobileMenu(); }}
                          className="cta-button w-full justify-center py-3.5 text-base"
                        >
                          {t('navbar.register')}
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </>
                )}
              </div>

              {/* Settings row */}
              <div
                className="flex items-center justify-between px-4 pt-4 border-t border-border-subtle mt-4"
                style={{
                  opacity: mobileAnimating ? 1 : 0,
                  transition: `opacity 0.3s 350ms ease-out`,
                }}
              >
                <LanguageSelector />
                <button
                  onClick={toggleTheme}
                  className="p-2.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
                  aria-label={resolvedTheme === 'light' ? 'Mudar para tema escuro' : 'Mudar para tema claro'}
                >
                  {resolvedTheme === 'light' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
