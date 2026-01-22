'use client';

import { useState, useEffect } from 'react';
import { Menu, X, DollarSign, LogOut, Building2, Moon, Sun } from 'lucide-react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/lib/language-context';
import LanguageSelector from './LanguageSelector';

export default function Navbar() {
  const router = useRouter();
  const { t } = useLanguage();
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');

  useEffect(() => {
    // Apply dark theme by default on mount
    const root = document.documentElement;
    root.classList.add('dark');
    root.style.colorScheme = 'dark';
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    // Apply theme on mount and when changed - always default to dark
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    root.style.colorScheme = theme;
    // Don't persist theme - always reset to dark on refresh
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  useEffect(() => {
    const checkAuth = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      setIsLoading(false);
    };

    checkAuth();

    // Listen for auth changes
    const supabase = createClient();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') {
        checkAuth();
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    setUser(null);
    router.push('/');
    router.refresh();
  };

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled
          ? 'bg-background/95 backdrop-blur-md border-b border-border/50 shadow-lg'
          : 'bg-transparent'
      }`}
    >
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16 md:h-20">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 group">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center group-hover:scale-110 transition-transform">
              <DollarSign className="w-6 h-6 text-primary-foreground" />
            </div>
            <span className="text-xl md:text-2xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              REST Finance
            </span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-8">
            <Link
              href="/about"
              className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors"
            >
              {t('navbar.about')}
            </Link>
            <Link
              href="/plans"
              className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors"
            >
              {t('navbar.plans')}
            </Link>
            <Link
              href="/contact"
              className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors"
            >
              {t('navbar.contact')}
            </Link>
          </div>

          {/* Desktop Theme Toggle, Language & Auth Buttons */}
          <div className="hidden md:flex items-center gap-4">
            {/* Language Selector */}
            <LanguageSelector />
            
            {/* Theme Toggle Button */}
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-card transition-colors"
              aria-label="Toggle theme"
              title={theme === 'light' ? 'Modo Escuro' : 'Modo Claro'}
            >
              {theme === 'light' ? (
                <Moon className="w-5 h-5" />
              ) : (
                <Sun className="w-5 h-5" />
              )}
            </button>
            {!isLoading && (
              <>
                {user ? (
                  <>
                    <Link
                      href="/dashboard"
                      className="flex items-center gap-2 px-6 py-2 text-sm font-semibold text-foreground hover:text-primary transition-colors"
                    >
                      <Building2 className="w-4 h-4" />
                      {t('navbar.dashboard')}
                    </Link>
                    <button
                      onClick={handleLogout}
                      className="flex items-center gap-2 px-6 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <LogOut className="w-4 h-4" />
                      {t('navbar.logout')}
                    </button>
                  </>
                ) : (
                  <>
                    <Link
                      href="/login"
                      className="px-6 py-2 text-sm font-semibold text-foreground hover:text-primary transition-colors"
                    >
                      {t('navbar.login')}
                    </Link>
                    <Link
                      href="/register"
                      className="px-6 py-2.5 bg-gradient-to-r from-primary to-accent text-primary-foreground rounded-lg font-semibold text-sm shadow-lg hover:shadow-xl hover:shadow-primary/50 hover:scale-105 transition-all duration-300"
                    >
                      {t('navbar.register')}
                    </Link>
                  </>
                )}
              </>
            )}
          </div>

          {/* Mobile Menu Button */}
          <button
            className="md:hidden p-2 text-foreground hover:text-primary transition-colors"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            aria-label="Toggle menu"
          >
            {isMobileMenuOpen ? (
              <X className="w-6 h-6" />
            ) : (
              <Menu className="w-6 h-6" />
            )}
          </button>
        </div>

        {/* Mobile Menu */}
        {isMobileMenuOpen && (
          <div className="md:hidden py-4 border-t border-border/50 animate-fade-in">
            <div className="flex flex-col gap-4">
              <Link
                href="/about"
                className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors py-2"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                {t('navbar.about')}
              </Link>
              <Link
                href="/plans"
                className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors py-2"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                {t('navbar.plans')}
              </Link>
              <Link
                href="/contact"
                className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors py-2"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                {t('navbar.contact')}
              </Link>
              {/* Mobile Language Selector */}
              <div className="py-2">
                <LanguageSelector />
              </div>
              {/* Mobile Theme Toggle */}
              <button
                onClick={() => {
                  toggleTheme();
                }}
                className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-primary transition-colors py-2"
              >
                {theme === 'light' ? (
                  <>
                    <Moon className="w-5 h-5" />
                    <span>Modo Escuro</span>
                  </>
                ) : (
                  <>
                    <Sun className="w-5 h-5" />
                    <span>Modo Claro</span>
                  </>
                )}
              </button>
              <div className="flex flex-col gap-3 pt-4 border-t border-border/50">
                {!isLoading && (
                  <>
                    {user ? (
                      <>
                        <Link
                          href="/dashboard"
                          className="flex items-center justify-center gap-2 px-6 py-2.5 text-center font-semibold text-foreground hover:text-primary transition-colors"
                          onClick={() => setIsMobileMenuOpen(false)}
                        >
                          <Building2 className="w-4 h-4" />
                          {t('navbar.dashboard')}
                        </Link>
                        <button
                          onClick={() => {
                            handleLogout();
                            setIsMobileMenuOpen(false);
                          }}
                          className="flex items-center justify-center gap-2 px-6 py-2.5 text-center font-semibold text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <LogOut className="w-4 h-4" />
                          {t('navbar.logout')}
                        </button>
                      </>
                    ) : (
                      <>
                        <Link
                          href="/login"
                          className="px-6 py-2.5 text-center font-semibold text-foreground hover:text-primary transition-colors"
                          onClick={() => setIsMobileMenuOpen(false)}
                        >
                          {t('navbar.login')}
                        </Link>
                        <Link
                          href="/register"
                          className="px-6 py-2.5 bg-gradient-to-r from-primary to-accent text-primary-foreground rounded-lg font-semibold text-center shadow-lg hover:shadow-xl transition-all duration-300"
                          onClick={() => setIsMobileMenuOpen(false)}
                        >
                          {t('navbar.register')}
                        </Link>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
