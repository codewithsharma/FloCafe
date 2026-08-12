'use client';

import { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import toast from 'react-hot-toast';
import type { Table, Order } from '@/lib/types';
import { useI18n } from '@/hooks/useI18n';
import { PageHeader, LoadingState, EmptyState } from '@/components/flo';
import { buildOrdersByTable } from '@/lib/tables-orders';
import {
  TablesGrid,
  ReserveTableDialog,
  AddTableDialog,
  type AddTableFormState,
} from '@/components/tables';

const DEFAULT_FORM: AddTableFormState = {
  name: '',
  capacity: '4',
  floor: 'Ground',
  section: '',
};

export default function TablesPage() {
  const { t } = useI18n();
  const [tables, setTables] = useState<Table[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [reservingTable, setReservingTable] = useState<Table | null>(null);
  const [form, setForm] = useState<AddTableFormState>(DEFAULT_FORM);
  const [showDetails, setShowDetails] = useState(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('tables_showDetails');
      return stored !== null ? stored === 'true' : true;
    }
    return true;
  });

  const toggleDetails = () => {
    const next = !showDetails;
    setShowDetails(next);
    localStorage.setItem('tables_showDetails', String(next));
  };

  const fetchTables = async () => {
    try {
      const { data } = await api.get('/tables');
      setTables(data.tables || []);
    } catch {
      toast.error(t('tables.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const load = () => {
      api.get('/tables')
        .then(({ data }) => setTables(data.tables || []))
        .catch(() => toast.error(t('tables.loadFailed')))
        .finally(() => setLoading(false));
    };
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [syncedShowDetails, setSyncedShowDetails] = useState(showDetails);
  if (showDetails !== syncedShowDetails) {
    setSyncedShowDetails(showDetails);
    if (!showDetails) setOrders([]);
  }

  useEffect(() => {
    if (!showDetails) return;
    const fetchOrders = () => {
      api.get('/orders', { params: { status: 'pending,preparing,ready,served', per_page: 500 } })
        .then(({ data }) => setOrders(data.orders || []))
        .catch(() => {
          // silently fail — tables still show
        });
    };
    fetchOrders();
    const interval = setInterval(fetchOrders, 10000);
    return () => clearInterval(interval);
  }, [showDetails]);

  const ordersByTable = showDetails ? buildOrdersByTable(orders) : new Map<string, Order[]>();

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/tables', { ...form, capacity: Number(form.capacity) });
      toast.success(t('tables.tableCreated'));
      setShowForm(false);
      setForm(DEFAULT_FORM);
      fetchTables();
    } catch {
      toast.error(t('tables.tableCreateFailed'));
    }
  };

  const updateStatus = async (id: string, status: string) => {
    try {
      await api.patch(`/tables/${id}/status`, { status });
      fetchTables();
    } catch {
      toast.error(t('tables.tableUpdateFailed'));
    }
  };

  const toggleActive = async (table: Table) => {
    try {
      await api.post(`/tables/${table.id}/${table.is_active ? 'deactivate' : 'reactivate'}`);
      fetchTables();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      toast.error(e.response?.data?.error || t('tables.updateStatusFailed'));
    }
  };

  if (loading) {
    return <LoadingState label={t('tables.title')} className="min-h-[16rem]" />;
  }

  return (
    <div>
      <PageHeader
        title={t('tables.title')}
        actions={
          <>
            <label className="flex items-center gap-2 text-small text-flo-text-secondary cursor-pointer select-none min-h-11 px-2">
              <input
                type="checkbox"
                checked={showDetails}
                onChange={toggleDetails}
                className="size-4 rounded border-flo-border text-flo-brand-600 focus:ring-flo-brand-500"
              />
              {t('tables.showOrderDetails')}
            </label>
            <Button onClick={() => setShowForm(true)} className="min-h-11">
              <Plus size={16} className="mr-1" aria-hidden />
              {t('tables.addTable')}
            </Button>
          </>
        }
      />

      {tables.length === 0 ? (
        <EmptyState
          title={t('tables.noTablesYet')}
          action={
            <Button onClick={() => setShowForm(true)} className="min-h-11">
              <Plus size={16} className="mr-1" aria-hidden />
              {t('tables.addTable')}
            </Button>
          }
        />
      ) : (
        <TablesGrid
          tables={tables}
          ordersByTable={ordersByTable}
          showDetails={showDetails}
          onMarkAvailable={(id) => updateStatus(id, 'available')}
          onReserve={setReservingTable}
          onToggleActive={toggleActive}
        />
      )}

      <ReserveTableDialog
        table={reservingTable}
        open={reservingTable !== null}
        onOpenChange={(open) => {
          if (!open) setReservingTable(null);
        }}
        onDone={fetchTables}
      />

      <AddTableDialog
        open={showForm}
        onOpenChange={setShowForm}
        form={form}
        onFormChange={setForm}
        onSubmit={handleCreate}
      />
    </div>
  );
}
