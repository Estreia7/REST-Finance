'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
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
import { checkEmailConfirmation, resendConfirmationEmail } from '@/app/login/actions';
import { trialDaysLeft } from '@/lib/billing-utils';
import { useLanguage } from '@/lib/language-context';

// Components
import Sidebar          from './components/Sidebar';
import TopBar           from './components/TopBar';
import MobileBottomNav  from './components/MobileBottomNav';
import EmailBanner      from './components/EmailBanner';
import KPICards         from './components/KPICards';
import RevenueChart     from './components/RevenueChart';
import ChannelSplitChart from './components/ChannelSplitChart';
import CategoryTable    from './components/CategoryTable';
import QuickEntryPanel  from './components/QuickEntryPanel';
import StaffPanel       from './components/StaffPanel';
import BillingPanel     from './components/BillingPanel';
import SettingsPanel    from './components/SettingsPanel';
import TrialBanner      from '@/app/components/TrialBanner';

// ─── Types ─────────────────────────────────────────────────────────────────
type CostType = 'COGS' | 'OPEX';
type CostTypeOrEmpty = CostType | '';
type Tab = 'dashboard' | 'revenue' | 'costs' | 'analytics' | 'users' | 'billing' | 'settings';

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

  // ── UI state
  const [activeTab, setActiveTab]       = useState<Tab>('dashboard');
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [emailConfirmed, setEmailConfirmed] = useState<boolean | null>(null);
  const [isResendingEmail, setIsResendingEmail] = useState(false);

  // ── Data
  const [restaurant, setRestaurant]       = useState<any>(null);
  const [staff, setStaff]                 = useState<StaffMember[]>([]);
  const [categories, setCategories]       = useState<Category[]>([]);
  const [stats, setStats]                 = useState({ revenue: 0, costs: 0, profit: 0, profitMargin: 0, staffCount: 0 });
  const [advancedStats, setAdvancedStats] = useState({
    totalRevenue: 0, revenueChange: 0,
    primeCostPercent: 0, primeCostTrend: [] as number[],
    netIncome: 0, netIncomePercent: 0,
    cogsPercent: 0, cogsPercentChange: 0,
    labor: 0, cogs: 0, monthlyGoal: 0,
  });
  const [last7DaysData, setLast7DaysData]       = useState<Array<{ date: string; revenue: number }>>([]);
  const [monthlyBreakdown, setMonthlyBreakdown] = useState<Array<{ month: string; food: number; drinks: number; other: number; total: number }>>([]);
  const [categoryPerformance, setCategoryPerformance] = useState<Array<{ name: string; monthlyRevenue: number; contributionPercent: number; trend: number[] }>>([]);

  // ── Theme
  const [theme, setTheme]                     = useState<'light' | 'dark'>('dark');
  const [pendingTheme, setPendingTheme]         = useState<'light' | 'dark'>('dark');
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

  // ── Sub-views for revenue/costs/analytics
  const [revenueSubView, setRevenueSubView] = useState<'entry' | 'history' | 'scan'>('entry');
  const [costSubView, setCostSubView] = useState<'entry' | 'history' | 'scan'>('entry');
  const [analyticsSubView, setAnalyticsSubView] = useState<'pnl' | 'compare' | 'tickets' | 'goals' | 'report'>('pnl');

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
    const supabase = createClient();

    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/'); return; }
      setUser(user);

      const emailStatus = await checkEmailConfirmation();
      setEmailConfirmed(emailStatus.isConfirmed);

      await Promise.all([loadData(), loadCategories()]);
      setIsLoading(false);
    };

    checkUser();
  }, [router, loadData, loadCategories]);

  // ── Handle URL params (e.g. ?tab=billing from Stripe redirect) ───────────
  useEffect(() => {
    const tab = searchParams.get('tab') as Tab | null;
    if (tab && ['dashboard','revenue','costs','analytics','users','billing','settings'].includes(tab)) {
      setActiveTab(tab);
    }
    const upgrade = searchParams.get('upgrade');
    if (upgrade === 'success') toast.success('Subscrição activada com sucesso!');
    if (upgrade === 'canceled') toast.info('Processo de upgrade cancelado.');
  }, [searchParams]);

  // ── Apply theme ──────────────────────────────────────────────────────────
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') root.classList.add('dark'); else root.classList.remove('dark');
    root.style.colorScheme = theme;
  }, [theme]);

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
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

  const handleResendEmail = async () => {
    setIsResendingEmail(true);
    const result = await resendConfirmationEmail();
    if (result.success) toast.success('Email de confirmação enviado!');
    else toast.error(result.error || 'Erro ao enviar email.');
    setIsResendingEmail(false);
  };

  const daysLeft = trialDaysLeft(restaurant?.trialEndsAt ?? null);

  // ── Loading ───────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-2xl gradient-bg flex items-center justify-center shadow-glow animate-pulse-slow">
            <span className="text-white font-black text-lg">R</span>
          </div>
          <div className="text-sm text-muted-foreground">A carregar...</div>
        </div>
      </div>
    );
  }

  // ── Layout ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background">
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
      <div className="md:ml-60 flex flex-col min-h-screen pb-20 md:pb-0">
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

        {/* Email confirmation banner */}
        {emailConfirmed === false && (
          <EmailBanner onResend={handleResendEmail} isResending={isResendingEmail} />
        )}

        {/* Content */}
        <main className="flex-1 p-4 md:p-6 space-y-6">
          {activeTab === 'dashboard' && (
            <>
              <KPICards stats={stats} advancedStats={advancedStats} last7DaysData={last7DaysData} />
              <div className="grid lg:grid-cols-3 gap-5">
                <div className="lg:col-span-2">
                  <RevenueChart data={monthlyBreakdown} />
                </div>
                <ChannelSplitChart stats={stats} advancedStats={advancedStats} />
              </div>
              <CategoryTable data={categoryPerformance} />
            </>
          )}

          {activeTab === 'revenue' && (
            <>
              <div className="flex gap-1 p-1 bg-white/[0.03] rounded-xl w-fit border border-white/5">
                <button onClick={() => setRevenueSubView('entry')} className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${revenueSubView === 'entry' ? 'gradient-bg text-white shadow-glow-sm' : 'text-muted-foreground hover:text-foreground'}`}>Registar</button>
                <button onClick={() => setRevenueSubView('scan')} className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${revenueSubView === 'scan' ? 'gradient-bg text-white shadow-glow-sm' : 'text-muted-foreground hover:text-foreground'}`}>Digitalizar</button>
                <button onClick={() => setRevenueSubView('history')} className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${revenueSubView === 'history' ? 'gradient-bg text-white shadow-glow-sm' : 'text-muted-foreground hover:text-foreground'}`}>Historial</button>
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
              <div className="flex gap-1 p-1 bg-white/[0.03] rounded-xl w-fit border border-white/5">
                <button onClick={() => setCostSubView('entry')} className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${costSubView === 'entry' ? 'gradient-bg text-white shadow-glow-sm' : 'text-muted-foreground hover:text-foreground'}`}>Registar</button>
                <button onClick={() => setCostSubView('scan')} className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${costSubView === 'scan' ? 'gradient-bg text-white shadow-glow-sm' : 'text-muted-foreground hover:text-foreground'}`}>Digitalizar</button>
                <button onClick={() => setCostSubView('history')} className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${costSubView === 'history' ? 'gradient-bg text-white shadow-glow-sm' : 'text-muted-foreground hover:text-foreground'}`}>Historial</button>
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
              <div className="flex gap-1 p-1 bg-white/[0.03] rounded-xl w-fit border border-white/5">
                <button onClick={() => setAnalyticsSubView('pnl')} className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${analyticsSubView === 'pnl' ? 'gradient-bg text-white shadow-glow-sm' : 'text-muted-foreground hover:text-foreground'}`}>P&L</button>
                <button onClick={() => setAnalyticsSubView('compare')} className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${analyticsSubView === 'compare' ? 'gradient-bg text-white shadow-glow-sm' : 'text-muted-foreground hover:text-foreground'}`}>Comparação</button>
                <button onClick={() => setAnalyticsSubView('tickets')} className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${analyticsSubView === 'tickets' ? 'gradient-bg text-white shadow-glow-sm' : 'text-muted-foreground hover:text-foreground'}`}>Tickets</button>
                <button onClick={() => setAnalyticsSubView('goals')} className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${analyticsSubView === 'goals' ? 'gradient-bg text-white shadow-glow-sm' : 'text-muted-foreground hover:text-foreground'}`}>Metas</button>
                <button onClick={() => setAnalyticsSubView('report')} className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${analyticsSubView === 'report' ? 'gradient-bg text-white shadow-glow-sm' : 'text-muted-foreground hover:text-foreground'}`}>Relatório</button>
              </div>
              {analyticsSubView === 'pnl' && <PnLPanel />}
              {analyticsSubView === 'compare' && <ComparativePanel />}
              {analyticsSubView === 'tickets' && <TicketAnalysisPanel />}
              {analyticsSubView === 'goals' && <GoalsPanel restaurant={restaurant} stats={stats} onUpdate={loadData} />}
              {analyticsSubView === 'report' && <MonthlyReportPanel />}
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
