'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { 
  getClients, 
  updateClient, 
  getClientStats, 
  getMonthlyRevenue,
  getAllUsers,
  updateUser,
  sendPasswordReset,
  createAccount,
  deleteAccount,
  changeUserPassword,
  getCurrentUser
} from './actions';
import { checkUserRole, checkEmailConfirmation, resendConfirmationEmail } from '@/app/login/actions';
import { useLanguage } from '@/lib/language-context';
import LanguageSelector from '@/app/components/LanguageSelector';
import { 
  LayoutDashboard, 
  Users, 
  Settings, 
  LogOut, 
  Menu, 
  X,
  Edit,
  Save,
  X as XIcon,
  Building2,
  Calendar,
  CreditCard,
  Mail,
  Send,
  Moon,
  Sun,
  Plus,
  Trash2,
  Key,
  UserPlus,
  CheckCircle2,
  AlertCircle,
  AlertTriangle
} from 'lucide-react';
import { Plan, MembershipRole } from '@prisma/client';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

type Tab = 'dashboard' | 'clientes' | 'configuracoes';
type ClientesSubTab = 'restaurantes' | 'utilizadores';

interface Client {
  id: string;
  name: string;
  plan: Plan;
  trialEndsAt: Date | null;
  createdAt: Date;
  memberships: Array<{
    user: {
      id: string;
      email: string;
      name: string | null;
    };
  }>;
}

interface User {
  id: string;
  email: string;
  name: string | null;
  createdAt: Date;
  memberships: Array<{
    id: string;
    role: 'OWNER' | 'STAFF' | 'PLATFORM_ADMIN';
    active: boolean;
    restaurant: {
      id: string;
      name: string;
      plan: Plan;
    };
  }>;
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const [user, setUser] = useState<any>(null);
  const [currentUser, setCurrentUser] = useState<{ id: string; email: string; name: string | null } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [emailConfirmed, setEmailConfirmed] = useState<boolean | null>(null);
  const [isResendingEmail, setIsResendingEmail] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [activeClientesSubTab, setActiveClientesSubTab] = useState<ClientesSubTab>('restaurantes');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [stats, setStats] = useState({ trial: 0, monthly: 0, yearly: 0, total: 0 });
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [revenueData, setRevenueData] = useState<Array<{ month: number; revenue: number }>>([]);
  const [selectedPlan, setSelectedPlan] = useState<Plan | 'ALL'>('ALL');
  const [editForm, setEditForm] = useState<{ name: string; plan: Plan; trialEndsAt: string } | null>(null);
  const [editUserForm, setEditUserForm] = useState<{ name: string; email: string; role: 'OWNER' | 'STAFF' | 'PLATFORM_ADMIN' | null; membershipId: string | null } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showCreateAccount, setShowCreateAccount] = useState(false);
  const [createAccountForm, setCreateAccountForm] = useState({
    name: '',
    email: '',
    password: '',
    restaurantName: '',
    plan: 'TRIAL' as Plan,
    trialEndsAt: '',
  });
  const [newPassword, setNewPassword] = useState('');
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState<{ type: 'user' | 'restaurant'; id: string; name: string } | null>(null);
  const [showEditClientModal, setShowEditClientModal] = useState<Client | null>(null);
  const [showEditUserModal, setShowEditUserModal] = useState<User | null>(null);
  const [showPasswordModal, setShowPasswordModal] = useState<{ userId: string; userName: string } | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [pendingTabChange, setPendingTabChange] = useState<Tab | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [themeChanged, setThemeChanged] = useState(false);
  const [notifications, setNotifications] = useState<Array<{ id: string; type: 'success' | 'error' | 'info'; message: string }>>([]);

  const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

  // Notification system
  const showNotification = (type: 'success' | 'error' | 'info', message: string) => {
    const id = Date.now().toString();
    setNotifications(prev => [...prev, { id, type, message }]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 5000);
  };

  // Check for unsaved changes before tab change
  const handleTabChange = (newTab: Tab) => {
    if (hasUnsavedChanges || themeChanged) {
      setPendingTabChange(newTab);
      return;
    }
    setActiveTab(newTab);
    // Reset to restaurantes sub-tab when switching to clientes
    if (newTab === 'clientes') {
      setActiveClientesSubTab('restaurantes');
    }
  };

  const confirmTabChange = () => {
    if (pendingTabChange) {
      setHasUnsavedChanges(false);
      setThemeChanged(false);
      setActiveTab(pendingTabChange);
      setPendingTabChange(null);
    }
  };

  const cancelTabChange = () => {
    setPendingTabChange(null);
  };

  useEffect(() => {
    // Apply dark theme by default on mount
    const root = document.documentElement;
    root.classList.add('dark');
    root.style.colorScheme = 'dark';
  }, []);

  useEffect(() => {
    // Apply theme when changed
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    root.style.colorScheme = theme;
    // Don't persist theme - always reset to dark on refresh
  }, [theme]);

  useEffect(() => {
    const checkUser = async () => {
      const supabase = createClient();
      const { data: { user }, error } = await supabase.auth.getUser();

      if (error || !user) {
        router.push('/login');
        return;
      }

      const roleCheck = await checkUserRole(user.id);
      if (!roleCheck.isAdmin) {
        router.push('/dashboard');
        return;
      }

      setUser(user);
      setIsAdmin(true);
      
      // Load current user info
      const userInfo = await getCurrentUser();
      if (userInfo.success && userInfo.data) {
        setCurrentUser(userInfo.data);
      }
      
      // Check email confirmation status
      const emailCheck = await checkEmailConfirmation();
      setEmailConfirmed(emailCheck.isConfirmed);
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      await loadData();
      setIsLoading(false);
    };

    checkUser();
  }, [router]);

  const handleResendConfirmation = async () => {
    setIsResendingEmail(true);
    const result = await resendConfirmationEmail();
    if (result.success) {
      showNotification('success', t('emailConfirmation.sent'));
    } else {
      showNotification('error', result.error || t('emailConfirmation.resending'));
    }
    setIsResendingEmail(false);
  };

  useEffect(() => {
    if (isAdmin && activeTab === 'dashboard') {
      loadRevenueData();
    }
  }, [selectedYear, isAdmin, activeTab]);

  useEffect(() => {
    if (isAdmin && activeTab === 'clientes') {
      loadUsersData();
      // Always reload clients when switching to clientes tab to ensure fresh data
      loadData();
    }
  }, [activeTab, isAdmin]);

  useEffect(() => {
    if (isAdmin && activeTab === 'clientes' && activeClientesSubTab === 'utilizadores') {
      loadUsersData();
    }
  }, [activeClientesSubTab, isAdmin, activeTab]);

  const loadData = async () => {
    if (!isAdmin) return;

    const [clientsResult, statsResult] = await Promise.all([
      getClients(),
      getClientStats(),
    ]);

    if (clientsResult.success && clientsResult.data) {
      setClients(clientsResult.data as Client[]);
    } else if (clientsResult.error) {
      showNotification('error', `${t('admin.notifications.errorLoadingRestaurants')}: ${clientsResult.error}`);
    }

    if (statsResult.success && statsResult.data) {
      setStats(statsResult.data);
    }

    if (activeTab === 'dashboard') {
      await loadRevenueData();
    }
  };

  const loadRevenueData = async () => {
    const result = await getMonthlyRevenue(selectedYear);
    if (result.success && result.data) {
      setRevenueData(result.data);
    }
  };

  const loadUsersData = async () => {
    const result = await getAllUsers();
    if (result.success && result.data) {
      setUsers(result.data as User[]);
    } else if (result.error) {
      showNotification('error', `${t('admin.notifications.errorLoadingUsers')}: ${result.error}`);
      console.error('Error loading users:', result.error);
    }
  };

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  const handleEditClient = (client: Client) => {
    setShowEditClientModal(client);
    setEditForm({
      name: client.name,
      plan: client.plan,
      trialEndsAt: client.trialEndsAt 
        ? new Date(client.trialEndsAt).toISOString().split('T')[0]
        : '',
    });
  };

  const handleSaveClient = async () => {
    if (!showEditClientModal || !editForm) return;

    setIsSaving(true);
    const result = await updateClient({
      restaurantId: showEditClientModal.id,
      name: editForm.name,
      plan: editForm.plan,
      trialEndsAt: editForm.trialEndsAt ? new Date(editForm.trialEndsAt) : null,
    });

    if (result.success) {
      showNotification('success', t('admin.notifications.restaurantUpdated'));
      await loadData();
      setShowEditClientModal(null);
      setEditForm(null);
      setHasUnsavedChanges(false);
    } else {
      showNotification('error', result.error || t('admin.notifications.errorLoadingRestaurants'));
    }
    setIsSaving(false);
  };

  const handleEditUser = (user: User) => {
    setShowEditUserModal(user);
    const mainMembership = user.memberships.find(m => m.active) || user.memberships[0];
    setEditUserForm({
      name: user.name || '',
      email: user.email,
      role: mainMembership?.role || null,
      membershipId: mainMembership?.id || null,
    });
  };

  const handleSaveUser = async () => {
    if (!showEditUserModal || !editUserForm) return;

    setIsSaving(true);
    const result = await updateUser({
      userId: showEditUserModal.id,
      name: editUserForm.name,
      email: editUserForm.email,
      role: editUserForm.role || undefined,
      membershipId: editUserForm.membershipId || undefined,
    });

    if (result.success) {
      showNotification('success', t('admin.notifications.userUpdated'));
      await loadUsersData();
      setShowEditUserModal(null);
      setEditUserForm(null);
      setHasUnsavedChanges(false);
    } else {
      showNotification('error', result.error || t('admin.notifications.errorLoadingUsers'));
    }
    setIsSaving(false);
  };

  const handleSendPasswordReset = async (email: string) => {
    const result = await sendPasswordReset(email);
    if (result.success) {
      showNotification('success', t('admin.notifications.passwordResetSent'));
    } else {
      showNotification('error', result.error || t('admin.notifications.passwordResetSent'));
    }
  };

  const handleCreateAccount = async () => {
    if (!createAccountForm.name || !createAccountForm.email || !createAccountForm.password || !createAccountForm.restaurantName) {
      showNotification('error', t('common.loading'));
      return;
    }

    if (createAccountForm.password.length < 6) {
      showNotification('error', t('admin.createAccount.minPassword'));
      return;
    }

    setIsSaving(true);
    const result = await createAccount({
      name: createAccountForm.name,
      email: createAccountForm.email,
      password: createAccountForm.password,
      restaurantName: createAccountForm.restaurantName,
      plan: createAccountForm.plan,
      trialEndsAt: createAccountForm.trialEndsAt ? new Date(createAccountForm.trialEndsAt) : null,
    });

    if (result.success) {
      showNotification('success', t('admin.notifications.accountCreated'));
      setShowCreateAccount(false);
      setCreateAccountForm({
        name: '',
        email: '',
        password: '',
        restaurantName: '',
        plan: 'TRIAL',
        trialEndsAt: '',
      });
      await loadData();
      await loadUsersData();
    } else {
      showNotification('error', result.error || t('admin.notifications.errorLoadingUsers'));
    }
    setIsSaving(false);
  };

  const handleChangePassword = async (userId: string) => {
    if (!newPassword || newPassword.length < 6) {
      showNotification('error', t('admin.createAccount.minPassword'));
      return;
    }

    setIsSaving(true);
    const result = await changeUserPassword(userId, newPassword);
    if (result.success) {
      showNotification('success', 'Palavra-passe alterada com sucesso!');
      setShowPasswordModal(null);
      setNewPassword('');
    } else {
      showNotification('error', result.error || 'Erro ao alterar palavra-passe');
    }
    setIsSaving(false);
  };

  const handleDeleteAccount = (userId: string, userName: string) => {
    setShowDeleteModal({ type: 'user', id: userId, name: userName });
    setDeleteConfirmText('');
  };

  const handleDeleteRestaurant = (restaurantId: string, restaurantName: string) => {
    setShowDeleteModal({ type: 'restaurant', id: restaurantId, name: restaurantName });
    setDeleteConfirmText('');
  };

  const confirmDelete = async () => {
    if (deleteConfirmText.toLowerCase() !== 'eliminar') {
      showNotification('error', t('admin.modals.deleteInstruction'));
      return;
    }

    if (!showDeleteModal) return;

    setIsSaving(true);
    let result;
    
    if (showDeleteModal.type === 'user') {
      result = await deleteAccount(showDeleteModal.id);
    } else {
      // Delete restaurant - need to find owner first
      const client = clients.find(c => c.id === showDeleteModal.id);
      if (client?.memberships[0]?.user?.id) {
        result = await deleteAccount(client.memberships[0].user.id);
      } else {
        result = { error: 'Restaurante não encontrado' };
      }
    }

    if (result.success) {
      showNotification('success', showDeleteModal.type === 'user' ? t('admin.notifications.accountDeleted') : t('admin.notifications.restaurantDeleted'));
      await loadData();
      await loadUsersData();
      setShowDeleteModal(null);
      setDeleteConfirmText('');
    } else {
      showNotification('error', result.error || t('common.delete'));
    }
    setIsSaving(false);
  };

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    setThemeChanged(true);
    document.documentElement.classList.toggle('dark', newTheme === 'dark');
  };

  const saveTheme = () => {
    // Theme is not persisted - always resets to dark on refresh
    setThemeChanged(false);
    showNotification('success', t('admin.settings.themeApplied'));
  };

  const filteredClients = selectedPlan === 'ALL' 
    ? clients 
    : clients.filter(c => c.plan === selectedPlan);

  const chartData = revenueData.map(item => ({
    month: monthNames[item.month],
    revenue: item.revenue,
  }));

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
    <div className="flex min-h-screen overflow-x-hidden max-w-full flex-col md:flex-row">
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
            <h2 className="text-lg font-bold">{t('admin.title')}</h2>
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
                  handleTabChange('dashboard');
                  setIsSidebarOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg font-medium transition-colors ${
                  activeTab === 'dashboard'
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-card hover:text-foreground'
                }`}
              >
                <LayoutDashboard className="w-4 h-4" />
                <span className="text-sm">Dashboard</span>
              </button>
              <button
                onClick={() => {
                  handleTabChange('clientes');
                  setIsSidebarOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg font-medium transition-colors ${
                  activeTab === 'clientes'
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-card hover:text-foreground'
                }`}
              >
                <Users className="w-4 h-4" />
                <span className="text-sm">Clientes</span>
              </button>
              <button
                onClick={() => {
                  handleTabChange('configuracoes');
                  setIsSidebarOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg font-medium transition-colors ${
                  activeTab === 'configuracoes'
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-card hover:text-foreground'
                }`}
              >
                <Settings className="w-4 h-4" />
                <span className="text-sm">Configurações</span>
              </button>
              <div className="pt-2 border-t border-border mt-2">
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-muted-foreground hover:bg-card hover:text-foreground transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="text-sm">Sair</span>
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
            <h2 className="text-xl font-bold">{t('admin.title')}</h2>
          </div>

          <nav className="flex-1 flex flex-col items-center justify-center space-y-3">
            <button
              onClick={() => handleTabChange('dashboard')}
              className={`w-full flex items-center justify-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${
                activeTab === 'dashboard'
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-card hover:text-foreground'
              }`}
            >
              <LayoutDashboard className="w-5 h-5" />
              <span>{t('admin.dashboard')}</span>
            </button>
            <button
              onClick={() => handleTabChange('clientes')}
              className={`w-full flex items-center justify-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${
                activeTab === 'clientes'
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-card hover:text-foreground'
              }`}
            >
              <Users className="w-5 h-5" />
              <span>{t('admin.clients')}</span>
            </button>
            <button
              onClick={() => handleTabChange('configuracoes')}
              className={`w-full flex items-center justify-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${
                activeTab === 'configuracoes'
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-card hover:text-foreground'
              }`}
            >
              <Settings className="w-5 h-5" />
              <span>{t('admin.settings')}</span>
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
                      {currentUser.name || t('common.loading')}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {currentUser.email}
                    </p>
                  </div>
                </div>
              </div>
            )}
            
            {/* Language Selector */}
            <div className="px-4">
              <LanguageSelector />
            </div>
            
            <button
              onClick={handleLogout}
              className="flex items-center justify-center gap-3 px-4 py-3 rounded-lg text-muted-foreground hover:bg-card hover:text-foreground transition-colors w-full"
            >
              <LogOut className="w-5 h-5" />
              <span>{t('navbar.logout')}</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className={`flex-1 transition-all duration-300 md:ml-64 min-w-0 overflow-x-hidden max-w-full pt-16 md:pt-0`}>
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
                {activeTab === 'dashboard' && t('admin.title')}
                {activeTab === 'clientes' && t('admin.clients')}
                {activeTab === 'configuracoes' && t('admin.settings')}
              </h1>
              {activeTab === 'clientes' && (
                <div className="flex flex-wrap gap-2 sm:gap-3 mt-4">
                  <button
                    onClick={() => setActiveClientesSubTab('restaurantes')}
                    className={`px-3 sm:px-4 py-2 rounded-lg text-sm sm:text-base font-medium transition-colors ${
                      activeClientesSubTab === 'restaurantes'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-card text-muted-foreground hover:bg-card/80'
                    }`}
                  >
                    {t('admin.restaurants')}
                  </button>
                  <button
                    onClick={() => setActiveClientesSubTab('utilizadores')}
                    className={`px-3 sm:px-4 py-2 rounded-lg text-sm sm:text-base font-medium transition-colors ${
                      activeClientesSubTab === 'utilizadores'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-card text-muted-foreground hover:bg-card/80'
                    }`}
                  >
                    {t('admin.users')}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Dashboard Tab */}
          {activeTab === 'dashboard' && (
            <div className="space-y-6 sm:space-y-8">
              {/* Stats Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
                <div className="card p-6 space-y-4">
                  <div className="w-12 h-12 rounded-lg bg-primary/20 flex items-center justify-center">
                    <Building2 className="w-6 h-6 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold">{t('admin.stats.total')}</h3>
                  <p className="text-3xl font-bold">{stats.total}</p>
                  <p className="text-sm text-muted-foreground">{t('admin.stats.restaurants')}</p>
                </div>

                <div className="card p-6 space-y-4">
                  <div className="w-12 h-12 rounded-lg bg-yellow-500/20 flex items-center justify-center">
                    <Calendar className="w-6 h-6 text-yellow-500" />
                  </div>
                  <h3 className="text-lg font-semibold">{t('admin.stats.trial')}</h3>
                  <p className="text-3xl font-bold">{stats.trial}</p>
                  <p className="text-sm text-muted-foreground">{t('admin.stats.inTrial')}</p>
                </div>

                <div className="card p-6 space-y-4">
                  <div className="w-12 h-12 rounded-lg bg-blue-500/20 flex items-center justify-center">
                    <CreditCard className="w-6 h-6 text-blue-500" />
                  </div>
                  <h3 className="text-lg font-semibold">{t('admin.stats.monthly')}</h3>
                  <p className="text-3xl font-bold">{stats.monthly}</p>
                  <p className="text-sm text-muted-foreground">{t('admin.stats.monthlyPlan')}</p>
                </div>

                <div className="card p-6 space-y-4">
                  <div className="w-12 h-12 rounded-lg bg-green-500/20 flex items-center justify-center">
                    <CreditCard className="w-6 h-6 text-green-500" />
                  </div>
                  <h3 className="text-lg font-semibold">{t('admin.stats.yearly')}</h3>
                  <p className="text-3xl font-bold">{stats.yearly}</p>
                  <p className="text-sm text-muted-foreground">{t('admin.stats.yearlyPlan')}</p>
                </div>
              </div>

              {/* Revenue Chart */}
              <div className="card p-4 sm:p-6">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 sm:mb-6 gap-3">
                  <h2 className="text-xl sm:text-2xl font-bold">{t('admin.revenue.monthly')}</h2>
                  <select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                    className="px-3 sm:px-4 py-2 bg-background border border-border rounded-lg text-sm sm:text-base w-full sm:w-auto"
                  >
                    {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i).map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="w-full overflow-x-auto">
                  <ResponsiveContainer width="100%" height={300} minHeight={300}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip formatter={(value: number) => `€${value.toFixed(2)}`} />
                    <Legend />
                    <Bar dataKey="revenue" fill="hsl(var(--primary))" />
                  </BarChart>
                </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}

          {/* Clientes Tab */}
          {activeTab === 'clientes' && (
            <div className="space-y-6 sm:space-y-8">
              {/* Restaurantes Sub-tab */}
              {activeClientesSubTab === 'restaurantes' && (
                <>
                  {/* Create Account Section */}
                  <div className="card p-4 sm:p-6">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 sm:mb-6 gap-3">
                  <h2 className="text-xl sm:text-2xl font-bold">{t('admin.createAccount.title')}</h2>
                  <button
                    onClick={() => setShowCreateAccount(!showCreateAccount)}
                    className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors text-sm sm:text-base w-full sm:w-auto justify-center"
                  >
                    <UserPlus className="w-4 h-4" />
                    {showCreateAccount ? t('common.cancel') : t('admin.createAccount.newAccount')}
                  </button>
                </div>

                {showCreateAccount && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 p-4 bg-card rounded-lg border border-border">
                    <div>
                      <label className="block text-sm font-medium mb-2">{t('admin.createAccount.ownerName')}</label>
                      <input
                        type="text"
                        value={createAccountForm.name}
                        onChange={(e) => setCreateAccountForm({ ...createAccountForm, name: e.target.value })}
                        className="w-full px-3 py-2 bg-background border border-border rounded-lg"
                        placeholder="João Silva"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">{t('admin.createAccount.email')}</label>
                      <input
                        type="email"
                        value={createAccountForm.email}
                        onChange={(e) => setCreateAccountForm({ ...createAccountForm, email: e.target.value })}
                        className="w-full px-3 py-2 bg-background border border-border rounded-lg"
                        placeholder="joao@exemplo.com"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">{t('admin.createAccount.password')}</label>
                      <input
                        type="password"
                        value={createAccountForm.password}
                        onChange={(e) => setCreateAccountForm({ ...createAccountForm, password: e.target.value })}
                        className="w-full px-3 py-2 bg-background border border-border rounded-lg"
                        placeholder={t('admin.createAccount.minPassword')}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">{t('admin.createAccount.restaurantName')}</label>
                      <input
                        type="text"
                        value={createAccountForm.restaurantName}
                        onChange={(e) => setCreateAccountForm({ ...createAccountForm, restaurantName: e.target.value })}
                        className="w-full px-3 py-2 bg-background border border-border rounded-lg"
                        placeholder="Restaurante Exemplo"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">{t('admin.createAccount.plan')}</label>
                      <select
                        value={createAccountForm.plan}
                        onChange={(e) => setCreateAccountForm({ ...createAccountForm, plan: e.target.value as Plan })}
                        className="w-full px-3 py-2 bg-background border border-border rounded-lg"
                      >
                        <option value="TRIAL">{t('admin.stats.trial')}</option>
                        <option value="MONTHLY">{t('admin.stats.monthly')}</option>
                        <option value="YEARLY">{t('admin.stats.yearly')}</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">{t('admin.createAccount.trialUntil')}</label>
                      <input
                        type="date"
                        value={createAccountForm.trialEndsAt}
                        onChange={(e) => setCreateAccountForm({ ...createAccountForm, trialEndsAt: e.target.value })}
                        className="w-full px-3 py-2 bg-background border border-border rounded-lg"
                        disabled={createAccountForm.plan !== 'TRIAL'}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <button
                        onClick={handleCreateAccount}
                        disabled={isSaving}
                        className="w-full px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        <Plus className="w-4 h-4" />
                        {isSaving ? t('admin.createAccount.creating') : t('admin.createAccount.create')}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Filter */}
              <div className="card p-4 sm:p-6">
                <div className="flex flex-wrap gap-2 sm:gap-3">
                  <button
                    onClick={() => setSelectedPlan('ALL')}
                    className={`px-3 sm:px-4 py-2 rounded-lg text-sm sm:text-base font-medium transition-colors ${
                      selectedPlan === 'ALL'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-card text-muted-foreground hover:bg-card/80'
                    }`}
                  >
                    {t('admin.filters.all')} ({stats.total})
                  </button>
                  <button
                    onClick={() => setSelectedPlan('TRIAL')}
                    className={`px-3 sm:px-4 py-2 rounded-lg text-sm sm:text-base font-medium transition-colors ${
                      selectedPlan === 'TRIAL'
                        ? 'bg-yellow-500 text-white'
                        : 'bg-card text-muted-foreground hover:bg-card/80'
                    }`}
                  >
                    {t('admin.filters.trial')} ({stats.trial})
                  </button>
                  <button
                    onClick={() => setSelectedPlan('MONTHLY')}
                    className={`px-3 sm:px-4 py-2 rounded-lg text-sm sm:text-base font-medium transition-colors ${
                      selectedPlan === 'MONTHLY'
                        ? 'bg-blue-500 text-white'
                        : 'bg-card text-muted-foreground hover:bg-card/80'
                    }`}
                  >
                    {t('admin.filters.monthly')} ({stats.monthly})
                  </button>
                  <button
                    onClick={() => setSelectedPlan('YEARLY')}
                    className={`px-3 sm:px-4 py-2 rounded-lg text-sm sm:text-base font-medium transition-colors ${
                      selectedPlan === 'YEARLY'
                        ? 'bg-green-500 text-white'
                        : 'bg-card text-muted-foreground hover:bg-card/80'
                    }`}
                  >
                    {t('admin.filters.yearly')} ({stats.yearly})
                  </button>
                </div>
              </div>

              {/* Clients Table */}
              <div className="card p-4 sm:p-6 overflow-hidden">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 sm:mb-6 gap-2">
                  <h2 className="text-xl sm:text-2xl font-bold">{t('admin.restaurants')}</h2>
                  <span className="text-xs sm:text-sm text-muted-foreground">
                    {clients.length} {t('common.total')}, {filteredClients.length} {t('common.filtered')}
                  </span>
                </div>
                {/* Desktop Table */}
                <div className="hidden md:block overflow-x-auto -mx-4 sm:-mx-6 px-4 sm:px-6" style={{ maxWidth: '100%' }}>
                  <div className="min-w-full inline-block">
                    <table className="w-full" style={{ minWidth: '800px', tableLayout: 'auto' }}>
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-3 px-4 font-semibold whitespace-nowrap">{t('admin.table.restaurant')}</th>
                        <th className="text-left py-3 px-4 font-semibold whitespace-nowrap">{t('admin.table.owner')}</th>
                        <th className="text-left py-3 px-4 font-semibold whitespace-nowrap">{t('admin.table.email')}</th>
                        <th className="text-left py-3 px-4 font-semibold whitespace-nowrap">{t('admin.table.plan')}</th>
                        <th className="text-left py-3 px-4 font-semibold whitespace-nowrap">{t('admin.table.trialUntil')}</th>
                        <th className="text-left py-3 px-4 font-semibold whitespace-nowrap">{t('common.actions')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredClients.length > 0 ? filteredClients.map((client) => {
                        const owner = client.memberships[0]?.user;

                        return (
                          <tr key={client.id} className="border-b border-border/50 hover:bg-card/50">
                            <td className="py-3 px-4 max-w-[200px]">
                              <span className="font-medium block truncate" title={client.name}>{client.name}</span>
                            </td>
                            <td className="py-3 px-4 text-muted-foreground max-w-[150px]">
                              <span className="block truncate" title={owner?.name || 'N/A'}>{owner?.name || 'N/A'}</span>
                            </td>
                            <td className="py-3 px-4 text-muted-foreground max-w-[200px] truncate" title={owner?.email || 'N/A'}>
                              {owner?.email || 'N/A'}
                            </td>
                            <td className="py-3 px-4 whitespace-nowrap">
                              <span
                                className={`px-3 py-1 rounded-full text-sm font-medium ${
                                  client.plan === 'TRIAL'
                                    ? 'bg-yellow-500/20 text-yellow-500'
                                    : client.plan === 'MONTHLY'
                                    ? 'bg-blue-500/20 text-blue-500'
                                    : 'bg-green-500/20 text-green-500'
                                }`}
                              >
                                {client.plan === 'TRIAL'
                                  ? 'Trial'
                                  : client.plan === 'MONTHLY'
                                  ? 'Mensal'
                                  : 'Anual'}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-muted-foreground whitespace-nowrap">
                              {client.trialEndsAt
                                ? new Date(client.trialEndsAt).toLocaleDateString('pt-PT')
                                : 'N/A'}
                            </td>
                            <td className="py-3 px-4 whitespace-nowrap">
                              <div className="flex gap-2">
                                <button
                                  onClick={() => handleEditClient(client)}
                                  className="p-2 text-primary hover:bg-primary/10 rounded-lg transition-colors"
                                  title="Editar restaurante"
                                >
                                  <Edit className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleDeleteRestaurant(client.id, client.name)}
                                  className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                                  title="Excluir restaurante"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      }) : (
                        <tr>
                          <td colSpan={6} className="text-center py-12 text-muted-foreground">
                            {clients.length === 0 ? t('admin.table.loading') : t('admin.table.noResults')}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                  </div>
                </div>
                {/* Mobile Cards */}
                <div className="md:hidden space-y-4">
                  {filteredClients.length > 0 ? filteredClients.map((client) => {
                    const owner = client.memberships[0]?.user;
                    return (
                      <div key={client.id} className="bg-card border border-border rounded-lg p-4 space-y-3">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <h3 className="font-semibold text-lg mb-1">{client.name}</h3>
                            <p className="text-sm text-muted-foreground">{owner?.name || 'N/A'}</p>
                            <p className="text-sm text-muted-foreground">{owner?.email || 'N/A'}</p>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleEditClient(client)}
                              className="p-2 text-primary hover:bg-primary/10 rounded-lg transition-colors"
                              title="Editar restaurante"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteRestaurant(client.id, client.name)}
                              className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                              title="Excluir restaurante"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <span
                            className={`px-3 py-1 rounded-full text-xs font-medium ${
                              client.plan === 'TRIAL'
                                ? 'bg-yellow-500/20 text-yellow-500'
                                : client.plan === 'MONTHLY'
                                ? 'bg-blue-500/20 text-blue-500'
                                : 'bg-green-500/20 text-green-500'
                            }`}
                          >
                            {client.plan === 'TRIAL'
                              ? 'Trial'
                              : client.plan === 'MONTHLY'
                              ? 'Mensal'
                              : 'Anual'}
                          </span>
                          {client.trialEndsAt && (
                            <span className="text-xs text-muted-foreground">
                              Trial até: {new Date(client.trialEndsAt).toLocaleDateString('pt-PT')}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  }) : (
                    <div className="text-center py-12 text-muted-foreground">
                      {clients.length === 0 ? 'A carregar restaurantes...' : 'Nenhum restaurante encontrado com o filtro selecionado'}
                    </div>
                  )}
                </div>
              </div>
                </>
              )}

              {/* Utilizadores Sub-tab */}
              {activeClientesSubTab === 'utilizadores' && (
                <>
                  {/* Users Table */}
                  <div className="card p-4 sm:p-6 overflow-hidden">
                    <h2 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6">{t('admin.users')}</h2>
                {/* Desktop Table */}
                <div className="hidden md:block overflow-x-auto -mx-4 sm:-mx-6 px-4 sm:px-6" style={{ maxWidth: '100%' }}>
                  <div className="min-w-full inline-block">
                    <table className="w-full" style={{ minWidth: '900px', tableLayout: 'auto' }}>
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-3 px-4 font-semibold whitespace-nowrap">{t('admin.table.name')}</th>
                        <th className="text-left py-3 px-4 font-semibold whitespace-nowrap">{t('admin.table.email')}</th>
                        <th className="text-left py-3 px-4 font-semibold whitespace-nowrap">{t('admin.table.restaurant')}</th>
                        <th className="text-left py-3 px-4 font-semibold whitespace-nowrap">{t('admin.table.role')}</th>
                        <th className="text-left py-3 px-4 font-semibold whitespace-nowrap">{t('admin.table.plan')}</th>
                        <th className="text-left py-3 px-4 font-semibold whitespace-nowrap">{t('common.actions')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((user) => {
                        const restaurant = user.memberships[0]?.restaurant;
                        const mainMembership = user.memberships.find(m => m.active) || user.memberships[0];
                        const userRole = mainMembership?.role;

                        return (
                          <tr key={user.id} className="border-b border-border/50 hover:bg-card/50">
                            <td className="py-3 px-4 max-w-[150px] truncate" title={user.name || 'N/A'}>
                              <span className="font-medium">{user.name || 'N/A'}</span>
                            </td>
                            <td className="py-3 px-4 text-muted-foreground max-w-[200px] truncate" title={user.email}>
                              {user.email}
                            </td>
                            <td className="py-3 px-4 text-muted-foreground max-w-[200px] truncate" title={restaurant?.name || 'N/A'}>
                              {restaurant?.name || 'N/A'}
                            </td>
                            <td className="py-3 px-4 whitespace-nowrap">
                              {userRole ? (
                                <span
                                  className={`px-3 py-1 rounded-full text-sm font-medium ${
                                    userRole === 'PLATFORM_ADMIN'
                                      ? 'bg-purple-500/20 text-purple-500'
                                      : userRole === 'OWNER'
                                      ? 'bg-primary/20 text-primary'
                                      : 'bg-gray-500/20 text-gray-500'
                                  }`}
                                >
                                  {userRole === 'PLATFORM_ADMIN'
                                    ? 'Admin'
                                    : userRole === 'OWNER'
                                    ? 'Proprietário'
                                    : 'Staff'}
                                </span>
                              ) : (
                                'N/A'
                              )}
                            </td>
                            <td className="py-3 px-4 whitespace-nowrap">
                              {restaurant ? (
                                <span
                                  className={`px-3 py-1 rounded-full text-sm font-medium ${
                                    restaurant.plan === 'TRIAL'
                                      ? 'bg-yellow-500/20 text-yellow-500'
                                      : restaurant.plan === 'MONTHLY'
                                      ? 'bg-blue-500/20 text-blue-500'
                                      : 'bg-green-500/20 text-green-500'
                                  }`}
                                >
                                  {restaurant.plan === 'TRIAL'
                                    ? 'Trial'
                                    : restaurant.plan === 'MONTHLY'
                                    ? 'Mensal'
                                    : 'Anual'}
                                </span>
                              ) : (
                                'N/A'
                              )}
                            </td>
                            <td className="py-3 px-4 whitespace-nowrap">
                              <div className="flex gap-2">
                                <button
                                  onClick={() => handleEditUser(user)}
                                  className="p-2 text-primary hover:bg-primary/10 rounded-lg transition-colors flex-shrink-0"
                                  title="Editar utilizador"
                                >
                                  <Edit className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => setShowPasswordModal({ userId: user.id, userName: user.name || user.email })}
                                  className="p-2 text-amber-500 hover:bg-amber-500/10 rounded-lg transition-colors flex-shrink-0"
                                  title="Alterar palavra-passe"
                                >
                                  <Key className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleSendPasswordReset(user.email)}
                                  className="p-2 text-blue-500 hover:bg-blue-500/10 rounded-lg transition-colors flex-shrink-0"
                                  title="Enviar link de redefinição de senha"
                                >
                                  <Send className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleDeleteAccount(user.id, user.name || user.email)}
                                  className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg transition-colors flex-shrink-0"
                                  title="Excluir conta"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  </div>
                  {users.length === 0 && (
                    <div className="text-center py-12 text-muted-foreground">
                      {t('admin.table.noUsers')}
                    </div>
                  )}
                </div>
                {/* Mobile Cards */}
                <div className="md:hidden space-y-4">
                  {users.length > 0 ? users.map((user) => {
                    const restaurant = user.memberships[0]?.restaurant;
                    const mainMembership = user.memberships.find(m => m.active) || user.memberships[0];
                    const userRole = mainMembership?.role;
                    return (
                      <div key={user.id} className="bg-card border border-border rounded-lg p-4 space-y-3">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <h3 className="font-semibold text-lg mb-1">{user.name || 'N/A'}</h3>
                            <p className="text-sm text-muted-foreground">{user.email}</p>
                            <p className="text-sm text-muted-foreground">{restaurant?.name || 'N/A'}</p>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            <button
                              onClick={() => handleEditUser(user)}
                              className="p-2 text-primary hover:bg-primary/10 rounded-lg transition-colors"
                              title="Editar utilizador"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setShowPasswordModal({ userId: user.id, userName: user.name || user.email })}
                              className="p-2 text-amber-500 hover:bg-amber-500/10 rounded-lg transition-colors"
                              title="Alterar palavra-passe"
                            >
                              <Key className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleSendPasswordReset(user.email)}
                              className="p-2 text-blue-500 hover:bg-blue-500/10 rounded-lg transition-colors"
                              title="Enviar link de redefinição"
                            >
                              <Send className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteAccount(user.id, user.name || user.email)}
                              className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                              title="Excluir conta"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {userRole && (
                            <span
                              className={`px-3 py-1 rounded-full text-xs font-medium ${
                                userRole === 'PLATFORM_ADMIN'
                                  ? 'bg-purple-500/20 text-purple-500'
                                  : userRole === 'OWNER'
                                  ? 'bg-primary/20 text-primary'
                                  : 'bg-gray-500/20 text-gray-500'
                              }`}
                            >
                              {userRole === 'PLATFORM_ADMIN'
                                ? 'Admin'
                                : userRole === 'OWNER'
                                ? 'Proprietário'
                                : 'Staff'}
                            </span>
                          )}
                          {restaurant && (
                            <span
                              className={`px-3 py-1 rounded-full text-xs font-medium ${
                                restaurant.plan === 'TRIAL'
                                  ? 'bg-yellow-500/20 text-yellow-500'
                                  : restaurant.plan === 'MONTHLY'
                                  ? 'bg-blue-500/20 text-blue-500'
                                  : 'bg-green-500/20 text-green-500'
                              }`}
                            >
                              {restaurant.plan === 'TRIAL'
                                ? 'Trial'
                                : restaurant.plan === 'MONTHLY'
                                ? 'Mensal'
                                : 'Anual'}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  }) : (
                    <div className="text-center py-12 text-muted-foreground">
                      Nenhum utilizador encontrado
                    </div>
                  )}
                </div>
              </div>
                </>
              )}
            </div>
          )}

          {/* Configurações Tab */}
          {activeTab === 'configuracoes' && (
            <div className="space-y-6 sm:space-y-8">
              <div className="card p-4 sm:p-6">
                <h2 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6">{t('admin.settings.appearance')}</h2>
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 gap-4">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold mb-2">Tema</h3>
                    <p className="text-sm sm:text-base text-muted-foreground">
                      Alterar entre modo claro e escuro
                    </p>
                  </div>
                  <button
                    onClick={toggleTheme}
                    className="flex items-center gap-3 px-4 sm:px-6 py-3 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors w-full sm:w-auto justify-center"
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
                </div>
                {themeChanged && (
                  <div className="mt-4 p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                    <p className="text-sm text-amber-600 dark:text-amber-400 mb-3">
                      {t('admin.settings.unsavedTheme')}
                    </p>
                    <button
                      onClick={saveTheme}
                      className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors flex items-center gap-2"
                    >
                      <Save className="w-4 h-4" />
                      {t('admin.settings.saveChanges')}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Notifications */}
      <div className="fixed top-4 left-4 right-4 sm:left-auto sm:right-4 z-50 space-y-2 max-w-sm sm:min-w-[300px]">
        {notifications.map((notification) => (
          <div
            key={notification.id}
            className={`w-full sm:min-w-[300px] p-3 sm:p-4 rounded-lg shadow-lg border flex items-start gap-3 animate-slide-in-right ${
              notification.type === 'success'
                ? 'bg-green-500/10 border-green-500/30 text-green-600 dark:text-green-400'
                : notification.type === 'error'
                ? 'bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400'
                : 'bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400'
            }`}
          >
            {notification.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5" />
            ) : notification.type === 'error' ? (
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            )}
            <p className="flex-1 text-sm font-medium">{notification.message}</p>
            <button
              onClick={() => setNotifications(prev => prev.filter(n => n.id !== notification.id))}
              className="text-current opacity-70 hover:opacity-100"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      {/* Unsaved Changes Modal */}
      {pendingTabChange && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-card rounded-lg p-4 sm:p-6 max-w-md w-full border border-border my-4 sm:my-8">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle className="w-6 h-6 text-amber-500" />
              <h3 className="text-xl font-bold">Alterações não guardadas</h3>
            </div>
            <p className="text-muted-foreground mb-6">
              Tem alterações não guardadas. Deseja guardar antes de mudar de vista?
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-end">
              <button
                onClick={cancelTabChange}
                className="px-4 py-2 rounded-lg border border-border hover:bg-card transition-colors w-full sm:w-auto"
              >
                Cancelar
              </button>
              <button
                onClick={confirmTabChange}
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors w-full sm:w-auto"
              >
                Continuar sem guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Client Modal */}
      {showEditClientModal && editForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-card rounded-lg p-4 sm:p-6 max-w-2xl w-full border border-border my-4 sm:my-8">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-bold">{t('admin.modals.editRestaurant')}</h3>
              <button
                onClick={() => {
                  setShowEditClientModal(null);
                  setEditForm(null);
                  setHasUnsavedChanges(false);
                }}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                      <label className="block text-sm font-medium mb-2">{t('admin.createAccount.restaurantName')}</label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) => {
                    setEditForm({ ...editForm, name: e.target.value });
                    setHasUnsavedChanges(true);
                  }}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg"
                />
              </div>
              <div>
                      <label className="block text-sm font-medium mb-2">{t('admin.createAccount.plan')}</label>
                <select
                  value={editForm.plan}
                  onChange={(e) => {
                    setEditForm({ ...editForm, plan: e.target.value as Plan });
                    setHasUnsavedChanges(true);
                  }}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg"
                >
                  <option value="TRIAL">Trial</option>
                  <option value="MONTHLY">Mensal</option>
                  <option value="YEARLY">Anual</option>
                </select>
              </div>
              <div>
                      <label className="block text-sm font-medium mb-2">{t('admin.createAccount.trialUntil')}</label>
                <input
                  type="date"
                  value={editForm.trialEndsAt}
                  onChange={(e) => {
                    setEditForm({ ...editForm, trialEndsAt: e.target.value });
                    setHasUnsavedChanges(true);
                  }}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg"
                />
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 justify-end mt-6">
              <button
                onClick={() => {
                  setShowEditClientModal(null);
                  setEditForm(null);
                  setHasUnsavedChanges(false);
                }}
                className="px-4 py-2 rounded-lg border border-border hover:bg-card transition-colors w-full sm:w-auto"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveClient}
                disabled={isSaving}
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 w-full sm:w-auto"
              >
                <Save className="w-4 h-4" />
                {isSaving ? 'A guardar...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {showEditUserModal && editUserForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-card rounded-lg p-4 sm:p-6 max-w-2xl w-full border border-border my-4 sm:my-8">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-bold">{t('admin.modals.editUser')}</h3>
              <button
                onClick={() => {
                  setShowEditUserModal(null);
                  setEditUserForm(null);
                  setHasUnsavedChanges(false);
                }}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Nome</label>
                <input
                  type="text"
                  value={editUserForm.name}
                  onChange={(e) => {
                    setEditUserForm({ ...editUserForm, name: e.target.value });
                    setHasUnsavedChanges(true);
                  }}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg"
                />
              </div>
              <div>
                      <label className="block text-sm font-medium mb-2">{t('admin.table.email')}</label>
                <input
                  type="email"
                  value={editUserForm.email}
                  onChange={(e) => {
                    setEditUserForm({ ...editUserForm, email: e.target.value });
                    setHasUnsavedChanges(true);
                  }}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg"
                />
              </div>
              {editUserForm.membershipId && (
                <div>
                      <label className="block text-sm font-medium mb-2">{t('admin.table.role')}</label>
                  <select
                    value={editUserForm.role || ''}
                    onChange={(e) => {
                      setEditUserForm({ 
                        ...editUserForm, 
                        role: e.target.value as 'OWNER' | 'STAFF' | 'PLATFORM_ADMIN' 
                      });
                      setHasUnsavedChanges(true);
                    }}
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg"
                  >
                    <option value="OWNER">Proprietário</option>
                    <option value="STAFF">Staff</option>
                    <option value="PLATFORM_ADMIN">Admin da Plataforma</option>
                  </select>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t('admin.table.role')}
                  </p>
                </div>
              )}
            </div>
            <div className="flex flex-col sm:flex-row gap-3 justify-end mt-6">
              <button
                onClick={() => {
                  setShowEditUserModal(null);
                  setEditUserForm(null);
                  setHasUnsavedChanges(false);
                }}
                className="px-4 py-2 rounded-lg border border-border hover:bg-card transition-colors w-full sm:w-auto"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleSaveUser}
                disabled={isSaving}
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 w-full sm:w-auto"
              >
                <Save className="w-4 h-4" />
                {isSaving ? t('common.loading') : t('common.save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Change Password Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-card rounded-lg p-4 sm:p-6 max-w-md w-full border border-border my-4 sm:my-8">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-bold">{t('admin.modals.changePassword')}</h3>
              <button
                onClick={() => {
                  setShowPasswordModal(null);
                  setNewPassword('');
                }}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Nova palavra-passe para: <strong>{showPasswordModal.userName}</strong>
              </p>
              <div>
                <label className="block text-sm font-medium mb-2">Nova Palavra-passe</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg"
                />
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 justify-end mt-6">
              <button
                onClick={() => {
                  setShowPasswordModal(null);
                  setNewPassword('');
                }}
                className="px-4 py-2 rounded-lg border border-border hover:bg-card transition-colors w-full sm:w-auto"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleChangePassword(showPasswordModal.userId)}
                disabled={isSaving || !newPassword || newPassword.length < 6}
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 w-full sm:w-auto"
              >
                <Key className="w-4 h-4" />
                {isSaving ? 'A alterar...' : 'Alterar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-card rounded-lg p-4 sm:p-6 max-w-md w-full border border-border my-4 sm:my-8">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle className="w-6 h-6 text-red-500" />
              <h3 className="text-xl font-bold">{t('admin.modals.deleteConfirm')}</h3>
            </div>
            <p className="text-muted-foreground mb-4">
              {t('admin.modals.deleteWarning')} <strong>{showDeleteModal.name}</strong>?
            </p>
            <p className="text-sm text-muted-foreground mb-4">
              {t('admin.modals.deleteInstruction')}
            </p>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder={t('admin.modals.typeEliminar')}
              className="w-full px-3 py-2 bg-background border border-border rounded-lg mb-4"
            />
            <div className="flex flex-col sm:flex-row gap-3 justify-end">
              <button
                onClick={() => {
                  setShowDeleteModal(null);
                  setDeleteConfirmText('');
                }}
                className="px-4 py-2 rounded-lg border border-border hover:bg-card transition-colors w-full sm:w-auto"
              >
                Cancelar
              </button>
              <button
                onClick={confirmDelete}
                disabled={isSaving || deleteConfirmText.toLowerCase() !== 'eliminar'}
                className="px-4 py-2 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 w-full sm:w-auto"
              >
                <Trash2 className="w-4 h-4" />
                {isSaving ? 'A eliminar...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
