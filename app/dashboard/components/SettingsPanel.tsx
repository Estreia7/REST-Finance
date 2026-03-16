'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Sun, Moon, Save, AlertCircle, CheckCircle2, Loader2, User, Lock, Building2 } from 'lucide-react';
import { updateUserProfile, changePassword, updateRestaurantSettings } from '../actions';

interface SettingsPanelProps {
  pendingTheme:      'light' | 'dark';
  hasUnsavedChanges: boolean;
  onThemeChange:     (theme: 'light' | 'dark') => void;
  onSaveTheme:       () => void;
  onCancelTheme:     () => void;
  currentUser:       any;
  restaurant?:       any;
  onUpdate?:         () => void;
}

export default function SettingsPanel({
  pendingTheme, hasUnsavedChanges, onThemeChange, onSaveTheme, onCancelTheme, currentUser, restaurant, onUpdate,
}: SettingsPanelProps) {
  // Profile
  const [name, setName] = useState(currentUser?.name || '');
  const [savingProfile, setSavingProfile] = useState(false);

  // Password
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [savingPw, setSavingPw] = useState(false);

  // Restaurant
  const [restaurantName, setRestaurantName] = useState(restaurant?.name || '');
  const [timezone, setTimezone] = useState(restaurant?.timezone || 'Europe/Lisbon');
  const [currency, setCurrency] = useState(restaurant?.currency || 'EUR');
  const [savingRestaurant, setSavingRestaurant] = useState(false);

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    const result = await updateUserProfile(name);
    if (result.success) { toast.success('Perfil atualizado!'); onUpdate?.(); }
    else toast.error(result.error || 'Erro ao atualizar');
    setSavingProfile(false);
  };

  const handleChangePassword = async () => {
    if (newPw !== confirmPw) { toast.error('As palavras-passe não coincidem'); return; }
    if (newPw.length < 6) { toast.error('Mínimo 6 caracteres'); return; }
    setSavingPw(true);
    const result = await changePassword(currentPw, newPw);
    if (result.success) {
      toast.success('Palavra-passe alterada!');
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
    } else toast.error(result.error || 'Erro ao alterar');
    setSavingPw(false);
  };

  const handleSaveRestaurant = async () => {
    setSavingRestaurant(true);
    const result = await updateRestaurantSettings({ name: restaurantName, timezone, currency });
    if (result.success) { toast.success('Restaurante atualizado!'); onUpdate?.(); }
    else toast.error(result.error || 'Erro ao atualizar');
    setSavingRestaurant(false);
  };

  return (
    <div className="max-w-2xl space-y-6">
      {/* Profile */}
      <div className="card-glass p-6">
        <div className="flex items-center gap-2 mb-5">
          <User className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-lg font-bold text-foreground">Perfil</h2>
        </div>
        <div className="space-y-4">
          <div className="flex items-center gap-4 p-4 rounded-xl bg-white/[0.02] border border-white/5">
            <div className="w-10 h-10 rounded-xl gradient-bg flex items-center justify-center">
              <span className="text-white font-bold text-sm">
                {(name || currentUser?.email || 'U').charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="text-xs text-muted-foreground">{currentUser?.email || '—'}</div>
          </div>
          <div>
            <label htmlFor="settings-name" className="text-xs font-medium text-muted-foreground block mb-2">Nome</label>
            <input id="settings-name" type="text" value={name} onChange={e => setName(e.target.value)} className="input-field" placeholder="O seu nome" />
          </div>
          <button onClick={handleSaveProfile} disabled={savingProfile || name === (currentUser?.name || '')} className="cta-button py-2 px-5 text-sm disabled:opacity-40">
            {savingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Guardar
          </button>
        </div>
      </div>

      {/* Password */}
      <div className="card-glass p-6">
        <div className="flex items-center gap-2 mb-5">
          <Lock className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-lg font-bold text-foreground">Palavra-passe</h2>
        </div>
        <div className="space-y-4">
          <div>
            <label htmlFor="settings-new-pw" className="text-xs font-medium text-muted-foreground block mb-2">Nova palavra-passe</label>
            <input id="settings-new-pw" type="password" value={newPw} onChange={e => setNewPw(e.target.value)} className="input-field" placeholder="Mínimo 6 caracteres" />
          </div>
          <div>
            <label htmlFor="settings-confirm-pw" className="text-xs font-medium text-muted-foreground block mb-2">Confirmar</label>
            <input id="settings-confirm-pw" type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} className="input-field" placeholder="Repetir palavra-passe" />
          </div>
          <button onClick={handleChangePassword} disabled={savingPw || !newPw} className="cta-button py-2 px-5 text-sm disabled:opacity-40">
            {savingPw ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
            Alterar
          </button>
        </div>
      </div>

      {/* Restaurant */}
      {restaurant && (
        <div className="card-glass p-6">
          <div className="flex items-center gap-2 mb-5">
            <Building2 className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-lg font-bold text-foreground">Restaurante</h2>
          </div>
          <div className="space-y-4">
            <div>
              <label htmlFor="settings-restaurant-name" className="text-xs font-medium text-muted-foreground block mb-2">Nome do restaurante</label>
              <input id="settings-restaurant-name" type="text" value={restaurantName} onChange={e => setRestaurantName(e.target.value)} className="input-field" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="settings-timezone" className="text-xs font-medium text-muted-foreground block mb-2">Fuso horário</label>
                <select id="settings-timezone" value={timezone} onChange={e => setTimezone(e.target.value)} className="input-field">
                  <option value="Europe/Lisbon">Europa/Lisboa</option>
                  <option value="Europe/London">Europa/Londres</option>
                  <option value="Europe/Madrid">Europa/Madrid</option>
                  <option value="Europe/Paris">Europa/Paris</option>
                  <option value="America/Sao_Paulo">América/São Paulo</option>
                </select>
              </div>
              <div>
                <label htmlFor="settings-currency" className="text-xs font-medium text-muted-foreground block mb-2">Moeda</label>
                <select id="settings-currency" value={currency} onChange={e => setCurrency(e.target.value)} className="input-field">
                  <option value="EUR">EUR (€)</option>
                  <option value="USD">USD ($)</option>
                  <option value="GBP">GBP (£)</option>
                  <option value="BRL">BRL (R$)</option>
                </select>
              </div>
            </div>
            <button onClick={handleSaveRestaurant} disabled={savingRestaurant} className="cta-button py-2 px-5 text-sm disabled:opacity-40">
              {savingRestaurant ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Guardar
            </button>
          </div>
        </div>
      )}

      {/* Appearance */}
      <div className="card-glass p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-bold text-foreground">Aparência</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Personaliza o tema do teu dashboard</p>
          </div>
          {hasUnsavedChanges && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-warning/10 rounded-lg">
              <AlertCircle className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-medium text-amber-400">Alterações por guardar</span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4 mb-6">
          {(['light', 'dark'] as const).map(t => {
            const active = pendingTheme === t;
            const Icon   = t === 'light' ? Sun : Moon;
            const label  = t === 'light' ? 'Claro' : 'Escuro';
            return (
              <button
                key={t}
                onClick={() => onThemeChange(t)}
                className={`relative p-5 rounded-xl border-2 transition-all text-left ${
                  active ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/30'
                }`}
              >
                <div className="flex items-center gap-2.5 mb-3">
                  <Icon className={`w-4 h-4 ${active ? 'text-primary' : 'text-muted-foreground'}`} />
                  <span className={`text-sm font-semibold ${active ? 'text-primary' : 'text-foreground'}`}>{label}</span>
                </div>
                <div className={`w-full h-14 rounded-lg border flex items-center justify-center ${
                  t === 'light' ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-700'
                }`}>
                  <div className="w-8 h-8 rounded-lg gradient-bg shadow-glow-sm" />
                </div>
                {active && (
                  <div className="absolute top-3 right-3 w-5 h-5 rounded-full gradient-bg flex items-center justify-center">
                    <CheckCircle2 className="w-3 h-3 text-white" />
                  </div>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/5">
          <button onClick={onCancelTheme} disabled={!hasUnsavedChanges} className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-white/5 rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed">
            Cancelar
          </button>
          <button onClick={onSaveTheme} disabled={!hasUnsavedChanges} className="cta-button py-2 px-5 text-sm disabled:opacity-40 disabled:cursor-not-allowed">
            <Save className="w-4 h-4" /> Guardar
          </button>
        </div>
      </div>
    </div>
  );
}
