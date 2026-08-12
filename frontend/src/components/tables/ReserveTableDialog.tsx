'use client';

import { useState, useRef } from 'react';
import { Search, UserPlus } from 'lucide-react';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAuthStore } from '@/store/auth';
import { countryName } from '@/lib/countries';
import { parsePhone, dialCodeFor } from '@/lib/phone';
import { useI18n } from '@/hooks/useI18n';
import type { Customer, Table } from '@/lib/types';

export interface ReserveTableDialogProps {
  table: Table | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}

export function ReserveTableDialog({
  table,
  open,
  onOpenChange,
  onDone,
}: ReserveTableDialogProps) {
  const { currentTenant } = useAuthStore();
  const { t } = useI18n();
  const dialCode = dialCodeFor(currentTenant?.country ?? 'IN') || '+91';
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Customer[]>([]);
  const [selected, setSelected] = useState<Customer | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const resetForm = () => {
    setQuery('');
    setResults([]);
    setSelected(null);
    setShowCreate(false);
    setNewName('');
    setNewPhone('');
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) resetForm();
    onOpenChange(next);
  };

  const searchCustomers = (q: string) => {
    if (q.length < 2) {
      setResults([]);
      return;
    }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const { data } = await api.get(`/customers-search?q=${encodeURIComponent(q)}`);
        setResults(data.customers || []);
      } catch {
        setResults([]);
      }
    }, 300);
  };

  const handleCreateCustomer = async () => {
    if (!newName.trim() || !newPhone.trim()) return;
    const country = currentTenant?.country ?? 'IN';
    const parsed = parsePhone(newPhone, country);
    if (!parsed) {
      toast.error(t('pos.invalidPhone', { country: countryName(country) }));
      return;
    }
    setCreating(true);
    try {
      const { data } = await api.post('/customers', {
        name: newName,
        phone: parsed.e164,
        country_code: parsed.countryCode,
      });
      setSelected(data.customer);
      setShowCreate(false);
      setQuery('');
      setResults([]);
      toast.success(t('pos.customerCreated'));
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e.response?.data?.message || t('pos.createCustomerFailed'));
    } finally {
      setCreating(false);
    }
  };

  const handleReserve = async () => {
    if (!table) return;
    setSaving(true);
    try {
      await api.patch(`/tables/${table.id}/status`, {
        status: 'reserved',
        reservation_customer_id: selected?.id ?? null,
        reservation_customer_name: selected?.name ?? null,
        reservation_customer_phone: selected?.phone ?? null,
      });
      const msg = selected
        ? t('tables.reservedFor', { name: table.name, customer: selected.name })
        : t('tables.reservedNoCustomer', { name: table.name });
      toast.success(msg);
      resetForm();
      onDone();
      onOpenChange(false);
    } catch {
      toast.error(t('tables.tableReserveFailed'));
    } finally {
      setSaving(false);
    }
  };

  if (!table) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="border-flo-border bg-flo-surface sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-flo-text">
            {t('nav.tables')} · {table.name}
          </DialogTitle>
        </DialogHeader>

        {selected ? (
          <div className="flex items-center justify-between px-3 py-2.5 bg-flo-brand-50 rounded-flo-lg mb-2">
            <div>
              <p className="font-semibold text-flo-brand-700 text-small">{selected.name}</p>
              <p className="text-caption text-flo-brand-600/80">{selected.phone}</p>
            </div>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="text-flo-brand-600 hover:text-flo-brand-700 text-caption min-h-11 px-2"
            >
              {t('tables.cancel')}
            </button>
          </div>
        ) : (
          <div className="mb-2">
            <p className="text-small text-flo-text-secondary mb-2">{t('tables.linkCustomer')}</p>
            <div className="relative mb-2">
              <Search
                size={14}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-flo-text-muted"
                aria-hidden
              />
              <input
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  searchCustomers(e.target.value);
                }}
                placeholder={t('tables.searchCustomerPlaceholder')}
                className="w-full pl-8 pr-3 py-2 text-small border border-flo-border rounded-flo-md bg-flo-surface focus:ring-2 focus:ring-flo-brand-500 outline-none min-h-11"
              />
            </div>
            {results.length > 0 && (
              <div className="border border-flo-border rounded-flo-md overflow-hidden mb-2 max-h-36 overflow-y-auto">
                {results.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setSelected(c);
                      setQuery('');
                      setResults([]);
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-flo-bg text-small border-b border-flo-border last:border-0 min-h-11"
                  >
                    <span className="font-medium text-flo-text">{c.name}</span>
                    <span className="text-flo-text-muted ml-2 text-caption">{c.phone}</span>
                  </button>
                ))}
              </div>
            )}
            {!showCreate ? (
              <button
                type="button"
                onClick={() => {
                  setShowCreate(true);
                  if (/^\d+$/.test(query.trim())) setNewPhone(query.trim());
                }}
                className="flex items-center gap-1.5 text-small text-flo-brand-600 font-medium hover:text-flo-brand-700 min-h-11"
              >
                <UserPlus size={14} aria-hidden />
                {t('tables.newCustomer')}
              </button>
            ) : (
              <div className="space-y-2 border border-flo-border rounded-flo-lg p-3">
                <input
                  type="text"
                  placeholder={t('products.nameLabel')}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full px-3 py-1.5 text-small border border-flo-border rounded-flo-md outline-none focus:ring-1 focus:ring-flo-brand-500 min-h-11"
                />
                <input
                  type="tel"
                  inputMode="numeric"
                  placeholder={`${dialCode} ${t('settings.phone')}`}
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  className="w-full px-3 py-1.5 text-small border border-flo-border rounded-flo-md outline-none focus:ring-1 focus:ring-flo-brand-500 min-h-11"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowCreate(false)}
                    className="flex-1 py-1.5 text-small border border-flo-border rounded-flo-md hover:bg-flo-bg min-h-11"
                  >
                    {t('tables.cancel')}
                  </button>
                  <button
                    type="button"
                    onClick={handleCreateCustomer}
                    disabled={creating || !newName.trim() || !newPhone.trim()}
                    className="flex-1 py-1.5 text-small bg-flo-brand-600 text-white rounded-flo-md hover:bg-flo-brand-700 disabled:opacity-50 min-h-11"
                  >
                    {creating ? t('tables.creating') : t('tables.create')}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => handleOpenChange(false)} className="flex-1 min-h-11">
            {t('tables.cancel')}
          </Button>
          <Button onClick={handleReserve} disabled={saving} className="flex-1 min-h-11">
            {saving ? t('tables.reserving') : t('tables.reserveTable')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
