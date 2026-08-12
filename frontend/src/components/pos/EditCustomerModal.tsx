'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAuthStore } from '@/store/auth';
import { useI18n } from '@/hooks/useI18n';
import { dialCodeFor } from '@/lib/phone';
import type { Customer } from '@/lib/types';

interface Props {
  customer: Customer;
  onClose: () => void;
  onSaved: (customer: Customer) => void;
}

export default function EditCustomerModal({ customer, onClose, onSaved }: Props) {
  const { currentTenant } = useAuthStore();
  const { t } = useI18n();
  const dialCode = dialCodeFor(currentTenant?.country ?? 'IN');
  const [name, setName] = useState(customer.name);
  const [phone, setPhone] = useState(customer.phone || '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error(t('pos.nameRequired', { defaultValue: 'Name is required' }));
      return;
    }
    setSaving(true);
    try {
      const { data } = await api.put(`/customers/${customer.id}`, {
        name: name.trim(),
        phone: phone.trim(),
      });
      onSaved(data.customer);
      toast.success(t('pos.customerUpdated', { defaultValue: 'Customer updated' }));
      onClose();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string; message?: string } } };
      toast.error(
        error.response?.data?.error ||
        error.response?.data?.message ||
        t('pos.customerUpdateFailed', { defaultValue: 'Failed to update customer' })
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="border-flo-border bg-flo-surface sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-flo-text">
            {t('pos.editCustomer', { defaultValue: 'Edit Customer' })}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-flo-text-secondary mb-1">
              {t('pos.customerName', { defaultValue: 'Name' })}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 min-h-11 text-sm border border-flo-border rounded-flo-md bg-flo-surface text-flo-text focus:ring-2 focus:ring-flo-brand-500 focus:border-flo-brand-500 outline-none"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-flo-text-secondary mb-1">
              {t('pos.phone')}
            </label>
            <input
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder={dialCode}
              className="w-full px-3 py-2 min-h-11 text-sm border border-flo-border rounded-flo-md bg-flo-surface text-flo-text focus:ring-2 focus:ring-flo-brand-500 focus:border-flo-brand-500 outline-none"
            />
          </div>
        </div>
        <DialogFooter className="gap-2 sm:justify-end">
          <Button variant="outline" onClick={onClose} className="flex-1 min-h-11">
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSave} disabled={saving} className="flex-1 min-h-11 bg-flo-brand-600 hover:bg-flo-brand-700 text-white">
            {saving ? t('pos.loadingEllipsis') : t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
