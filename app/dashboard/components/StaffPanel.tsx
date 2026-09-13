'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Plus, Loader2, Users, Trash2, Shield } from 'lucide-react';
import { useLanguage } from '@/lib/language-context';
import { translateError } from '@/lib/error-messages';
import { updateStaffPermissions, removeStaff } from '../actions';

interface StaffMember {
  id: string;
  permissions?: string[];
  user: { id: string; email: string; name: string | null };
}

interface StaffPanelProps {
  staff:        StaffMember[];
  staffEmail:   string;
  isSubmitting: boolean;
  onEmailChange:(email: string) => void;
  onAddStaff:   (e: React.FormEvent) => void;
  onDataChange?:() => void;
}

// Keys, not words: the labels are read by the owner and this list is module
// scope, where there is no language to read them in.
const PERMISSION_OPTIONS = [
  { value: 'view', labelKey: 'staff.permissionView' },
  { value: 'data_entry', labelKey: 'staff.permissionDataEntry' },
  { value: 'full_access', labelKey: 'staff.permissionFullAccess' },
];

export default function StaffPanel({ staff, staffEmail, isSubmitting, onEmailChange, onAddStaff, onDataChange }: StaffPanelProps) {
  const { t, language } = useLanguage();
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const handlePermissionChange = async (membershipId: string, permission: string) => {
    setUpdatingId(membershipId);
    const result = await updateStaffPermissions(membershipId, [permission]);
    if (result.success) {
      toast.success(t('staff.permissionsUpdated'));
      onDataChange?.();
    } else {
      toast.error(translateError(language, result.error));
    }
    setUpdatingId(null);
  };

  const handleRemove = async (membershipId: string) => {
    if (!confirm(t('staff.confirmRemove'))) return;
    setRemovingId(membershipId);
    const result = await removeStaff(membershipId);
    if (result.success) {
      toast.success(t('staff.removed'));
      onDataChange?.();
    } else {
      toast.error(translateError(language, result.error));
    }
    setRemovingId(null);
  };

  const getPermissionLevel = (member: StaffMember) => {
    const perms = member.permissions || ['view'];
    if (perms.includes('full_access')) return 'full_access';
    if (perms.includes('data_entry')) return 'data_entry';
    return 'view';
  };

  return (
    <div className="max-w-3xl space-y-6">
      {/* Add staff */}
      <div className="card-glass p-6">
        <h2 className="text-lg font-bold text-foreground mb-5">{t('staff.addTitle')}</h2>
        <form onSubmit={onAddStaff} className="flex gap-3">
          <input
            type="email"
            value={staffEmail}
            onChange={e => onEmailChange(e.target.value)}
            className="input-field flex-1"
            placeholder={t('staff.emailPlaceholder')}
            required
          />
          <button type="submit" disabled={isSubmitting} className="cta-button shrink-0">
            {isSubmitting
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <><Plus className="w-4 h-4" />{t('staff.add')}</>
            }
          </button>
        </form>
        <p className="text-xs text-muted-foreground mt-3">{t('owner.notifications.userMustBeRegistered')}</p>
      </div>

      {/* Staff list */}
      <div className="card-glass p-6">
        <h2 className="text-lg font-bold text-foreground mb-5 flex items-center gap-2">
          <Users className="w-5 h-5 text-muted-foreground" />
          {t('staff.teamTitle')}
          <span className="badge badge-muted">{staff.length}</span>
        </h2>

        {staff.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Users className="w-10 h-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">{t('staff.empty')}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {staff.map(member => (
              <div key={member.id} className="flex items-center gap-4 p-4 rounded-xl bg-surface border border-border-subtle hover:bg-muted transition-all">
                <div className="w-9 h-9 rounded-xl gradient-bg flex items-center justify-center shrink-0">
                  <span className="text-white font-bold text-xs">
                    {(member.user.name || member.user.email).charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm text-foreground">{member.user.name || '—'}</div>
                  <div className="text-xs text-muted-foreground truncate">{member.user.email}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="flex items-center gap-1">
                    <Shield className="w-3 h-3 text-muted-foreground" />
                    <select
                      value={getPermissionLevel(member)}
                      onChange={e => handlePermissionChange(member.id, e.target.value)}
                      disabled={updatingId === member.id}
                      className="input-field !py-1 !px-2 !text-xs w-[130px]"
                    >
                      {PERMISSION_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{t(opt.labelKey)}</option>
                      ))}
                    </select>
                  </div>
                  <button
                    onClick={() => handleRemove(member.id)}
                    disabled={removingId === member.id}
                    className="p-1.5 rounded-lg hover:bg-danger/10 text-muted-foreground hover:text-red-400 transition-colors"
                    aria-label={`${t('staff.removeAria')} ${member.user.name || member.user.email}`}
                  >
                    {removingId === member.id
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <Trash2 className="w-3.5 h-3.5" />
                    }
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
