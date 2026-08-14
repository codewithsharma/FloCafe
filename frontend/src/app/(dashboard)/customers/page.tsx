'use client';

import { useState, useEffect } from 'react';
import { Plus, AlertCircle, X } from 'lucide-react';
import { useSearchParams, useRouter } from 'next/navigation';
import api from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { Button } from '@/components/ui/button';
import toast from 'react-hot-toast';
import type { Customer } from '@/lib/types';
import { countryName } from '@/lib/countries';
import { dialCodeFor, parsePhone } from '@/lib/phone';
import { useI18n } from '@/hooks/useI18n';
import { PageHeader, LoadingState, StatusBadge } from '@/components/flo';
import {
  CustomersTable,
  CustomerFormDialog,
  CustomerLedgerDialog,
  type CustomerFormState,
  type LedgerData,
} from '@/components/customers';

export default function CustomersPage() {
  const { currentTenant } = useAuthStore();
  const { t } = useI18n();
  const defaultCountry = currentTenant?.country || 'IN';
  const dialCode = dialCodeFor(defaultCountry) || '+91';
  const searchParams = useSearchParams();
  const router = useRouter();
  const filter = searchParams.get('filter');
  const role = currentTenant?.role;
  const canShowInactive = role === 'owner' || role === 'manager';

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [reactivatingId, setReactivatingId] = useState<string | number | null>(null);
  const [sortField, setSortField] = useState('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [showForm, setShowForm] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [form, setForm] = useState<CustomerFormState>({
    name: '',
    phone: '',
    email: '',
    country_code: dialCode,
  });

  const [ledgerCustomer, setLedgerCustomer] = useState<Customer | null>(null);
  const [ledgerData, setLedgerData] = useState<LedgerData | null>(null);
  const [ledgerLoading, setLedgerLoading] = useState(false);

  const openLedger = async (c: Customer) => {
    setLedgerCustomer(c);
    setLedgerData(null);
    setLedgerLoading(true);
    try {
      const { data } = await api.get(`/customers/${c.id}/wallet`);
      setLedgerData(data);
    } catch {
      toast.error(t('customer.ledgerLoadFailed'));
    } finally {
      setLedgerLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      const params: Record<string, string> = {};
      if (search) params.search = search;
      if (filter) params.filter = filter;
      if (sortField) params.sort = sortField;
      if (sortOrder) params.order = sortOrder;
      if (canShowInactive && showInactive) params.include_inactive = 'true';
      api
        .get('/customers', { params, signal: controller.signal })
        .then(({ data }) => setCustomers(data.data || []))
        .catch((err: unknown) => {
          if (!(
            err instanceof Error &&
            (err.name === 'CanceledError' || err.name === 'AbortError')
          )) {
            toast.error(t('customer.loadFailed'));
          }
        })
        .finally(() => {
          setLoading(false);
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, filter, sortField, sortOrder, refreshKey, showInactive, canShowInactive]);

  const openAdd = () => {
    setEditingCustomer(null);
    setForm({ name: '', phone: '', email: '', country_code: dialCode });
    setShowForm(true);
  };

  const openEdit = (c: Customer) => {
    setEditingCustomer(c);
    setForm({
      name: c.name,
      phone: c.phone || '',
      email: c.email || '',
      country_code: c.country_code || dialCode,
    });
    setShowForm(true);
  };

  const handleReactivate = async (c: Customer) => {
    setReactivatingId(c.id);
    try {
      await api.post(`/customers/${c.id}/reactivate`);
      toast.success(t('customer.reactivated'));
      setRefreshKey((k) => k + 1);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string; message?: string } } };
      toast.error(
        error.response?.data?.error ||
          error.response?.data?.message ||
          t('customer.reactivateFailed'),
      );
    } finally {
      setReactivatingId(null);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parsePhone(form.phone, defaultCountry);
    if (!parsed) {
      toast.error(t('pos.invalidPhone', { country: countryName(defaultCountry) }));
      return;
    }
    const payload = { ...form, phone: parsed.e164, country_code: parsed.countryCode };
    try {
      if (editingCustomer) {
        await api.put(`/customers/${editingCustomer.id}`, payload);
        toast.success(t('customer.updated'));
      } else {
        await api.post('/customers', payload);
        toast.success(t('customer.added'));
      }
      setShowForm(false);
      setRefreshKey((k) => k + 1);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      toast.error(error.response?.data?.error || t('customer.saveFailed'));
    }
  };

  const onSort = (field: string) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder(field === 'name' ? 'asc' : 'desc');
    }
  };

  return (
    <div>
      <PageHeader
        title={
          <span className="inline-flex flex-wrap items-center gap-3">
            {t('nav.customers')}
            {filter === 'invalid_phones' ? (
              <StatusBadge
                variant="danger"
                className="inline-flex items-center gap-1.5 normal-case tracking-normal"
              >
                <AlertCircle size={14} />
                Action Required
                <button
                  type="button"
                  onClick={() => router.push('/customers')}
                  className="ml-1 text-flo-danger hover:opacity-80"
                  aria-label={t('flo.a11y.clearFilter')}
                >
                  <X size={12} />
                </button>
              </StatusBadge>
            ) : null}
          </span>
        }
        actions={
          <Button onClick={openAdd} className="min-h-11">
            <Plus size={16} className="mr-1" /> {t('customer.add')}
          </Button>
        }
      />

      {loading ? (
        <LoadingState />
      ) : (
        <CustomersTable
          customers={customers}
          search={search}
          onSearchChange={setSearch}
          sortField={sortField}
          sortOrder={sortOrder}
          onSort={onSort}
          onEdit={openEdit}
          onOpenLedger={openLedger}
          onAdd={openAdd}
          canShowInactive={canShowInactive}
          showInactive={showInactive}
          onShowInactiveChange={setShowInactive}
          onReactivate={handleReactivate}
          reactivatingId={reactivatingId}
        />
      )}

      <CustomerLedgerDialog
        customer={ledgerCustomer}
        open={Boolean(ledgerCustomer)}
        onOpenChange={(open) => {
          if (!open) setLedgerCustomer(null);
        }}
        loading={ledgerLoading}
        data={ledgerData}
      />

      <CustomerFormDialog
        open={showForm}
        onOpenChange={setShowForm}
        editing={Boolean(editingCustomer)}
        form={form}
        onFormChange={setForm}
        onSubmit={handleSave}
        dialCode={dialCode}
      />
    </div>
  );
}
