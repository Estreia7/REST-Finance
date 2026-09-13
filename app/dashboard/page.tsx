'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { signOut } from 'next-auth/react';
import { useTheme } from '@/lib/theme-context';
import {
  getRestaurant, getStaff, addStaff, createDailySummary, createCostEntry,
  getCategories, getDashboardStats, getCurrentUser, getLast7DaysRevenue,
  getMonthlyRevenueBreakdown, getCategoryPerformance, getAdvancedDashboardStats,
} from './actions';
import RevenueHistoryPanel from './components/RevenueHistoryPanel';
import CostHistoryPanel from './components/CostHistoryPanel';
import ReceiptScanner from './components/ReceiptScanner';
import PnLPanel from './components/PnLPanel';
import ComparativePanel from './components/ComparativePanel';
import TicketAnalysisPanel from './components/TicketAnalysisPanel';
import GoalsPanel from './components/GoalsPanel';
import MonthlyReportPanel from './components/MonthlyReportPanel';
import PriceTrackingPanel from './components/PriceTrackingPanel';
import { trialDaysLeft } from '@/lib/billing-utils';
import { useLanguage } from '@/lib/language-context';
import { greetingName } from '@/lib/welcome-quotes';
import { consumeJustSignedIn } from '@/lib/welcome-signal';
import WelcomeSplash from '@/app/components/WelcomeSplash';
import DashboardLoading from '@/app/components/DashboardLoading';
import { Plus, ChevronDown, ChevronUp, Rocket, TrendingUp as TrendingUpIcon, DollarSign as DollarSignIcon } from 'lucide-react';

// Components
import Sidebar          from './components/Sidebar';
import TopBar           from './components/TopBar';
import MobileBottomNav  from './components/MobileBottomNav';
import KPICards         from './components/KPICards';
import RevenueChart     from './components/RevenueChart';
import ChannelSplitChart from './components/ChannelSplitChart';
import CategoryTable    from './components/CategoryTable';
import QuickEntryPanel  from './components/QuickEntryPanel';
import StaffPanel       from './components/StaffPanel';
import BillingPanel     from './components/BillingPanel';
import CompliancePanel from './components/CompliancePanel';
import SchedulePanel from './components/SchedulePanel';
import MenuCalculatorPanel from './components/MenuCalculatorPanel';
import EstadoPanel from './components/EstadoPanel';
import SettingsPanel    from './components/SettingsPanel';
import TrialBanner      from '@/app/components/TrialBanner';

// ─── Types ─────────────────────────────────────────────────────────────────
type CostType = 'COGS' | 'OPEX';
type CostTypeOrEmpty = CostType | '';
type Tab = 'dashboard' | 'revenue' | 'costs' | 'analytics' | 'compliance' | 'schedule' | 'estado' | 'users' | 'billing' | 'settings';

interface Category {
  id: string;
  name: string;
  type: 'REVENUE' | 'COGS' | 'OPEX';
}

interface StaffMember {
  id: string;
  user: { id: string; email: string; name: string | null };
}

// ─── Page ──────────────────────────────────────────────────────────────────
function DashboardPageInner() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const { t }        = useLanguage();

  // ── Auth
  const [user, setUser]             = useState<any>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isLoading, setIsLoading]   = useState(true);

  // ── Welcome splash
  // Only for someone arriving straight from the sign-in form; a refresh of
  // the dashboard falls through to the plain loading state. Read in an effect
  // rather than a state initialiser so the server and the first client render
  // agree, and so the flag is not consumed twice under strict mode.
  const [showWelcome, setShowWelcome] = useState(false);
  useEffect(() => {
    if (consumeJustSignedIn()) setShowWelcome(true);
  }, []);

  // ── UI state
  const [activeTab, setActiveTab]       = useState<Tab>('dashboard');
  const [isSidebarOpen, setSidebarOpen] = useState(false);

  // ── Data
  const [restaurant, setRestaurant]       = useState<any>(null);
  const [staff, setStaff]                 = useState<StaffMember[]>([]);
  const [categories, setCategories]       = useState<Category[]>([]);
  const [stats, setStats]                 = useState({ revenue: 0, dineInRevenue: 0, takeawayRevenue: 0, costs: 0, profit: 0, profitMargin: 0, staffCount: 0 });
  const [advancedStats, setAdvancedStats] = useState({
    totalRevenue: 0, revenueChange: 0,
    primeCostPercent: 0, primeCostTrend: [] as number[],
    netIncome: 0, netIncomePercent: 0,
    cogsPercent: 0, cogsPercentChange: 0,
    labor: 0, cogs: 0, monthlyGoal: 0,
  });
  const [last7DaysData, setLast7DaysData]       = useState<Array<{ date: string; revenue: number }>>([]);
  const [monthlyBreakdown, setMonthlyBreakdown] = useState<Array<{ month: string; dineIn: number; takeaway: number; total: number }>>([]);
  const [categoryPerformance, setCategoryPerformance] = useState<Array<{ name: string; monthlySpending: number; contributionPercent: number; type: string }>>([]);

  // ── Theme
  const { resolvedTheme: theme, setTheme } = useTheme();
  const [pendingTheme, setPendingTheme]         = useState<'light' | 'dark'>('light');

  // The settings toggle previews a choice before it is saved, so it starts
  // from whatever theme is actually applied rather than a fixed default.
  useEffect(() => {
    setPendingTheme(theme);
  }, [theme]);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // ── Forms
  const [revenueForm, setRevenueForm] = useState({
    date: new Date().toISOString().split('T')[0],
    dineInRevenue: '', takeawayRevenue: '', dineInTickets: '', takeawayTickets: '', notes: '',
  });
  const [costForm, setCostForm] = useState<{
    date: string; type: CostTypeOrEmpty; categoryId: string; amount: string; description: string;
  }>({
    date: new Date().toISOString().split('T')[0], type: '', categoryId: '', amount: '', description: '',
  });
  const [staffEmail, setStaffEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ── Mobile dashboard
  const [showMoreCharts, setShowMoreCharts] = useState(false);

  // ── Sub-views for revenue/costs/analytics
  const [revenueSubView, setRevenueSubView] = useState<'entry' | 'history' | 'scan'>('entry');
  const [costSubView, setCostSubView] = useState<'entry' | 'history' | 'scan'>('entry');
  const [analyticsSubView, setAnalyticsSubView] = useState<'pnl' | 'compare' | 'tickets' | 'menu' | 'goals' | 'report' | 'prices'>('pnl');

  // ── Load all data ────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    try {
      const [
        restaurantData, staffData, statsData, userData,
        last7Data, breakdownData, categoryData, advancedData,
      ] = await Promise.all([
        getRestaurant(),
        getStaff(),
        getDashboardStats(),
        getCurrentUser(),
        getLast7DaysRevenue(),
        getMonthlyRevenueBreakdown(),
        getCategoryPerformance(),
        getAdvancedDashboardStats(),
      ]);

      if (restaurantData && 'data' in restaurantData) setRestaurant(restaurantData.data);
      if (staffData && 'data' in staffData)           setStaff(staffData.data as unknown as StaffMember[]);
      if (statsData && 'data' in statsData)           setStats(statsData.data as any);
      if (userData && 'data' in userData)             setCurrentUser(userData.data);
      if (last7Data && 'data' in last7Data)           setLast7DaysData(last7Data.data as any);
      if (breakdownData && 'data' in breakdownData)   setMonthlyBreakdown(breakdownData.data as any);
      if (categoryData && 'data' in categoryData)     setCategoryPerformance(categoryData.data as any);
      if (advancedData && 'data' in advancedData)     setAdvancedStats(advancedData.data as any);
    } catch (err) {
      console.error('loadData error:', err);
    }
  }, []);

  const loadCategories = useCallback(async () => {
    const result = await getCategories();
    if (result && 'data' in result) setCategories(result.data as unknown as Category[]);
  }, []);

  // ── Auth check ───────────────────────────────────────────────────────────
  useEffect(() => {
    const checkUser = async () => {
      // Middleware redirects unauthenticated visitors; every action
      // re-checks membership server-side.

      try {
        await Promise.all([loadData(), loadCategories()]);
      } catch (err) {
        // A failed load must still end the loading state: the panels below
        // render their own empty states, whereas leaving isLoading set would
        // strand the user on the welcome screen with no way forward.
        console.error('dashboard load error:', err);
      } finally {
        setIsLoading(false);
      }
    };

    checkUser();
  }, [router, loadData, loadCategories]);

  // ── Handle URL params (e.g. ?tab=billing from Stripe redirect) ───────────
  useEffect(() => {
    const tab = searchParams.get('tab') as Tab | null;
    if (tab && ['dashboard','revenue','costs','analytics','compliance','schedule','estado','users','billing','settings'].includes(tab)) {
      setActiveTab(tab);
    }
    const upgrade = searchParams.get('upgrade');
    if (upgrade === 'success') toast.success('Subscrição activada com sucesso!');
    if (upgrade === 'canceled') toast.info('Processo de upgrade cancelado.');
  }, [searchParams]);

  // Theme is applied by ThemeProvider; the dashboard only reads it.

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleLogout = async () => {
    await signOut({ callbackUrl: '/' });
    router.push('/');
  };

  const handleTabChange = (tab: Tab) => {
    if (hasUnsavedChanges && activeTab === 'settings') {
      if (!confirm('Tens alterações por guardar. Queres mesmo sair?')) return;
      setPendingTheme(theme);
      setHasUnsavedChanges(false);
    }
    setActiveTab(tab);
  };

  const handleSubmitRevenue = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    const result = await createDailySummary({
      date:           new Date(revenueForm.date),
      dineInRevenue:  parseFloat(revenueForm.dineInRevenue)  || 0,
      takeawayRevenue: parseFloat(revenueForm.takeawayRevenue) || 0,
      dineInTickets:  parseInt(revenueForm.dineInTickets)    || 0,
      takeawayTickets: parseInt(revenueForm.takeawayTickets)  || 0,
      notes: revenueForm.notes,
    });
    if (result.success) {
      toast.success(t('owner.notifications.revenueRegistered'));
      setRevenueForm({ date: new Date().toISOString().split('T')[0], dineInRevenue: '', takeawayRevenue: '', dineInTickets: '', takeawayTickets: '', notes: '' });
      await loadData();
    } else {
      toast.error(result.error || t('owner.notifications.errorRegisteringRevenue'));
    }
    setIsSubmitting(false);
  };

  const handleSubmitCost = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    const result = await createCostEntry({
      date:        new Date(costForm.date),
      type:        costForm.type as CostType,
      categoryId:  costForm.categoryId || undefined,
      amount:      parseFloat(costForm.amount) || 0,
      description: costForm.description,
    });
    if (result.success) {
      toast.success(t('owner.notifications.costRegistered'));
      setCostForm({ date: new Date().toISOString().split('T')[0], type: '', categoryId: '', amount: '', description: '' });
      await loadData();
    } else {
      toast.error(result.error || t('owner.notifications.errorRegisteringCost'));
    }
    setIsSubmitting(false);
  };

  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    const result = await addStaff(staffEmail);
    if (result.success) {
      toast.success(t('owner.notifications.staffAdded'));
      setStaffEmail('');
      await loadData();
    } else {
      toast.error(result.error || t('owner.notifications.errorAddingStaff'));
    }
    setIsSubmitting(false);
  };

  const handleThemeChange = (t: 'light' | 'dark') => {
    setPendingTheme(t);
    setHasUnsavedChanges(t !== theme);
  };

  const handleSaveTheme = () => {
    setTheme(pendingTheme);
    setHasUnsavedChanges(false);
    toast.success('Tema guardado.');
  };


  const daysLeft = trialDaysLeft(restaurant?.trialEndsAt ?? null);

  // ── Loading ───────────────────────────────────────────────────────────────
  // The welcome splash covers the wait for a fresh sign-in. It stays up until
  // both the data is in and its own minimum has elapsed, so it replaces the
  // spinner below rather than flashing before it.
  if (showWelcome) {
    return (
      <WelcomeSplash
        audience="owner"
        name={greetingName(currentUser?.name, currentUser?.email)}
        ready={!isLoading}
        onDone={() => setShowWelcome(false)}
      />
    );
  }

  // Not the welcome splash: that one greets someone who just signed in, and
  // replaying it on every refresh would wear thin. This is the same animated
  // mark without the greeting, so a slow load on mobile data does not look
  // like a stuck screen.
  if (isLoading) {
    return <DashboardLoading audience="owner" />;
  }

  // ── Layout ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-dvh bg-background">
      {/* Sidebar */}
      <Sidebar
        activeTab={activeTab}
        onTabChange={handleTabChange}
        restaurant={restaurant}
        currentUser={currentUser}
        plan={restaurant?.plan ?? 'TRIAL'}
        daysLeft={daysLeft}
        onLogout={handleLogout}
        isOpen={isSidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Main */}
      <div className="md:ml-60 flex flex-col min-h-dvh pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-0">
        {/* Top bar */}
        <TopBar
          activeTab={activeTab}
          restaurant={restaurant}
          onMenuClick={() => setSidebarOpen(true)}
        />

        {/* Trial banner */}
        {restaurant?.plan === 'TRIAL' && daysLeft <= 7 && (
          <TrialBanner daysLeft={daysLeft} onUpgrade={() => handleTabChange('billing')} />
        )}

        {/* Content */}
        <main className="flex-1 p-4 md:p-6 space-y-6">
          {activeTab === 'dashboard' && (
            <>
              {/* Onboarding card — shown when no data exists */}
              {stats.revenue === 0 && stats.costs === 0 && last7DaysData.length === 0 && (
                <div className="card-glass p-6 sm:p-8 border border-primary/20 bg-primary-subtle">
                  <div className="flex items-start gap-4">
                    <div className="w-11 h-11 rounded-xl gradient-bg flex items-center justify-center shadow-glow-sm shrink-0">
                      <Rocket className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h2 className="text-lg font-bold text-foreground">
                        Bem-vindo ao REST Finance{currentUser?.name ? `, ${currentUser.name.split(' ')[0]}` : ''}!
                      </h2>
                      <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                        Começa por registar a receita de hoje. Demora menos de 2 minutos e vais logo ver os teus KPIs a funcionar.
                      </p>
                      <div className="flex flex-col sm:flex-row gap-3 mt-4">
                        <button
                          onClick={() => handleTabChange('revenue')}
                          className="cta-button py-2.5 px-5 text-sm"
                        >
                          <TrendingUpIcon className="w-4 h-4" />
                          {t('nav.logTodayRevenue')}
                        </button>
                        <button
                          onClick={() => handleTabChange('costs')}
                          className="cta-button-secondary py-2.5 px-5 text-sm"
                        >
                          <DollarSignIcon className="w-4 h-4" />
                          {t('nav.logCosts')}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <KPICards stats={stats} advancedStats={advancedStats} last7DaysData={last7DaysData} />

              {/* Charts — collapsible on mobile */}
              <div className="hidden md:grid lg:grid-cols-3 gap-5">
                <div className="lg:col-span-2">
                  <RevenueChart data={monthlyBreakdown} />
                </div>
                <ChannelSplitChart stats={stats} />
              </div>
              <div className="hidden md:block">
                <CategoryTable data={categoryPerformance} />
              </div>

              {/* Mobile: toggle for charts */}
              <div className="md:hidden">
                <button
                  onClick={() => setShowMoreCharts(v => !v)}
                  className="w-full flex items-center justify-center gap-2 py-3 text-sm font-medium text-muted-foreground hover:text-foreground border border-border-subtle rounded-xl bg-surface transition-all"
                >
                  {showMoreCharts ? (
                    <><ChevronUp className="w-4 h-4" />{t('nav.hideDetails')}</>
                  ) : (
                    <><ChevronDown className="w-4 h-4" />{t('nav.showDetails')}</>
                  )}
                </button>
                {showMoreCharts && (
                  <div className="space-y-5 mt-5 animate-fade-in">
                    <RevenueChart data={monthlyBreakdown} />
                    <ChannelSplitChart stats={stats} />
                    <CategoryTable data={categoryPerformance} />
                  </div>
                )}
              </div>
            </>
          )}

          {activeTab === 'revenue' && (
            <>
              <div className="flex gap-1 p-1 bg-muted rounded-xl w-fit border border-border-subtle">
                <button onClick={() => setRevenueSubView('entry')} className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${revenueSubView === 'entry' ? 'gradient-bg text-white shadow-glow-sm' : 'text-muted-foreground hover:text-foreground'}`}>{t('nav.entry')}</button>
                <button onClick={() => setRevenueSubView('scan')} className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${revenueSubView === 'scan' ? 'gradient-bg text-white shadow-glow-sm' : 'text-muted-foreground hover:text-foreground'}`}>{t('nav.scan')}</button>
                <button onClick={() => setRevenueSubView('history')} className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${revenueSubView === 'history' ? 'gradient-bg text-white shadow-glow-sm' : 'text-muted-foreground hover:text-foreground'}`}>{t('nav.history')}</button>
              </div>
              {revenueSubView === 'entry' && (
                <QuickEntryPanel
                  activeTab="revenue"
                  revenueForm={revenueForm}
                  costForm={costForm}
                  categories={categories}
                  isSubmitting={isSubmitting}
                  onRevenueChange={setRevenueForm}
                  onCostChange={setCostForm}
                  onSubmitRevenue={handleSubmitRevenue}
                  onSubmitCost={handleSubmitCost}
                  onCategoryCreated={loadCategories}
                />
              )}
              {revenueSubView === 'scan' && (
                <div className="max-w-2xl">
                  <ReceiptScanner onSaved={loadData} />
                </div>
              )}
              {revenueSubView === 'history' && (
                <RevenueHistoryPanel onDataChange={loadData} />
              )}
            </>
          )}

          {activeTab === 'costs' && (
            <>
              <div className="flex gap-1 p-1 bg-muted rounded-xl w-fit border border-border-subtle">
                <button onClick={() => setCostSubView('entry')} className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${costSubView === 'entry' ? 'gradient-bg text-white shadow-glow-sm' : 'text-muted-foreground hover:text-foreground'}`}>{t('nav.entry')}</button>
                <button onClick={() => setCostSubView('scan')} className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${costSubView === 'scan' ? 'gradient-bg text-white shadow-glow-sm' : 'text-muted-foreground hover:text-foreground'}`}>{t('nav.scan')}</button>
                <button onClick={() => setCostSubView('history')} className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${costSubView === 'history' ? 'gradient-bg text-white shadow-glow-sm' : 'text-muted-foreground hover:text-foreground'}`}>{t('nav.history')}</button>
              </div>
              {costSubView === 'entry' && (
                <QuickEntryPanel
                  activeTab="costs"
                  revenueForm={revenueForm}
                  costForm={costForm}
                  categories={categories}
                  isSubmitting={isSubmitting}
                  onRevenueChange={setRevenueForm}
                  onCostChange={setCostForm}
                  onSubmitRevenue={handleSubmitRevenue}
                  onSubmitCost={handleSubmitCost}
                  onCategoryCreated={loadCategories}
                />
              )}
              {costSubView === 'scan' && (
                <div className="max-w-2xl">
                  <ReceiptScanner onSaved={loadData} />
                </div>
              )}
              {costSubView === 'history' && (
                <CostHistoryPanel onDataChange={loadData} />
              )}
            </>
          )}

          {activeTab === 'analytics' && (
            <>
              <div className="flex gap-1 p-1 bg-muted rounded-xl w-fit border border-border-subtle">
                <button onClick={() => setAnalyticsSubView('pnl')} className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${analyticsSubView === 'pnl' ? 'gradient-bg text-white shadow-glow-sm' : 'text-muted-foreground hover:text-foreground'}`}>P&L</button>
                <button onClick={() => setAnalyticsSubView('compare')} className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${analyticsSubView === 'compare' ? 'gradient-bg text-white shadow-glow-sm' : 'text-muted-foreground hover:text-foreground'}`}>{t('nav.comparison')}</button>
                <button onClick={() => setAnalyticsSubView('tickets')} className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${analyticsSubView === 'tickets' ? 'gradient-bg text-white shadow-glow-sm' : 'text-muted-foreground hover:text-foreground'}`}>{t('nav.tickets')}</button>
                <button onClick={() => setAnalyticsSubView('menu')} className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${analyticsSubView === 'menu' ? 'gradient-bg text-white shadow-glow-sm' : 'text-muted-foreground hover:text-foreground'}`}>{t('nav.menuCalc')}</button>
                <button onClick={() => setAnalyticsSubView('goals')} className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${analyticsSubView === 'goals' ? 'gradient-bg text-white shadow-glow-sm' : 'text-muted-foreground hover:text-foreground'}`}>{t('nav.goals')}</button>
                <button onClick={() => setAnalyticsSubView('report')} className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${analyticsSubView === 'report' ? 'gradient-bg text-white shadow-glow-sm' : 'text-muted-foreground hover:text-foreground'}`}>{t('nav.report')}</button>
                <button onClick={() => setAnalyticsSubView('prices')} className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${analyticsSubView === 'prices' ? 'gradient-bg text-white shadow-glow-sm' : 'text-muted-foreground hover:text-foreground'}`}>{t('nav.prices')}</button>
              </div>
              {analyticsSubView === 'pnl' && <PnLPanel />}
              {analyticsSubView === 'compare' && <ComparativePanel />}
              {analyticsSubView === 'tickets' && <TicketAnalysisPanel />}
              {analyticsSubView === 'menu' && <MenuCalculatorPanel />}
              {analyticsSubView === 'goals' && <GoalsPanel restaurant={restaurant} stats={stats} onUpdate={loadData} />}
              {analyticsSubView === 'report' && <MonthlyReportPanel />}
              {analyticsSubView === 'prices' && <PriceTrackingPanel />}
            </>
          )}

          {activeTab === 'users' && (
            <StaffPanel
              staff={staff}
              staffEmail={staffEmail}
              isSubmitting={isSubmitting}
              onEmailChange={setStaffEmail}
              onAddStaff={handleAddStaff}
              onDataChange={loadData}
            />
          )}

          {activeTab === 'billing' && (
            <BillingPanel restaurant={restaurant} />
          )}

          {activeTab === 'compliance' && <CompliancePanel />}

          {activeTab === 'schedule' && <SchedulePanel />}

          {activeTab === 'estado' && <EstadoPanel />}

          {activeTab === 'settings' && (
            <SettingsPanel
              pendingTheme={pendingTheme}
              hasUnsavedChanges={hasUnsavedChanges}
              onThemeChange={handleThemeChange}
              onSaveTheme={handleSaveTheme}
              onCancelTheme={() => { setPendingTheme(theme); setHasUnsavedChanges(false); }}
              currentUser={currentUser}
              restaurant={restaurant}
              onUpdate={loadData}
            />
          )}
        </main>
      </div>

      {/* Mobile FAB — quick entry shortcut */}
      {activeTab === 'dashboard' && (
        <button
          type="button"
          onClick={() => handleTabChange('revenue')}
          // Positioned off the safe area, not off the viewport edge: on a
          // phone with rounded corners `right-4` puts a 56px button partly
          // under the curve, which is what clipped it. The bottom offset
          // clears the nav bar plus the home indicator for the same reason.
          style={{
            right: 'calc(1rem + env(safe-area-inset-right))',
            bottom: 'calc(6rem + env(safe-area-inset-bottom))',
          }}
          className="fixed z-40 md:hidden w-14 h-14 rounded-2xl gradient-bg shadow-glow
                     flex items-center justify-center active:scale-95 transition-transform
                     focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Registar receita"
        >
          <Plus className="w-6 h-6 text-white" aria-hidden="true" />
        </button>
      )}

      {/* Mobile bottom nav */}
      <MobileBottomNav activeTab={activeTab} onTabChange={handleTabChange} />
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense>
      <DashboardPageInner />
    </Suspense>
  );
}
