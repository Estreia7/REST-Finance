'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { getClientStats, getClients, getMonthlyRevenue, getCurrentUser, bulkUpdateRestaurants } from './actions';
import { useLanguage } from '@/lib/language-context';
import { greetingName } from '@/lib/welcome-quotes';
import { consumeJustSignedIn } from '@/lib/welcome-signal';
import WelcomeSplash from '@/app/components/WelcomeSplash';
import DashboardLoading from '@/app/components/DashboardLoading';
import {
  LayoutDashboard, Users, LogOut, Menu, X,
  Building2, TrendingUp, TrendingDown, CreditCard,
  Search, ChevronRight, Activity, DollarSign,
  BarChart2, ArrowUpRight, ArrowDownRight, Shield,
  ClipboardList, Settings, Presentation,
} from 'lucide-react';
import UserManagementPanel from './components/UserManagementPanel';
import RestaurantDetailPanel from './components/RestaurantDetailPanel';
import AuthSettingsPanel from './components/AuthSettingsPanel';
import DemoAccountPanel from './components/DemoAccountPanel';
import ActivityLogPanel from './components/ActivityLogPanel';
import PresentationPanel from './components/PresentationPanel';
import AdminMobileBottomNav from './components/MobileBottomNav';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line,
} from 'recharts';
import { Plan } from '@prisma/client';
import Logo from '@/app/components/Logo';
import { formatMoney } from '@/lib/format';

// ─── Types ──────────────────────────────────────────────────────────────────
type Tab = 'dashboard' | 'clientes' | 'users' | 'activity' | 'apresentacao' | 'settings';

const MONTH_NAMES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

interface ClientRestaurant {
  id: string;
  name: string;
  plan: Plan;
  trialEndsAt: Date | null;
  createdAt: Date;
  subscriptionStatus?: string | null;
  memberships: Array<{
    user: { id: string; email: string; name: string | null };
    role: string;
  }>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function calcMRR(monthly: number, yearly: number) {
  return monthly * 29 + yearly * Math.round(290 / 12);
}

function PlanBadge({ plan }: { plan: Plan }) {
  const map: Record<Plan, { label: string; className: string }> = {
    TRIAL:   { label: 'Trial',   className: 'bg-warning/10 text-warning border-warning/20' },
    MONTHLY: { label: 'Mensal',  className: 'bg-info/10 text-info border-info/20' },
    YEARLY:  { label: 'Anual',   className: 'bg-success/10 text-success border-success/20' },
  };
  const { label, className } = map[plan];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${className}`}>
      {label}
    </span>
  );
}

// ─── Custom Tooltip ───────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card-elevated border border-border rounded-xl px-3 py-2 shadow-modal text-xs">
      <p className="text-muted-foreground mb-1">{label}</p>
      <p className="font-semibold text-foreground">{formatMoney(Number(payload[0].value))}</p>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────
export default function AdminPage() {
  const router = useRouter();
  const { t } = useLanguage();

  const [isLoading, setIsLoading]     = useState(true);
  const [activeTab, setActiveTab]     = useState<Tab>('dashboard');
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);

  // ── Welcome splash
  // Raised by the sign-in form and consumed once, so only an actual sign-in
  // is greeted — not every refresh of the console.
  const [showWelcome, setShowWelcome] = useState(false);
  useEffect(() => {
    if (consumeJustSignedIn()) setShowWelcome(true);
  }, []);

  const [stats, setStats] = useState({ trial: 0, monthly: 0, yearly: 0, total: 0 });
  const [chartData, setChartData]   = useState<Array<{ month: string; revenue: number }>>([]);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [clients, setClients]       = useState<ClientRestaurant[]>([]);
  const [search, setSearch]         = useState('');
  const [planFilter, setPlanFilter] = useState<Plan | 'all'>('all');
  const [selectedRestaurantId, setSelectedRestaurantId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState('');
  const [bulkSaving, setBulkSaving] = useState(false);

  // ── Load data ────────────────────────────────────────────────────────────
  const loadChartData = useCallback(async (year: number) => {
    const result = await getMonthlyRevenue(year);
    if (result.success && result.data) {
      const formatted = result.data
        .sort((a, b) => a.month - b.month)
        .map((d) => ({ month: MONTH_NAMES[d.month], revenue: d.revenue }));
      setChartData(formatted);
    }
  }, []);

  const loadData = useCallback(async () => {
    const [statsResult, clientsResult, userResult] = await Promise.all([
      getClientStats(),
      getClients(),
      getCurrentUser(),
    ]);
    if (statsResult.success && statsResult.data) setStats(statsResult.data);
    if (clientsResult.success && clientsResult.data) setClients(clientsResult.data as ClientRestaurant[]);
    if (userResult.success && userResult.data) setCurrentUser(userResult.data);
    await loadChartData(selectedYear);
  }, [selectedYear, loadChartData]);

  // ── Auth check ───────────────────────────────────────────────────────────
  useEffect(() => {
    // Middleware redirects unauthenticated visitors, and every admin action
    // re-checks the PLATFORM_ADMIN role server-side.
    const load = async () => {
      try {
        await loadData();
      } catch (err) {
        // Always end the loading state, so a failed fetch shows an empty
        // console rather than stranding the user on the welcome screen.
        console.error('admin load error:', err);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [loadData]);

  useEffect(() => {
    if (!isLoading) loadChartData(selectedYear);
  }, [selectedYear, isLoading, loadChartData]);

  const handleLogout = async () => {
    await signOut({ callbackUrl: '/' });
  };

  // ── Derived metrics ──────────────────────────────────────────────────────
  const mrr = calcMRR(stats.monthly, stats.yearly);
  const arr = mrr * 12;
  const conversionRate = stats.total > 0
    ? Math.round(((stats.monthly + stats.yearly) / stats.total) * 100)
    : 0;
  const paidCount = stats.monthly + stats.yearly;

  // ── Bulk actions ─────────────────────────────────────────────────────────
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const toggleAll = () => {
    if (selectedIds.size === filtered.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filtered.map(c => c.id)));
  };
  const handleBulkAction = async () => {
    if (!bulkAction || selectedIds.size === 0) return;
    setBulkSaving(true);
    const ids = Array.from(selectedIds);
    let data: any = {};
    if (bulkAction === 'TRIAL') data = { plan: 'TRIAL' };
    else if (bulkAction === 'MONTHLY') data = { plan: 'MONTHLY' };
    else if (bulkAction === 'YEARLY') data = { plan: 'YEARLY' };
    else if (bulkAction === 'EXTEND_TRIAL_30') {
      const d = new Date(); d.setDate(d.getDate() + 30);
      data = { trialEndsAt: d };
    }
    await bulkUpdateRestaurants(ids, data);
    await loadData();
    setSelectedIds(new Set());
    setBulkAction('');
    setBulkSaving(false);
  };

  // ── Filtered clients ─────────────────────────────────────────────────────
  const filtered = clients.filter((c) => {
    const owner = c.memberships.find((m) => m.role === 'OWNER')?.user;
    const q = search.toLowerCase();
    const matchSearch = !q ||
      c.name.toLowerCase().includes(q) ||
      owner?.email.toLowerCase().includes(q) ||
      owner?.name?.toLowerCase().includes(q);
    const matchPlan = planFilter === 'all' || c.plan === planFilter;
    return matchSearch && matchPlan;
  });

  // ── Sidebar nav ──────────────────────────────────────────────────────────
  const navItems = [
    { id: 'dashboard' as Tab, icon: LayoutDashboard,  label: 'Dashboard' },
    { id: 'clientes'  as Tab, icon: Building2,        label: 'Clientes' },
    { id: 'users'     as Tab, icon: Users,             label: 'Utilizadores' },
    { id: 'activity'  as Tab, icon: ClipboardList,     label: 'Atividade' },
    { id: 'apresentacao' as Tab, icon: Presentation,   label: 'Apresentação' },
    { id: 'settings'  as Tab, icon: Settings,          label: 'Definições' },
  ];

  // ── Welcome ──────────────────────────────────────────────────────────────
  // Covers the wait after a fresh sign-in, and only lifts once the console's
  // data is in, so it replaces the spinner below rather than preceding it.
  if (showWelcome) {
    return (
      <WelcomeSplash
        audience="admin"
        name={greetingName(currentUser?.name, currentUser?.email)}
        ready={!isLoading}
        onDone={() => setShowWelcome(false)}
      />
    );
  }

  // ── Loading ──────────────────────────────────────────────────────────────
  if (isLoading) {
    return <DashboardLoading audience="admin" />;
  }

  return (
    <div className="min-h-dvh bg-background">
      {/* ── Sidebar ────────────────────────────────────────────────────────── */}
      <>
        {/* Mobile overlay */}
        {isSidebarOpen && (
          <div
            className="md:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-30"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <aside className={`
          fixed top-0 left-0 h-full w-60 z-40 flex flex-col
          bg-card border-r border-border-subtle
          transition-transform duration-300
          ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          md:translate-x-0
        `}>
          {/* Logo */}
          <div className="h-14 flex items-center gap-2.5 px-4 border-b border-border-subtle shrink-0">
            <Logo size={32} className="shrink-0" priority />
            <div>
              <span className="font-bold text-sm text-foreground">REST Finance</span>
              <div className="flex items-center gap-1">
                <Shield className="w-2.5 h-2.5 text-primary" />
                <span className="text-[10px] text-primary font-medium">Admin</span>
              </div>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="md:hidden ml-auto p-1 rounded-lg text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Nav */}
          <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
            <p className="section-label px-2 pt-2 pb-1">Plataforma</p>
            {navItems.map(({ id, icon: Icon, label }) => (
              <button
                key={id}
                onClick={() => { setActiveTab(id); setSidebarOpen(false); }}
                className={`nav-item w-full ${activeTab === id ? 'active' : ''}`}
              >
                <Icon className="w-4 h-4" />
                <span>{label}</span>
                {activeTab === id && <ChevronRight className="w-3 h-3 ml-auto opacity-50" />}
              </button>
            ))}
          </nav>

          {/* User */}
          <div className="p-3 border-t border-border-subtle shrink-0">
            <div className="flex items-center gap-2.5 px-2 py-2 rounded-xl">
              <div className="w-8 h-8 rounded-full gradient-bg flex items-center justify-center shrink-0">
                <span className="text-white text-xs font-bold">
                  {currentUser?.name?.[0]?.toUpperCase() ?? currentUser?.email?.[0]?.toUpperCase() ?? 'A'}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground truncate">{currentUser?.name ?? 'Admin'}</p>
                <p className="text-[10px] text-muted-foreground truncate">{currentUser?.email}</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="nav-item w-full mt-1 text-muted-foreground hover:text-danger"
            >
              <LogOut className="w-4 h-4" />
              <span>Terminar sessão</span>
            </button>
          </div>
        </aside>
      </>

      {/* ── Main ───────────────────────────────────────────────────────────── */}
      <div className="md:ml-60 flex flex-col min-h-dvh">
        {/* Top bar */}
        <header className="sticky top-0 z-20 h-14 flex items-center gap-3 px-4 md:px-6 bg-background/80 backdrop-blur-xl border-b border-border-subtle">
          <button
            onClick={() => setSidebarOpen(true)}
            className="md:hidden p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-sm font-semibold text-foreground">
              {{ dashboard: 'Visão Geral', clientes: 'Clientes', users: 'Utilizadores', activity: 'Atividade', apresentacao: 'Apresentação', settings: 'Definições' }[activeTab]}
            </h1>
            <p className="text-xs text-muted-foreground hidden md:block">
              {{ dashboard: 'Métricas da plataforma', clientes: `${clients.length} restaurantes registados`, users: 'Gestão de utilizadores', activity: 'Registo de ações', apresentacao: 'Demonstração para clientes', settings: 'Configuração da plataforma' }[activeTab]}
            </p>
          </div>

          {activeTab === 'dashboard' && (
            <div className="ml-auto">
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                className="input-field py-1.5 text-xs w-24"
              >
                {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i).map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
          )}
        </header>

        <main className="flex-1 p-4 md:p-6 space-y-6">

          {/* ── Dashboard Tab ─────────────────────────────────────────────── */}
          {activeTab === 'dashboard' && (
            <>
              {/* KPI cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">

                {/* MRR */}
                <div className="card-glass p-5 rounded-2xl space-y-3 animate-fade-up-1">
                  <div className="flex items-start justify-between">
                    <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                      <DollarSign className="w-4 h-4 text-primary" />
                    </div>
                    <span className="flex items-center gap-1 text-xs text-success font-medium bg-success/10 px-2 py-0.5 rounded-full">
                      <ArrowUpRight className="w-3 h-3" />
                      MRR
                    </span>
                  </div>
                  <div>
                    <p className="text-2xl font-black tabular-nums text-foreground">€{mrr.toLocaleString('pt-PT')}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Receita mensal recorrente</p>
                  </div>
                  <div className="pt-1 border-t border-border-subtle">
                    <p className="text-xs text-muted-foreground">ARR estimado: <span className="text-foreground font-medium">€{arr.toLocaleString('pt-PT')}</span></p>
                  </div>
                </div>

                {/* Total */}
                <div className="card-glass p-5 rounded-2xl space-y-3 animate-fade-up-2">
                  <div className="flex items-start justify-between">
                    <div className="w-9 h-9 rounded-xl bg-success/10 flex items-center justify-center">
                      <Building2 className="w-4 h-4 text-success" />
                    </div>
                    <span className="text-xs text-muted-foreground font-medium bg-muted px-2 py-0.5 rounded-full">Total</span>
                  </div>
                  <div>
                    <p className="text-2xl font-black tabular-nums text-foreground">{stats.total}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Restaurantes registados</p>
                  </div>
                  <div className="pt-1 border-t border-border-subtle flex gap-3 text-xs">
                    <span className="text-warning">{stats.trial} trial</span>
                    <span className="text-muted-foreground">·</span>
                    <span className="text-success">{paidCount} pagantes</span>
                  </div>
                </div>

                {/* Conversion */}
                <div className="card-glass p-5 rounded-2xl space-y-3 animate-fade-up-3">
                  <div className="flex items-start justify-between">
                    <div className="w-9 h-9 rounded-xl bg-info/10 flex items-center justify-center">
                      <TrendingUp className="w-4 h-4 text-info" />
                    </div>
                    <span className="text-xs text-muted-foreground font-medium bg-muted px-2 py-0.5 rounded-full">Conversão</span>
                  </div>
                  <div>
                    <p className="text-2xl font-black tabular-nums text-foreground">{conversionRate}%</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Trial → pago</p>
                  </div>
                  <div className="w-full bg-muted rounded-full h-1.5">
                    <div
                      className="h-1.5 rounded-full bg-primary transition-all duration-700"
                      style={{ width: `${conversionRate}%` }}
                    />
                  </div>
                </div>

                {/* Paid breakdown */}
                <div className="card-glass p-5 rounded-2xl space-y-3 animate-fade-up-4">
                  <div className="flex items-start justify-between">
                    <div className="w-9 h-9 rounded-xl bg-warning/10 flex items-center justify-center">
                      <CreditCard className="w-4 h-4 text-warning" />
                    </div>
                    <span className="text-xs text-muted-foreground font-medium bg-muted px-2 py-0.5 rounded-full">Planos</span>
                  </div>
                  <div>
                    <p className="text-2xl font-black tabular-nums text-foreground">{paidCount}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Subscritores activos</p>
                  </div>
                  <div className="pt-1 border-t border-border-subtle flex gap-3 text-xs">
                    <span className="text-info">{stats.monthly} mensal</span>
                    <span className="text-muted-foreground">·</span>
                    <span className="text-success">{stats.yearly} anual</span>
                  </div>
                </div>

              </div>

              {/* Revenue chart */}
              <div className="card-glass rounded-2xl p-5 md:p-6">
                <div className="flex items-start justify-between mb-5">
                  <div>
                    <h2 className="text-base font-bold text-foreground">Receita da Plataforma</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">Receita estimada por mês · {selectedYear}</p>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted px-2 py-1 rounded-lg">
                    <Activity className="w-3 h-3" />
                    <span>MRR estimado</span>
                  </div>
                </div>

                {chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={240}>
                    <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="adminRevGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor="hsl(258 90% 66%)" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="hsl(258 90% 66%)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(222 30% 16%)" vertical={false} />
                      <XAxis dataKey="month" tick={{ fill: 'hsl(215 20% 55%)', fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: 'hsl(215 20% 55%)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `€${v}`} />
                      <Tooltip content={<ChartTooltip />} />
                      <Area
                        type="monotone"
                        dataKey="revenue"
                        stroke="hsl(258 90% 66%)"
                        strokeWidth={2}
                        fill="url(#adminRevGrad)"
                        dot={false}
                        activeDot={{ r: 4, fill: 'hsl(258 90% 66%)', strokeWidth: 0 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-60 flex items-center justify-center text-sm text-muted-foreground">
                    Sem dados para {selectedYear}
                  </div>
                )}
              </div>

              {/* Mini stats row */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="card-glass rounded-xl p-4 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-warning/10 flex items-center justify-center">
                    <BarChart2 className="w-4 h-4 text-warning" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Trials activos</p>
                    <p className="text-lg font-black text-foreground">{stats.trial}</p>
                  </div>
                </div>
                <div className="card-glass rounded-xl p-4 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-info/10 flex items-center justify-center">
                    <CreditCard className="w-4 h-4 text-info" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Plano mensal</p>
                    <p className="text-lg font-black text-foreground">{stats.monthly} <span className="text-xs text-muted-foreground font-normal">× €29</span></p>
                  </div>
                </div>
                <div className="card-glass rounded-xl p-4 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-success/10 flex items-center justify-center">
                    <TrendingUp className="w-4 h-4 text-success" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Plano anual</p>
                    <p className="text-lg font-black text-foreground">{stats.yearly} <span className="text-xs text-muted-foreground font-normal">× €290</span></p>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ── Clientes Tab ──────────────────────────────────────────────── */}
          {activeTab === 'clientes' && (
            selectedRestaurantId ? (
              <RestaurantDetailPanel
                restaurantId={selectedRestaurantId}
                onBack={() => { setSelectedRestaurantId(null); loadData(); }}
              />
            ) : (
              <div className="space-y-4">
                {/* Filters */}
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type="text"
                      placeholder="Pesquisar restaurante, email..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="input-field pl-9 w-full"
                    />
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    {(['all', 'TRIAL', 'MONTHLY', 'YEARLY'] as const).map((f) => {
                      const labels: Record<string, string> = { all: 'Todos', TRIAL: 'Trial', MONTHLY: 'Mensal', YEARLY: 'Anual' };
                      return (
                        <button
                          key={f}
                          onClick={() => setPlanFilter(f)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                            planFilter === f
                              ? 'bg-primary text-white shadow-glow-sm'
                              : 'bg-muted text-muted-foreground hover:bg-muted hover:text-foreground'
                          }`}
                        >
                          {labels[f]}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Bulk actions */}
                {selectedIds.size > 0 && (
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-primary/5 border border-primary/20">
                    <span className="text-xs font-medium text-foreground">{selectedIds.size} selecionado{selectedIds.size > 1 ? 's' : ''}</span>
                    <select value={bulkAction} onChange={e => setBulkAction(e.target.value)} className="input-field !py-1.5 !text-xs w-auto">
                      <option value="">Ação em massa...</option>
                      <option value="TRIAL">Mudar para Trial</option>
                      <option value="MONTHLY">Mudar para Mensal</option>
                      <option value="YEARLY">Mudar para Anual</option>
                      <option value="EXTEND_TRIAL_30">Estender trial +30 dias</option>
                    </select>
                    <button onClick={handleBulkAction} disabled={!bulkAction || bulkSaving} className="cta-button !py-1.5 !px-3 text-xs disabled:opacity-40">
                      {bulkSaving ? 'A aplicar...' : 'Aplicar'}
                    </button>
                    <button onClick={() => setSelectedIds(new Set())} className="text-xs text-muted-foreground hover:text-foreground">Limpar</button>
                  </div>
                )}

                {/* Table */}
                <div className="card-glass rounded-2xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border-subtle">
                          <th className="py-3 px-3 w-8">
                            <input type="checkbox" checked={selectedIds.size === filtered.length && filtered.length > 0} onChange={toggleAll} className="rounded border-border" />
                          </th>
                          <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground">Restaurante</th>
                          <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground">Proprietário</th>
                          <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground hidden md:table-cell">Email</th>
                          <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground">Plano</th>
                          <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground hidden lg:table-cell">Registado</th>
                          <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground hidden lg:table-cell">Trial até</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((r) => {
                          const owner = r.memberships.find((m) => m.role === 'OWNER')?.user;
                          return (
                            <tr key={r.id} className="border-b border-border-subtle hover:bg-muted transition-colors cursor-pointer group">
                              <td className="py-3 px-3" onClick={e => e.stopPropagation()}>
                                <input type="checkbox" checked={selectedIds.has(r.id)} onChange={() => toggleSelect(r.id)} className="rounded border-border" />
                              </td>
                              <td className="py-3 px-4" onClick={() => setSelectedRestaurantId(r.id)}>
                                <div className="flex items-center gap-2.5">
                                  <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center shrink-0">
                                    <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
                                  </div>
                                  <span className="font-medium text-foreground truncate max-w-[140px]">{r.name}</span>
                                  <ChevronRight className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                                </div>
                              </td>
                              <td className="py-3 px-4 text-muted-foreground" onClick={() => setSelectedRestaurantId(r.id)}>{owner?.name || '—'}</td>
                              <td className="py-3 px-4 text-muted-foreground hidden md:table-cell" onClick={() => setSelectedRestaurantId(r.id)}>{owner?.email || '—'}</td>
                              <td className="py-3 px-4" onClick={() => setSelectedRestaurantId(r.id)}><PlanBadge plan={r.plan} /></td>
                              <td className="py-3 px-4 text-muted-foreground hidden lg:table-cell text-xs" onClick={() => setSelectedRestaurantId(r.id)}>
                                {r.createdAt ? new Date(r.createdAt).toLocaleDateString('pt-PT') : '—'}
                              </td>
                              <td className="py-3 px-4 text-muted-foreground hidden lg:table-cell text-xs" onClick={() => setSelectedRestaurantId(r.id)}>
                                {r.trialEndsAt ? new Date(r.trialEndsAt).toLocaleDateString('pt-PT') : '—'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>

                    {filtered.length === 0 && (
                      <div className="py-16 text-center">
                        <Building2 className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
                        <p className="text-sm text-muted-foreground">
                          {search || planFilter !== 'all' ? 'Nenhum resultado encontrado.' : 'Sem clientes registados.'}
                        </p>
                      </div>
                    )}
                  </div>

                  {filtered.length > 0 && (
                    <div className="px-4 py-3 border-t border-border-subtle text-xs text-muted-foreground">
                      {filtered.length} {filtered.length === 1 ? 'resultado' : 'resultados'}
                      {(search || planFilter !== 'all') && ` de ${clients.length} total`}
                    </div>
                  )}
                </div>
              </div>
            )
          )}

          {/* ── Users Tab ──────────────────────────────────────────────────── */}
          {activeTab === 'users' && <UserManagementPanel />}

          {/* ── Activity Tab ───────────────────────────────────────────────── */}
          {activeTab === 'activity' && <ActivityLogPanel />}

          {/* ── Presentation Tab ───────────────────────────────────────────── */}
          {activeTab === 'apresentacao' && <PresentationPanel />}

          {activeTab === 'settings' && (
            <div className="space-y-6">
              <DemoAccountPanel />
              <AuthSettingsPanel />
            </div>
          )}

        </main>

        {/* Mobile bottom padding for nav */}
        <div className="h-20 md:hidden" />
      </div>

      {/* Mobile bottom nav */}
      <AdminMobileBottomNav activeTab={activeTab} onTabChange={(t) => { setActiveTab(t); setSidebarOpen(false); }} />
    </div>
  );
}
