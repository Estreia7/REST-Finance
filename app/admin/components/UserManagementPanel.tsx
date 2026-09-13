'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Loader2, Search, Pencil, Trash2, Key, Mail, X, Check, Shield } from 'lucide-react';
import { useLanguage } from '@/lib/language-context';
import { translateError } from '@/lib/error-messages';
import { getAllUsers, updateUser, sendPasswordReset, changeUserPassword, deleteAccount } from '../actions';
import { MIN_PASSWORD_LENGTH } from '@/lib/validations';

interface UserData {
  id: string;
  email: string;
  name: string | null;
  createdAt: Date;
  memberships: Array<{
    id: string;
    role: string;
    restaurant: { id: string; name: string; plan: string } | null;
  }>;
}

export default function UserManagementPanel() {
  const { t, language } = useLanguage();
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [saving, setSaving] = useState(false);
  const [changingPwId, setChangingPwId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');

  const loadUsers = async () => {
    setLoading(true);
    const result = await getAllUsers();
    if (result.success && result.data) setUsers(result.data as UserData[]);
    setLoading(false);
  };

  useEffect(() => { loadUsers(); }, []);

  const filtered = users.filter(u => {
    const q = search.toLowerCase();
    return !q || u.email.toLowerCase().includes(q) || u.name?.toLowerCase().includes(q);
  });

  const handleSaveName = async (userId: string) => {
    setSaving(true);
    const result = await updateUser({ userId, name: editName });
    if (result.success) { toast.success(t('admin.userList.nameUpdated')); setEditingId(null); await loadUsers(); }
    else toast.error(translateError(language, result.error));
    setSaving(false);
  };

  const handleResetPw = async (email: string) => {
    const result = await sendPasswordReset(email);
    if (result.success) toast.success(t('admin.userList.resetSent'));
    else toast.error(translateError(language, result.error));
  };

  const handleChangePw = async (userId: string) => {
    if (newPassword.length < MIN_PASSWORD_LENGTH) { toast.error(t('admin.userList.passwordTooShort')); return; }
    setSaving(true);
    const result = await changeUserPassword(userId, newPassword);
    if (result.success) { toast.success(t('admin.userList.passwordChanged')); setChangingPwId(null); setNewPassword(''); }
    else toast.error(translateError(language, result.error));
    setSaving(false);
  };

  const handleDelete = async (userId: string, email: string) => {
    // The email is the account being deleted — data, not copy. The keyword the
    // administrator has to type is translated alongside the prompt, so the two
    // always agree.
    const keyword = t('admin.userList.deleteKeyword');
    const input = prompt(t('admin.userList.deletePrompt').replace('{email}', email));
    if (input !== keyword) return;
    const result = await deleteAccount(userId);
    if (result.success) { toast.success(t('admin.userList.accountDeleted')); await loadUsers(); }
    else toast.error(translateError(language, result.error));
  };

  if (loading) {
    return <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder={t('admin.userList.searchPlaceholder')} aria-label={t('admin.userList.searchPlaceholder')} className="input-field pl-9 w-full" />
      </div>

      {/* Users table */}
      <div className="card-glass rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-subtle">
                <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground">{t('admin.userList.colUser')}</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground hidden md:table-cell">{t('admin.userList.colEmail')}</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground">{t('admin.userList.colRole')}</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground hidden lg:table-cell">{t('admin.userList.colRestaurant')}</th>
                <th className="text-right py-3 px-4 text-xs font-medium text-muted-foreground">{t('admin.userList.colActions')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(u => {
                const mainMembership = u.memberships[0];
                const role = mainMembership?.role || '—';
                const restaurant = mainMembership?.restaurant;

                return (
                  <tr key={u.id} className="border-b border-border-subtle hover:bg-muted transition-colors">
                    <td className="py-3 px-4">
                      {editingId === u.id ? (
                        <div className="flex items-center gap-2">
                          <input type="text" value={editName} onChange={e => setEditName(e.target.value)} aria-label={t('admin.userList.nameLabel')} className="input-field !py-1 !text-xs w-[150px]" />
                          <button onClick={() => handleSaveName(u.id)} disabled={saving} aria-label={t('admin.userList.confirmEdit')} title={t('admin.userList.confirmEdit')} className="p-1 rounded bg-success/20 text-green-400">
                            {saving ? <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" /> : <Check className="w-3 h-3" aria-hidden="true" />}
                          </button>
                          <button onClick={() => setEditingId(null)} aria-label={t('admin.userList.cancelEdit')} title={t('admin.userList.cancelEdit')} className="p-1 rounded bg-muted text-muted-foreground"><X className="w-3 h-3" aria-hidden="true" /></button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg gradient-bg flex items-center justify-center shrink-0">
                            <span className="text-white text-xs font-bold">{(u.name || u.email)[0].toUpperCase()}</span>
                          </div>
                          <span className="font-medium text-foreground">{u.name || '—'}</span>
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-muted-foreground text-xs hidden md:table-cell">{u.email}</td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium border ${
                        role === 'PLATFORM_ADMIN' ? 'bg-primary/10 text-primary border-primary/20' :
                        role === 'OWNER' ? 'bg-success/10 text-success border-success/20' :
                        'bg-muted text-muted-foreground border-border'
                      }`}>
                        {role === 'PLATFORM_ADMIN' && <Shield className="w-2.5 h-2.5" />}
                        {role}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-muted-foreground text-xs hidden lg:table-cell">
                      {restaurant?.name || '—'}
                    </td>
                    <td className="py-3 px-4 text-right">
                      {changingPwId === u.id ? (
                        <div className="flex items-center gap-2 justify-end">
                          <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder={t('admin.userList.newPasswordPlaceholder')} aria-label={t('admin.userList.newPasswordLabel')} className="input-field !py-1 !text-xs w-[120px]" />
                          <button onClick={() => handleChangePw(u.id)} disabled={saving} aria-label={t('admin.userList.confirmPassword')} title={t('admin.userList.confirmPassword')} className="p-1 rounded bg-success/20 text-green-400">
                            {saving ? <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" /> : <Check className="w-3 h-3" aria-hidden="true" />}
                          </button>
                          <button onClick={() => { setChangingPwId(null); setNewPassword(''); }} aria-label={t('admin.userList.cancelPassword')} title={t('admin.userList.cancelPassword')} className="p-1 rounded bg-muted text-muted-foreground"><X className="w-3 h-3" aria-hidden="true" /></button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 justify-end">
                          <button onClick={() => { setEditingId(u.id); setEditName(u.name || ''); }} title={t('admin.userList.editName')} aria-label={t('admin.userList.editName')} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                            <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                          <button onClick={() => handleResetPw(u.email)} title={t('admin.userList.sendReset')} aria-label={t('admin.userList.sendReset')} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                            <Mail className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                          <button onClick={() => { setChangingPwId(u.id); setNewPassword(''); }} title={t('admin.userList.changePassword')} aria-label={t('admin.userList.changePassword')} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                            <Key className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                          <button onClick={() => handleDelete(u.id, u.email)} title={t('admin.userList.deleteAccount')} aria-label={t('admin.userList.deleteAccount')} className="p-1.5 rounded-lg hover:bg-danger/10 text-muted-foreground hover:text-red-400 transition-colors">
                            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="py-12 text-center text-sm text-muted-foreground">{t('admin.userList.empty')}</div>
          )}
        </div>
        <div className="px-4 py-3 border-t border-border-subtle text-xs text-muted-foreground">
          {filtered.length} {t('admin.userList.countLabel')}
        </div>
      </div>
    </div>
  );
}
