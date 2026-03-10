'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Loader2, Search, Pencil, Trash2, Key, Mail, X, Check, Shield } from 'lucide-react';
import { getAllUsers, updateUser, sendPasswordReset, changeUserPassword, deleteAccount } from '../actions';

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
    if (result.success) { toast.success('Utilizador atualizado!'); setEditingId(null); await loadUsers(); }
    else toast.error(result.error || 'Erro');
    setSaving(false);
  };

  const handleResetPw = async (email: string) => {
    const result = await sendPasswordReset(email);
    if (result.success) toast.success('Email de reset enviado!');
    else toast.error(result.error || 'Erro');
  };

  const handleChangePw = async (userId: string) => {
    if (newPassword.length < 6) { toast.error('Mínimo 6 caracteres'); return; }
    setSaving(true);
    const result = await changeUserPassword(userId, newPassword);
    if (result.success) { toast.success('Palavra-passe alterada!'); setChangingPwId(null); setNewPassword(''); }
    else toast.error(result.error || 'Erro');
    setSaving(false);
  };

  const handleDelete = async (userId: string, email: string) => {
    const input = prompt(`Para eliminar ${email}, escreva "eliminar":`);
    if (input !== 'eliminar') return;
    const result = await deleteAccount(userId);
    if (result.success) { toast.success('Conta eliminada!'); await loadUsers(); }
    else toast.error(result.error || 'Erro');
  };

  if (loading) {
    return <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Pesquisar por email ou nome..." className="input-field pl-9 w-full" />
      </div>

      {/* Users table */}
      <div className="card-glass rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5">
                <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground">Utilizador</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground hidden md:table-cell">Email</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground">Role</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground hidden lg:table-cell">Restaurante</th>
                <th className="text-right py-3 px-4 text-xs font-medium text-muted-foreground">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(u => {
                const mainMembership = u.memberships[0];
                const role = mainMembership?.role || '—';
                const restaurant = mainMembership?.restaurant;

                return (
                  <tr key={u.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                    <td className="py-3 px-4">
                      {editingId === u.id ? (
                        <div className="flex items-center gap-2">
                          <input type="text" value={editName} onChange={e => setEditName(e.target.value)} className="input-field !py-1 !text-xs w-[150px]" />
                          <button onClick={() => handleSaveName(u.id)} disabled={saving} className="p-1 rounded bg-success/20 text-green-400">
                            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                          </button>
                          <button onClick={() => setEditingId(null)} className="p-1 rounded bg-white/5 text-muted-foreground"><X className="w-3 h-3" /></button>
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
                        'bg-white/5 text-muted-foreground border-white/10'
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
                          <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Nova pw..." className="input-field !py-1 !text-xs w-[120px]" />
                          <button onClick={() => handleChangePw(u.id)} disabled={saving} className="p-1 rounded bg-success/20 text-green-400">
                            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                          </button>
                          <button onClick={() => { setChangingPwId(null); setNewPassword(''); }} className="p-1 rounded bg-white/5 text-muted-foreground"><X className="w-3 h-3" /></button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 justify-end">
                          <button onClick={() => { setEditingId(u.id); setEditName(u.name || ''); }} title="Editar nome" className="p-1.5 rounded-lg hover:bg-white/5 text-muted-foreground hover:text-foreground transition-colors">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => handleResetPw(u.email)} title="Enviar reset email" className="p-1.5 rounded-lg hover:bg-white/5 text-muted-foreground hover:text-foreground transition-colors">
                            <Mail className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => { setChangingPwId(u.id); setNewPassword(''); }} title="Alterar password" className="p-1.5 rounded-lg hover:bg-white/5 text-muted-foreground hover:text-foreground transition-colors">
                            <Key className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => handleDelete(u.id, u.email)} title="Eliminar conta" className="p-1.5 rounded-lg hover:bg-danger/10 text-muted-foreground hover:text-red-400 transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
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
            <div className="py-12 text-center text-sm text-muted-foreground">Nenhum utilizador encontrado.</div>
          )}
        </div>
        <div className="px-4 py-3 border-t border-white/5 text-xs text-muted-foreground">
          {filtered.length} utilizadores
        </div>
      </div>
    </div>
  );
}
