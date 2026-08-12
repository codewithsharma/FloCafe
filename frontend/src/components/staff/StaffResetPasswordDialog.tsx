'use client';

import { Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { Staff } from '@/lib/types';
import { useI18n } from '@/hooks/useI18n';

export interface StaffResetPasswordDialogProps {
  staff: Staff | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  newPassword: string;
  confirmNewPassword: string;
  onNewPasswordChange: (value: string) => void;
  onConfirmNewPasswordChange: (value: string) => void;
  showPassword: boolean;
  onTogglePassword: () => void;
  onSubmit: () => void;
}

export function StaffResetPasswordDialog({
  staff,
  open,
  onOpenChange,
  newPassword,
  confirmNewPassword,
  onNewPasswordChange,
  onConfirmNewPasswordChange,
  showPassword,
  onTogglePassword,
  onSubmit,
}: StaffResetPasswordDialogProps) {
  const { t } = useI18n();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-flo-border bg-flo-surface sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-flo-text">{t('staff.resetPasswordTitle')}</DialogTitle>
        </DialogHeader>
        {staff ? (
          <p className="text-small text-flo-text-secondary mb-4">
            {t('staff.resetPasswordBody', { name: staff.name })}
          </p>
        ) : null}
        <div className="space-y-4">
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder={t('staff.newPasswordPlaceholder')}
              value={newPassword}
              onChange={(e) => onNewPasswordChange(e.target.value)}
              className="w-full px-3 py-2 pr-10 min-h-11 border border-flo-border rounded-flo-md outline-none focus:ring-2 focus:ring-flo-brand-500 text-flo-text"
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
            value={confirmNewPassword}
            onChange={(e) => onConfirmNewPasswordChange(e.target.value)}
            className="w-full px-3 py-2 min-h-11 border border-flo-border rounded-flo-md outline-none focus:ring-2 focus:ring-flo-brand-500 text-flo-text"
          />
          <Button onClick={onSubmit} className="w-full min-h-11">
            {t('staff.resetPasswordTitle')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
