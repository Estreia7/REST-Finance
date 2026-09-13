'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Sun, Moon, Save, AlertCircle, CheckCircle2, Loader2, User, Lock, Building2 } from 'lucide-react';
import { updateUserProfile, changePassword, updateRestaurantSettings } from '../actions';
import {
  uploadRestaurantLogo, removeRestaurantLogo,
  uploadProfilePicture, removeProfilePicture,
} from '../image-actions';
import ImageUpload from './ImageUpload';
import CategoryManager from './CategoryManager';
import { useLanguage } from '@/lib/language-context';
import { MIN_PASSWORD_LENGTH } from '@/lib/validations';

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
  const { t } = useLanguage();

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
    if (result.success) { toast.success(t('settings.profileUpdated')); onUpdate?.(); }
    else toast.error(result.error || t('settings.updateFailed'));
    setSavingProfile(false);
  };

  const handleChangePassword = async () => {
    if (newPw !== confirmPw) { toast.error(t('settings.passwordMismatch')); return; }
    if (newPw.length < MIN_PASSWORD_LENGTH) { toast.error(t('settings.passwordTooShort')); return; }
    setSavingPw(true);
    const result = await changePassword(currentPw, newPw);
    if (result.success) {
      toast.success(t('settings.passwordChanged'));
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
    } else toast.error(result.error || t('settings.passwordChangeFailed'));
    setSavingPw(false);
  };

  const handleSaveRestaurant = async () => {
    setSavingRestaurant(true);
    const result = await updateRestaurantSettings({ name: restaurantName, timezone, currency });
    if (result.success) { toast.success(t('settings.restaurantUpdated')); onUpdate?.(); }
    else toast.error(result.error || t('settings.updateFailed'));
    setSavingRestaurant(false);
  };

  return (
    <div className="max-w-2xl space-y-6">
      {/* Profile */}
      <div className="card-glass p-6">
        <div className="flex items-center gap-2 mb-5">
          <User className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-lg font-bold text-foreground">{t('settings.profile')}</h2>
        </div>
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-surface border border-border-subtle">
            <ImageUpload
              kind="avatar"
              shape="circle"
              currentPath={currentUser?.image ?? null}
              label={t('settings.profilePicture')}
              hint={t('settings.imageHint')}
              onUpload={uploadProfilePicture}
              onRemove={removeProfilePicture}
            />
          </div>

          <div className="flex items-center gap-4 p-4 rounded-xl bg-surface border border-border-subtle">
            <div className="w-10 h-10 rounded-xl gradient-bg flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-sm">
                {(name || currentUser?.email || 'U').charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="text-xs text-muted-foreground">{currentUser?.email || '—'}</div>
          </div>
          <div>
            <label htmlFor="settings-name" className="text-xs font-medium text-muted-foreground block mb-2">{t('settings.name')}</label>
            <input id="settings-name" type="text" value={name} onChange={e => setName(e.target.value)} className="input-field" placeholder={t('settings.namePlaceholder')} />
          </div>
          <button onClick={handleSaveProfile} disabled={savingProfile || name === (currentUser?.name || '')} className="cta-button py-2 px-5 text-sm disabled:opacity-40">
            {savingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {t('settings.save')}
          </button>
        </div>
      </div>

      {/* Password */}
      <div className="card-glass p-6">
        <div className="flex items-center gap-2 mb-5">
          <Lock className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-lg font-bold text-foreground">{t('settings.password')}</h2>
        </div>
        <div className="space-y-4">
          <div>
            <label htmlFor="settings-new-pw" className="text-xs font-medium text-muted-foreground block mb-2">{t('settings.newPassword')}</label>
            <input id="settings-new-pw" type="password" value={newPw} onChange={e => setNewPw(e.target.value)} className="input-field" placeholder={t('settings.passwordMinPlaceholder')} />
          </div>
          <div>
            <label htmlFor="settings-confirm-pw" className="text-xs font-medium text-muted-foreground block mb-2">{t('settings.confirmPassword')}</label>
            <input id="settings-confirm-pw" type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} className="input-field" placeholder={t('settings.repeatPassword')} />
          </div>
          <button onClick={handleChangePassword} disabled={savingPw || !newPw} className="cta-button py-2 px-5 text-sm disabled:opacity-40">
            {savingPw ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
            {t('settings.change')}
          </button>
        </div>
      </div>

      {/* Restaurant */}
      {restaurant && (
        <div className="card-glass p-6">
          <div className="flex items-center gap-2 mb-5">
            <Building2 className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-lg font-bold text-foreground">{t('settings.restaurant')}</h2>
          </div>
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-surface border border-border-subtle">
              <ImageUpload
                kind="logo"
                currentPath={restaurant?.logoPath ?? null}
                label={t('settings.logo')}
                hint={t('settings.logoHint')}
                onUpload={uploadRestaurantLogo}
                onRemove={removeRestaurantLogo}
              />
            </div>

            <div>
              <label htmlFor="settings-restaurant-name" className="text-xs font-medium text-muted-foreground block mb-2">{t('settings.restaurantName')}</label>
              <input id="settings-restaurant-name" type="text" value={restaurantName} onChange={e => setRestaurantName(e.target.value)} className="input-field" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="settings-timezone" className="text-xs font-medium text-muted-foreground block mb-2">{t('settings.timezone')}</label>
                <select id="settings-timezone" value={timezone} onChange={e => setTimezone(e.target.value)} className="input-field">
                  <option value="Europe/Lisbon">{t('settings.tzLisbon')}</option>
                  <option value="Europe/London">{t('settings.tzLondon')}</option>
                  <option value="Europe/Madrid">{t('settings.tzMadrid')}</option>
                  <option value="Europe/Paris">{t('settings.tzParis')}</option>
                  <option value="America/Sao_Paulo">{t('settings.tzSaoPaulo')}</option>
                </select>
              </div>
              <div>
                <label htmlFor="settings-currency" className="text-xs font-medium text-muted-foreground block mb-2">{t('settings.currency')}</label>
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
              {t('settings.save')}
            </button>
          </div>
        </div>
      )}

      {/* Categories */}
      {restaurant && <CategoryManager />}

      {/* Appearance */}
      <div className="card-glass p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-bold text-foreground">{t('settings.appearance')}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{t('settings.appearanceHint')}</p>
          </div>
          {hasUnsavedChanges && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-warning/10 rounded-lg">
              <AlertCircle className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-medium text-amber-400">{t('settings.unsavedChanges')}</span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4 mb-6">
          {(['light', 'dark'] as const).map(theme => {
            const active = pendingTheme === theme;
            const Icon   = theme === 'light' ? Sun : Moon;
            const label  = t(theme === 'light' ? 'settings.themeLight' : 'settings.themeDark');
            return (
              <button
                key={theme}
                onClick={() => onThemeChange(theme)}
                className={`relative p-5 rounded-xl border-2 transition-all text-left ${
                  active ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/30'
                }`}
              >
                <div className="flex items-center gap-2.5 mb-3">
                  <Icon className={`w-4 h-4 ${active ? 'text-primary' : 'text-muted-foreground'}`} />
                  <span className={`text-sm font-semibold ${active ? 'text-primary' : 'text-foreground'}`}>{label}</span>
                </div>
                <div className={`w-full h-14 rounded-lg border flex items-center justify-center ${
                  theme === 'light' ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-700'
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

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-border-subtle">
          <button onClick={onCancelTheme} disabled={!hasUnsavedChanges} className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed">
            {t('settings.cancel')}
          </button>
          <button onClick={onSaveTheme} disabled={!hasUnsavedChanges} className="cta-button py-2 px-5 text-sm disabled:opacity-40 disabled:cursor-not-allowed">
            <Save className="w-4 h-4" /> {t('settings.save')}
          </button>
        </div>
      </div>
    </div>
  );
}
