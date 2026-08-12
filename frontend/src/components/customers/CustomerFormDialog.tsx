'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useI18n } from '@/hooks/useI18n';

export interface CustomerFormState {
  name: string;
  phone: string;
  email: string;
  country_code: string;
}

export interface CustomerFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: boolean;
  form: CustomerFormState;
  onFormChange: (form: CustomerFormState) => void;
  onSubmit: (e: React.FormEvent) => void;
  dialCode: string;
}

export function CustomerFormDialog({
  open,
  onOpenChange,
  editing,
  form,
  onFormChange,
  onSubmit,
  dialCode,
}: CustomerFormDialogProps) {
  const { t } = useI18n();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-flo-border bg-flo-surface sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-flo-text">
            {editing ? t('customer.edit') : t('customer.add')}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <input
            type="text"
            placeholder={t('customer.name')}
            value={form.name}
            onChange={(e) => onFormChange({ ...form, name: e.target.value })}
            className="w-full px-3 py-2 min-h-11 border border-flo-border rounded-flo-md outline-none focus:ring-2 focus:ring-flo-brand-500 text-flo-text"
            required
          />
          <div className="flex items-stretch gap-2">
            <input
              type="tel"
              placeholder={dialCode ? `${dialCode} ${t('customer.phone')}` : t('customer.phone')}
              value={form.phone}
              onChange={(e) => onFormChange({ ...form, phone: e.target.value })}
              className="flex-1 px-3 py-2 min-h-11 border border-flo-border rounded-flo-md outline-none focus:ring-2 focus:ring-flo-brand-500 text-flo-text"
              required
            />
          </div>
          <input
            type="email"
            placeholder={`${t('customer.email')} (${t('common.optional')})`}
            value={form.email}
            onChange={(e) => onFormChange({ ...form, email: e.target.value })}
            className="w-full px-3 py-2 min-h-11 border border-flo-border rounded-flo-md outline-none focus:ring-2 focus:ring-flo-brand-500 text-flo-text"
          />
          <Button type="submit" className="w-full min-h-11">
            {editing ? t('customer.update') : t('customer.add')}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
