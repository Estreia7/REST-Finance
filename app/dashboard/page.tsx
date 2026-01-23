'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  getRestaurant,
  getStaff,
  addStaff,
  createDailySummary,
  createCostEntry,
  getCategories,
  getDashboardStats,
  getCurrentUser,
} from './actions';
import { checkEmailConfirmation, resendConfirmationEmail } from '@/app/login/actions';
import { useLanguage } from '@/lib/language-context';
import LanguageSelector from '@/app/components/LanguageSelector';
import {
  LayoutDashboard,
  Users,
  DollarSign,
  Receipt,
  LogOut,
  Menu,
  X,
  Plus,
  Save,
  X as XIcon,
  Building2,
  TrendingUp,
  TrendingDown,
  AlertCircle,
} from 'lucide-react';
// Keep these in sync with the Prisma enums in schema.prisma
type CostType = 'COGS' | 'OPEX';
type CategoryType = 'REVENUE' | 'COGS' | 'OPEX';

type CostTypeOrEmpty = CostType | '';

type Tab = 'dashboard' | 'revenue' | 'costs' | 'users';

interface Category {
  id: string;
  name: string;
  type: CategoryType;
}

interface StaffMember {
  id: string;
  user: {
    id: string;
    email: string;
    name: string | null;
  };
}

export default function DashboardPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const [user, setUser] = useState<any>(null);
  const [currentUser, setCurrentUser] = useState<{ id: string; email: string; name: string | null } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [emailConfirmed, setEmailConfirmed] = useState<boolean | null>(null);
  const [isResendingEmail, setIsResendingEmail] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [restaurant, setRestaurant] = useState<any>(null);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [stats, setStats] = useState({
    revenue: 0,
    costs: 0,
    profit: 0,
    profitMargin: 0,
    staffCount: 0,
  });

  // Revenue form
  const [revenueForm, setRevenueForm] = useState({
    date: new Date().toISOString().split('T')[0],
    dineInRevenue: '',
    takeawayRevenue: '',
    dineInTickets: '',
    takeawayTickets: '',
    notes: '',
  });

  // Cost form
  const [costForm, setCostForm] = useState<{
    date: string;
    type: CostTypeOrEmpty;
    categoryId: string;
    amount: string;
    description: string;
  }>({
    date: new Date().toISOString().split('T')[0],
    type: '',
    categoryId: '',
    amount: '',
    description: '',
  });

  // Staff form
  const [staffEmail, setStaffEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const checkUser = async () => {
      const supabase = createClient();
      const { data: { user }, error } = await supabase.auth.getUser();

      if (error || !user) {
        router.push('/login');
        return;
      }

      setUser(user);
      
      // Load current user info
      const userInfo = await getCurrentUser();
      if (userInfo.success && userInfo.data) {
        setCurrentUser(userInfo.data);
      }
      
      // Check email confirmation status
      const emailCheck = await checkEmailConfirmation();
      setEmailConfirmed(emailCheck.isConfirmed);
      
      await loadData();
      setIsLoading(false);
    };

    checkUser();
  }, [router]);

  const handleResendConfirmation = async () => {
    setIsResendingEmail(true);
    const result = await resendConfirmationEmail();
    if (result.success) {
      alert(t('emailConfirmation.sent'));
    } else {
      alert(result.error || 'Erro ao reenviar email de confirmação');
    }
    setIsResendingEmail(false);
  };

  useEffect(() => {
    if (restaurant && activeTab === 'costs') {
      // Load all categories initially, then filter by type
      loadCategories();
    }
  }, [activeTab, restaurant]);

  const loadData = async () => {
    const [restaurantResult, staffResult, statsResult] = await Promise.all([
      getRestaurant(),
      getStaff(),
      getDashboardStats(),
    ]);

    if (restaurantResult.success && restaurantResult.data) {
      setRestaurant(restaurantResult.data);
    }

    if (staffResult.success && staffResult.data) {
      setStaff(staffResult.data);
    }

    if (statsResult.success && statsResult.data) {
      setStats(statsResult.data);
    }
  };

  const loadCategories = async () => {
    // Load all categories (will be filtered by type in the component)
    const result = await getCategories();
    if (result.success && result.data) {
      setCategories(result.data);
    }
  };

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  const handleSubmitRevenue = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    // Refresh session before making server action call
    try {
      const supabase = createClient();
      await supabase.auth.getSession();
    } catch (error) {
      console.error('Error refreshing session:', error);
    }

    const result = await createDailySummary({
      date: new Date(revenueForm.date),
      dineInRevenue: parseFloat(revenueForm.dineInRevenue) || 0,
      takeawayRevenue: parseFloat(revenueForm.takeawayRevenue) || 0,
      dineInTickets: parseInt(revenueForm.dineInTickets) || 0,
      takeawayTickets: parseInt(revenueForm.takeawayTickets) || 0,
      notes: revenueForm.notes || undefined,
    });

    if (result.success) {
      alert('Receita registada com sucesso!');
      setRevenueForm({
        date: new Date().toISOString().split('T')[0],
        dineInRevenue: '',
        takeawayRevenue: '',
        dineInTickets: '',
        takeawayTickets: '',
        notes: '',
      });
      await loadData();
    } else {
      const errorMessage = result.error || 'Erro ao registar receita';
      alert(errorMessage);
      
      // Redirect to login if session expired
      if ((result as any).requiresAuth) {
        router.push('/login');
      }
    }

    setIsSubmitting(false);
  };

  const handleSubmitCost = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!costForm.type) {
      alert(t('owner.notifications.selectCostType'));
      return;
    }

    if (!costForm.categoryId) {
      alert(t('owner.notifications.selectCategory'));
      return;
    }

    setIsSubmitting(true);

    const result = await createCostEntry({
      date: new Date(costForm.date),
      type: costForm.type as CostType,
      categoryId: costForm.categoryId || undefined,
      amount: parseFloat(costForm.amount) || 0,
      description: costForm.description || undefined,
    });

    if (result.success) {
      alert(t('owner.notifications.costRegistered'));
      setCostForm({
        date: new Date().toISOString().split('T')[0],
        type: '',
        categoryId: '',
        amount: '',
        description: '',
      });
      await loadData();
    } else {
      alert(result.error || t('owner.notifications.errorRegisteringCost'));
    }

    setIsSubmitting(false);
  };

  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    const result = await addStaff(staffEmail);
    if (result.success) {
      alert(t('owner.notifications.staffAdded'));
      setStaffEmail('');
      await loadData();
    } else {
      alert(result.error || t('owner.notifications.errorAddingStaff'));
    }

    setIsSubmitting(false);
  };

  const cogsCategories = categories.filter((c) => c.type === 'COGS');
  const opexCategories = categories.filter((c) => c.type === 'OPEX');
  const filteredCategories = costForm.type === 'COGS' ? cogsCategories : costForm.type === 'OPEX' ? opexCategories : [];

  if (isLoading) {
    return (
      <main className="flex-1 flex items-center justify-center min-h-screen">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-muted-foreground">{t('common.loading')}</p>
        </div>
      </main>
    );
  }

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      {/* Mobile Top Navbar */}
      <nav className="md:hidden fixed top-0 left-0 right-0 z-50 bg-card border-b border-border">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 text-muted-foreground hover:text-foreground"
            >
              <Menu className="w-6 h-6" />
            </button>
            <h2 className="text-lg font-bold truncate">{restaurant?.name || t('owner.title')}</h2>
          </div>
          {currentUser && (
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                <span className="text-primary font-semibold text-xs">
                  {currentUser.name ? currentUser.name.charAt(0).toUpperCase() : currentUser.email.charAt(0).toUpperCase()}
                </span>
              </div>
            </div>
          )}
        </div>
        {isSidebarOpen && (
          <div className="border-t border-border bg-card">
            <div className="px-4 py-2 space-y-1">
              <button
                onClick={() => {
                  setActiveTab('dashboard');
                  setIsSidebarOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg font-medium transition-colors ${
                  activeTab === 'dashboard'
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-card hover:text-foreground'
                }`}
              >
                <LayoutDashboard className="w-4 h-4" />
                <span className="text-sm">{t('owner.dashboard')}</span>
              </button>
              <button
                onClick={() => {
                  setActiveTab('revenue');
                  setIsSidebarOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg font-medium transition-colors ${
                  activeTab === 'revenue'
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-card hover:text-foreground'
                }`}
              >
                <DollarSign className="w-4 h-4" />
                <span className="text-sm">{t('owner.revenue')}</span>
              </button>
              <button
                onClick={() => {
                  setActiveTab('costs');
                  setIsSidebarOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg font-medium transition-colors ${
                  activeTab === 'costs'
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-card hover:text-foreground'
                }`}
              >
                <Receipt className="w-4 h-4" />
                <span className="text-sm">{t('owner.costs')}</span>
              </button>
              <button
                onClick={() => {
                  setActiveTab('users');
                  setIsSidebarOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg font-medium transition-colors ${
                  activeTab === 'users'
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-card hover:text-foreground'
                }`}
              >
                <Users className="w-4 h-4" />
                <span className="text-sm">{t('owner.users')}</span>
              </button>
              <div className="pt-2 border-t border-border mt-2">
                <div className="px-3 py-2">
                  <LanguageSelector />
                </div>
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-muted-foreground hover:bg-card hover:text-foreground transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="text-sm">{t('navbar.logout')}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </nav>

      {/* Desktop Sidebar */}
      <aside className="hidden md:flex fixed left-0 top-0 h-screen w-64 bg-card border-r border-border z-50">
        <div className="p-6 h-full flex flex-col w-full">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-xl font-bold">{restaurant?.name || t('owner.title')}</h2>
          </div>

          <nav className="flex-1 flex flex-col items-center justify-center space-y-3">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`w-full flex items-center justify-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${
                activeTab === 'dashboard'
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-card hover:text-foreground'
              }`}
            >
              <LayoutDashboard className="w-5 h-5" />
              <span>{t('owner.dashboard')}</span>
            </button>
            <button
              onClick={() => setActiveTab('revenue')}
              className={`w-full flex items-center justify-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${
                activeTab === 'revenue'
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-card hover:text-foreground'
              }`}
            >
              <DollarSign className="w-5 h-5" />
              <span>{t('owner.revenue')}</span>
            </button>
            <button
              onClick={() => setActiveTab('costs')}
              className={`w-full flex items-center justify-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${
                activeTab === 'costs'
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-card hover:text-foreground'
              }`}
            >
              <Receipt className="w-5 h-5" />
              <span>{t('owner.costs')}</span>
            </button>
            <button
              onClick={() => setActiveTab('users')}
              className={`w-full flex items-center justify-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${
                activeTab === 'users'
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-card hover:text-foreground'
              }`}
            >
              <Users className="w-5 h-5" />
              <span>{t('owner.users')}</span>
            </button>
          </nav>

          <div className="pt-8 border-t border-border mt-auto space-y-4">
            {/* Current User Info */}
            {currentUser && (
              <div className="px-4 py-3 rounded-lg bg-card/50 border border-border/50">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                    <span className="text-primary font-semibold text-sm">
                      {currentUser.name ? currentUser.name.charAt(0).toUpperCase() : currentUser.email.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">
                      {currentUser.name || 'Utilizador'}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {currentUser.email}
                    </p>
                  </div>
                </div>
              </div>
            )}
            
            <button
              onClick={handleLogout}
              className="flex items-center justify-center gap-3 px-4 py-3 rounded-lg text-muted-foreground hover:bg-card hover:text-foreground transition-colors w-full"
            >
              <LogOut className="w-5 h-5" />
              <span>Sair</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className={`flex-1 transition-all duration-300 md:ml-64 pt-16 md:pt-0`}>
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 md:py-8 max-w-full">
          {/* Email Confirmation Banner */}
          {emailConfirmed === false && (
            <div className="mb-6 p-4 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-semibold text-amber-600 dark:text-amber-400 mb-1">
                  {t('emailConfirmation.title')}
                </h3>
                <p className="text-sm text-amber-600/80 dark:text-amber-400/80 mb-3">
                  {t('emailConfirmation.message')}
                </p>
                <button
                  onClick={handleResendConfirmation}
                  disabled={isResendingEmail}
                  className="text-sm px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isResendingEmail ? t('emailConfirmation.resending') : t('emailConfirmation.resend')}
                </button>
              </div>
            </div>
          )}
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 sm:mb-8 gap-4">
            <div className="flex-1">
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold">
                {activeTab === 'dashboard' && t('owner.title')}
                {activeTab === 'revenue' && t('owner.registerRevenue')}
                {activeTab === 'costs' && t('owner.registerCost')}
                {activeTab === 'users' && t('owner.manageUsers')}
              </h1>
            </div>
          </div>

          {/* Dashboard Tab */}
          {activeTab === 'dashboard' && (
            <div className="space-y-6 sm:space-y-8">
              {/* Stats Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
                <div className="card p-4 sm:p-6 space-y-4">
                  <div className="w-12 h-12 rounded-lg bg-primary/20 flex items-center justify-center">
                    <DollarSign className="w-6 h-6 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold">{t('owner.stats.revenue')}</h3>
                  <p className="text-3xl font-bold">€{stats.revenue.toFixed(2)}</p>
                  <p className="text-sm text-muted-foreground">{t('owner.stats.thisMonth')}</p>
                </div>

                <div className="card p-4 sm:p-6 space-y-4">
                  <div className="w-12 h-12 rounded-lg bg-danger/20 flex items-center justify-center">
                    <Receipt className="w-6 h-6 text-danger" />
                  </div>
                  <h3 className="text-lg font-semibold">{t('owner.stats.costs')}</h3>
                  <p className="text-3xl font-bold">€{stats.costs.toFixed(2)}</p>
                  <p className="text-sm text-muted-foreground">{t('owner.stats.thisMonth')}</p>
                </div>

                <div className="card p-4 sm:p-6 space-y-4">
                  <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                    stats.profit >= 0 ? 'bg-success/20' : 'bg-danger/20'
                  }`}>
                    {stats.profit >= 0 ? (
                      <TrendingUp className="w-6 h-6 text-success" />
                    ) : (
                      <TrendingDown className="w-6 h-6 text-danger" />
                    )}
                  </div>
                  <h3 className="text-lg font-semibold">{t('owner.stats.profit')}</h3>
                  <p className="text-3xl font-bold">€{stats.profit.toFixed(2)}</p>
                  <p className="text-sm text-muted-foreground">{t('owner.stats.thisMonth')}</p>
                </div>

                <div className="card p-4 sm:p-6 space-y-4">
                  <div className="w-12 h-12 rounded-lg bg-primary/20 flex items-center justify-center">
                    <Users className="w-6 h-6 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold">{t('owner.stats.staff')}</h3>
                  <p className="text-3xl font-bold">{stats.staffCount}</p>
                  <p className="text-sm text-muted-foreground">{t('owner.stats.members')}</p>
                </div>
              </div>

              {/* Profit Margin */}
              <div className="card p-4 sm:p-6">
                <h2 className="text-xl sm:text-2xl font-bold mb-4">{t('owner.stats.profitMargin')}</h2>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">{t('owner.stats.margin')}</span>
                    <span className={`text-2xl font-bold ${
                      stats.profitMargin >= 0 ? 'text-success' : 'text-danger'
                    }`}>
                      {stats.profitMargin.toFixed(2)}%
                    </span>
                  </div>
                  <div className="w-full bg-card rounded-full h-4">
                    <div
                      className={`h-4 rounded-full transition-all ${
                        stats.profitMargin >= 0 ? 'bg-success' : 'bg-danger'
                      }`}
                      style={{ width: `${Math.min(Math.abs(stats.profitMargin), 100)}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Revenue Tab */}
          {activeTab === 'revenue' && (
            <div className="max-w-2xl">
              <div className="card p-4 sm:p-6">
                <h2 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6">{t('owner.registerRevenue')}</h2>
                <form onSubmit={handleSubmitRevenue} className="space-y-4 sm:space-y-6">
                  <div>
                    <label className="block text-sm font-semibold mb-2">{t('owner.revenueForm.date')}</label>
                    <input
                      type="date"
                      value={revenueForm.date}
                      onChange={(e) => setRevenueForm({ ...revenueForm, date: e.target.value })}
                      className="w-full px-3 sm:px-4 py-2 sm:py-3 bg-background border border-border rounded-lg"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                    <div>
                      <label className="block text-sm font-semibold mb-2">{t('owner.revenueForm.dineInRevenue')}</label>
                      <input
                        type="number"
                        step="0.01"
                        value={revenueForm.dineInRevenue}
                        onChange={(e) => setRevenueForm({ ...revenueForm, dineInRevenue: e.target.value })}
                        className="w-full px-3 sm:px-4 py-2 sm:py-3 bg-background border border-border rounded-lg"
                        placeholder="0.00"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold mb-2">{t('owner.revenueForm.takeawayRevenue')}</label>
                      <input
                        type="number"
                        step="0.01"
                        value={revenueForm.takeawayRevenue}
                        onChange={(e) => setRevenueForm({ ...revenueForm, takeawayRevenue: e.target.value })}
                        className="w-full px-3 sm:px-4 py-2 sm:py-3 bg-background border border-border rounded-lg"
                        placeholder="0.00"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                    <div>
                      <label className="block text-sm font-semibold mb-2">{t('owner.revenueForm.dineInTickets')}</label>
                      <input
                        type="number"
                        value={revenueForm.dineInTickets}
                        onChange={(e) => setRevenueForm({ ...revenueForm, dineInTickets: e.target.value })}
                        className="w-full px-3 sm:px-4 py-2 sm:py-3 bg-background border border-border rounded-lg"
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold mb-2">{t('owner.revenueForm.takeawayTickets')}</label>
                      <input
                        type="number"
                        value={revenueForm.takeawayTickets}
                        onChange={(e) => setRevenueForm({ ...revenueForm, takeawayTickets: e.target.value })}
                        className="w-full px-3 sm:px-4 py-2 sm:py-3 bg-background border border-border rounded-lg"
                        placeholder="0"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold mb-2">{t('owner.revenueForm.notes')}</label>
                    <textarea
                      value={revenueForm.notes}
                      onChange={(e) => setRevenueForm({ ...revenueForm, notes: e.target.value })}
                      className="w-full px-3 sm:px-4 py-2 sm:py-3 bg-background border border-border rounded-lg"
                      rows={3}
                      placeholder={t('owner.revenueForm.notesPlaceholder')}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full cta-button flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <>
                        <div className="w-5 h-5 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin"></div>
                        <span>{t('owner.revenueForm.registering')}</span>
                      </>
                    ) : (
                      <>
                        <Save className="w-5 h-5" />
                        <span>{t('owner.revenueForm.register')}</span>
                      </>
                    )}
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* Costs Tab */}
          {activeTab === 'costs' && (
            <div className="max-w-2xl">
              <div className="card p-4 sm:p-6">
                <h2 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6">{t('owner.registerCost')}</h2>
                <form onSubmit={handleSubmitCost} className="space-y-4 sm:space-y-6">
                  <div>
                    <label className="block text-sm font-semibold mb-2">{t('owner.costForm.date')}</label>
                    <input
                      type="date"
                      value={costForm.date}
                      onChange={(e) => setCostForm({ ...costForm, date: e.target.value })}
                      className="w-full px-3 sm:px-4 py-2 sm:py-3 bg-background border border-border rounded-lg"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold mb-2">{t('owner.costForm.costType')}</label>
                    <select
                      value={costForm.type}
                      onChange={(e) => {
                        const newType = e.target.value as CostType;
                        setCostForm({ ...costForm, type: newType, categoryId: '' });
                        // Categories are already loaded and will be filtered by type
                      }}
                      className="w-full px-3 sm:px-4 py-2 sm:py-3 bg-background border border-border rounded-lg"
                      required
                    >
                      <option value="">{t('owner.costForm.selectType')}</option>
                      <option value="COGS">{t('owner.costForm.cogs')}</option>
                      <option value="OPEX">{t('owner.costForm.opex')}</option>
                    </select>
                  </div>

                  {costForm.type && (
                    <div>
                      <label className="block text-sm font-semibold mb-2">{t('owner.costForm.category')}</label>
                      <select
                        value={costForm.categoryId}
                        onChange={(e) => setCostForm({ ...costForm, categoryId: e.target.value })}
                        className="w-full px-3 sm:px-4 py-2 sm:py-3 bg-background border border-border rounded-lg"
                        required
                      >
                        <option value="">{t('owner.costForm.selectCategory')}</option>
                        {filteredCategories.length > 0 ? (
                          filteredCategories.map((category) => (
                            <option key={category.id} value={category.id}>
                              {category.name}
                            </option>
                          ))
                        ) : (
                          <option value="" disabled>
                            {costForm.type ? `${t('owner.costForm.loadingCategories')} ${costForm.type === 'COGS' ? 'COGS' : 'OPEX'}...` : t('owner.costForm.selectType')}
                          </option>
                        )}
                      </select>
                      {filteredCategories.length === 0 && costForm.type && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {t('common.loading')}
                        </p>
                      )}
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-semibold mb-2">{t('owner.costForm.amount')}</label>
                    <input
                      type="number"
                      step="0.01"
                      value={costForm.amount}
                      onChange={(e) => setCostForm({ ...costForm, amount: e.target.value })}
                      className="w-full px-3 sm:px-4 py-2 sm:py-3 bg-background border border-border rounded-lg"
                      placeholder="0.00"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold mb-2">{t('owner.costForm.description')}</label>
                    <textarea
                      value={costForm.description}
                      onChange={(e) => setCostForm({ ...costForm, description: e.target.value })}
                      className="w-full px-3 sm:px-4 py-2 sm:py-3 bg-background border border-border rounded-lg"
                      rows={3}
                      placeholder={t('owner.costForm.descriptionPlaceholder')}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full cta-button flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <>
                        <div className="w-5 h-5 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin"></div>
                        <span>{t('owner.costForm.registering')}</span>
                      </>
                    ) : (
                      <>
                        <Save className="w-5 h-5" />
                        <span>{t('owner.costForm.register')}</span>
                      </>
                    )}
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* Users Tab */}
          {activeTab === 'users' && (
            <div className="space-y-6 sm:space-y-8">
              <div className="card p-4 sm:p-6">
                <h2 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6">Adicionar Staff</h2>
                <form onSubmit={handleAddStaff} className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold mb-2">Email do Utilizador</label>
                    <div className="flex gap-3">
                      <input
                        type="email"
                        value={staffEmail}
                        onChange={(e) => setStaffEmail(e.target.value)}
                        className="flex-1 px-3 sm:px-4 py-2 sm:py-3 bg-background border border-border rounded-lg"
                        placeholder="utilizador@email.com"
                        required
                      />
                      <button
                        type="submit"
                        disabled={isSubmitting}
                        className="px-4 sm:px-6 py-2 sm:py-3 bg-primary text-primary-foreground rounded-lg font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2"
                      >
                        {isSubmitting ? (
                          <>
                            <div className="w-5 h-5 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin"></div>
                            <span>A adicionar...</span>
                          </>
                        ) : (
                          <>
                            <Plus className="w-5 h-5" />
                            <span>Adicionar</span>
                          </>
                        )}
                      </button>
                    </div>
                    <p className="text-sm text-muted-foreground mt-2">
                      {t('owner.notifications.userMustBeRegistered')}
                    </p>
                  </div>
                </form>
              </div>

              <div className="card p-4 sm:p-6">
                <h2 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6">{t('owner.stats.staff')}</h2>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-3 px-4 font-semibold">{t('admin.table.name')}</th>
                        <th className="text-left py-3 px-4 font-semibold">{t('admin.table.email')}</th>
                        <th className="text-left py-3 px-4 font-semibold">{t('admin.table.role')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {staff.map((member) => (
                        <tr key={member.id} className="border-b border-border/50 hover:bg-card/50">
                          <td className="py-3 px-4 font-medium">
                            {member.user.name || 'N/A'}
                          </td>
                          <td className="py-3 px-4 text-muted-foreground">
                            {member.user.email}
                          </td>
                          <td className="py-3 px-4">
                            <span className="px-3 py-1 rounded-full text-sm font-medium bg-primary/20 text-primary">
                              Staff
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {staff.length === 0 && (
                    <div className="text-center py-12 text-muted-foreground">
                      Nenhum membro da equipa adicionado ainda
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
