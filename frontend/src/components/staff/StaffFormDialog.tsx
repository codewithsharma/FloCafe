'use client';

import { Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useI18n } from '@/hooks/useI18n';

export const VALID_ROLES = ['owner', 'manager', 'cashier', 'waiter', 'chef'] as const;

const ROLE_LABEL_KEY: Record<string, string> = {
  owner: 'staff.roleOwner',
  manager: 'staff.roleManager',
  cashier: 'staff.roleCashier',
  waiter: 'staff.roleWaiter',
  chef: 'staff.roleChef',
};

export interface StaffFormState {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
  role: string;
  pin: string;
}

export interface StaffFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: boolean;
  form: StaffFormState;
  onFormChange: (form: StaffFormState) => void;
  onSubmit: (e: React.FormEvent) => void;
  showPassword: boolean;
  onTogglePassword: () => void;
  showPin: boolean;
  onTogglePin: () => void;
  editingLastActiveOwner: boolean;
}

export function StaffFormDialog({
  open,
  onOpenChange,
  editing,
  form,
  onFormChange,
  onSubmit,
  showPassword,
  onTogglePassword,
  showPin,
  onTogglePin,
  editingLastActiveOwner,
}: StaffFormDialogProps) {
  const { t } = useI18n();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-flo-border bg-flo-surface sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-flo-text">
            {editing ? t('staff.modalTitleEdit') : t('staff.modalTitleAdd')}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <input
            type="text"
            placeholder={t('staff.namePlaceholder')}
            value={form.name}
            onChange={(e) => onFormChange({ ...form, name: e.target.value })}
            className="w-full px-3 py-2 min-h-11 border border-flo-border rounded-flo-md outline-none focus:ring-2 focus:ring-flo-brand-500 text-flo-text"
            required
          />
          <input
            type="email"
            placeholder={`${t('auth.email')} (${t('common.optional')})`}
            value={form.email}
            onChange={(e) => onFormChange({ ...form, email: e.target.value })}
            className="w-full px-3 py-2 min-h-11 border border-flo-border rounded-flo-md outline-none focus:ring-2 focus:ring-flo-brand-500 text-flo-text"
          />
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder={editing ? t('staff.newPasswordPlaceholder') : t('staff.passwordPlaceholder')}
              value={form.password}
              onChange={(e) => onFormChange({ ...form, password: e.target.value })}
              className="w-full px-3 py-2 pr-10 min-h-11 border border-flo-border rounded-flo-md outline-none focus:ring-2 focus:ring-flo-brand-500 text-flo-text"
              required={!editing}
            />
            <button
              type="button"
              aria-label="Toggle password visibility"
              title="Toggle password visibility"
              onClick={onTogglePassword}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-flo-text-secondary hover:text-flo-text"
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <input
            type={showPassword ? 'text' : 'password'}
            placeholder={t('auth.confirmPassword')}
            value={form.confirmPassword}
            onChange={(e) => onFormChange({ ...form, confirmPassword: e.target.value })}
            className="w-full px-3 py-2 min-h-11 border border-flo-border rounded-flo-md outline-none focus:ring-2 focus:ring-flo-brand-500 text-flo-text"
            required={!editing || Boolean(form.password)}
          />
          <select
            value={form.role}
            onChange={(e) => {
              const role = e.target.value;
              onFormChange({
                ...form,
                role,
                pin: ['owner', 'manager'].includes(role) ? form.pin : '',
              });
            }}
            className="w-full px-3 py-2 min-h-11 border border-flo-border rounded-flo-md outline-none focus:ring-2 focus:ring-flo-brand-500 text-flo-text bg-flo-surface"
          >
            {VALID_ROLES.map((r) => (
              <option
                key={r}
                value={r}
                disabled={editingLastActiveOwner && r !== 'owner'}
              >
                {ROLE_LABEL_KEY[r] ? t(ROLE_LABEL_KEY[r]) : r}
              </option>
            ))}
          </select>
          {['owner', 'manager'].includes(form.role) && (
            <div>
              <div className="relative">
                <input
                  type={showPin ? 'text' : 'password'}
                  placeholder={editing ? t('staff.pinPlaceholderEdit') : t('staff.pinPlaceholderAdd')}
                  value={form.pin}
                  onChange={(e) =>
                    onFormChange({
                      ...form,
                      pin: e.target.value.replace(/\D/g, '').slice(0, 6),
                    })
                  }
                  className="w-full px-3 py-2 pr-10 min-h-11 border border-flo-border rounded-flo-md outline-none focus:ring-2 focus:ring-flo-brand-500 text-flo-text"
                  maxLength={6}
                  pattern="[0-9]*"
                  inputMode="numeric"
                />
                <button
                  type="button"
                  aria-label="Toggle PIN visibility"
                  title="Toggle PIN visibility"
                  onClick={onTogglePin}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-flo-text-secondary hover:text-flo-text"
                >
                  {showPin ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <p className="text-caption text-flo-text-muted mt-1">{t('staff.pinHint')}</p>
            </div>
          )}
          <Button type="submit" className="w-full min-h-11">
            {editing ? t('staff.updateButton') : t('staff.addButton')}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
