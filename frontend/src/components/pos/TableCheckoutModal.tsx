'use client';

import { useState, useEffect } from 'react';
import { ShoppingCart, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { StatusBadge } from '@/components/flo/StatusBadge';
import TaxBreakdown from '@/components/pos/TaxBreakdown';
import api from '@/lib/api';
import { useI18n } from '@/hooks/useI18n';
import { useTranslation } from 'react-i18next';
import { useFormatCurrency } from '@/hooks/useFormatCurrency';
import toast from 'react-hot-toast';
import type { Table, Order, Bill, OrderItem } from '@/lib/types';
import { SplitCheckModal } from '@/components/pos/SplitCheckModal';

interface Props {
  table: Table;
  currency: string;
  cartItemCount: number;
  onClose: () => void;
  onAddItems: (table: Table, order: Order) => void;
  onPayment: (bill: Bill) => void;
  onAddCartToOrder?: (table: Table, order: Order) => void;
}

export default function TableCheckoutModal({
  table,

  cartItemCount,
  onClose,
  onAddItems,
  onPayment,
  onAddCartToOrder,
}: Props) {
  const { t } = useI18n();
  const { t: tPos } = useTranslation('pos');
  const fmt = useFormatCurrency();
  const formatItemTotal = (value: unknown, fallback: unknown) => {
    const total = Number(value);
    if (Number.isFinite(total)) return fmt(total);
    const subtotal = Number(fallback);
    return fmt(Number.isFinite(subtotal) ? subtotal : 0);
  };
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [addingItems, setAddingItems] = useState(false);
  const [splitChecksEnabled, setSplitChecksEnabled] = useState(false);
  const [splitBill, setSplitBill] = useState<Bill | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const fetchOrder = async () => {
      try {
        const { data } = await api.get(`/tables/${table.id}`, { signal: controller.signal });
        const tbl = data.table;
        const activeOrder = tbl.activeOrder || tbl.current_order;
        if (activeOrder) {
          const orderRes = await api.get(`/orders/${activeOrder.id}`, {
            signal: controller.signal,
          });
          setOrder(orderRes.data.order);
        }
      } catch {
        if (controller.signal.aborted) return;
        toast.error(t('pos.loadOrderFailed'));
      } finally {
        setLoading(false);
      }
    };
    fetchOrder();
    return () => controller.abort();
  }, [table.id, t]);

  useEffect(() => {
    api
      .get('/settings/split_checks_enabled')
      .then((res) => setSplitChecksEnabled(res.data?.setting?.value === 'true'))
      .catch(() => setSplitChecksEnabled(false));
  }, []);

  const handleCheckout = async () => {
    if (!order) return;
    setGenerating(true);
    try {
      if (order.bill) {
        onPayment(order.bill);
        return;
      }
      const { data } = await api.post('/bills/generate', { order_id: order.id });
      onPayment(data.bill);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || t('pos.generateBillFailed'));
    } finally {
      setGenerating(false);
    }
  };

  const handleSplitCheck = async () => {
    if (!order) return;
    setGenerating(true);
    try {
      const bill =
        order.bill || (await api.post('/bills/generate', { order_id: order.id })).data.bill;
      setSplitBill(bill);
    } catch (error: unknown) {
      const message = (error as { response?: { data?: { error?: string } } }).response?.data?.error;
      toast.error(message || t('pos.generateBillFailed'));
    } finally {
      setGenerating(false);
    }
  };

  const handleAddCartToOrder = async () => {
    if (!order || !onAddCartToOrder) return;
    setAddingItems(true);
    try {
      await onAddCartToOrder(table, order);
    } catch (err: unknown) {
      const error = err as {
        response?: { data?: { message?: string; error?: string } };
        message?: string;
      };
      toast.error(
        error.response?.data?.message ||
          error.response?.data?.error ||
          error.message ||
          t('pos.addItemsFailed'),
      );
    } finally {
      setAddingItems(false);
    }
  };

  if (loading) {
    return (
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
      >
        <DialogContent
          className="border-flo-border bg-flo-surface sm:max-w-sm"
          showCloseButton={false}
        >
          <div className="py-8">
            <div className="w-8 h-8 border-4 border-flo-brand-600 border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (!order) {
    return (
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
      >
        <DialogContent className="border-flo-border bg-flo-surface sm:max-w-md">
          <p className="text-flo-text-secondary text-center py-4">{t('pos.noActiveOrder')}</p>
          <Button onClick={onClose} variant="outline" className="w-full min-h-11">
            {t('pos.close')}
          </Button>
        </DialogContent>
      </Dialog>
    );
  }

  const activeItems = (order.items || []).filter((item: OrderItem) => item.status !== 'cancelled');
  const splitBills = (order.bills || []).filter((bill) => Boolean(bill.split_group_id));
  const isPaid = order.bill?.payment_status === 'paid';

  return (
    <>
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
      >
        <DialogContent className="border-flo-border bg-flo-surface sm:max-w-md max-h-[85vh] flex flex-col gap-0 p-0 overflow-hidden">
          <DialogHeader className="p-5 border-b border-flo-border">
            <div className="flex items-center gap-2 pr-6">
              <DialogTitle className="text-flo-text">{table.name}</DialogTitle>
              <StatusBadge variant={isPaid ? 'success' : 'warning'}>
                {isPaid ? t('pos.paid') : t('pos.unpaid')}
              </StatusBadge>
            </div>
            <p className="text-sm text-flo-text-secondary">
              {t('pos.orderNumber', { number: order.order_number })}
            </p>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-5">
            <div className="mb-3">
              <p className="text-xs text-flo-text-muted uppercase tracking-wider mb-2">
                {t('pos.previousItems')}
              </p>
              <div className="space-y-1">
                {activeItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex justify-between items-start py-1.5 px-2 bg-flo-bg rounded-flo-md"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-flo-text font-medium">
                        {item.quantity}x {item.product_name}
                      </p>
                      {item.special_instructions && (
                        <p className="text-xs text-flo-text-muted italic">
                          {item.special_instructions}
                        </p>
                      )}
                    </div>
                    <span className="text-xs text-flo-text-secondary ml-2 font-medium">
                      {formatItemTotal(item.total, item.subtotal)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="p-5 border-t border-flo-border space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-flo-text-secondary">{t('pos.subtotal')}</span>
              <span className="text-flo-text">{fmt(Number(order.subtotal))}</span>
            </div>
            <TaxBreakdown
              taxAmount={Number(order.tax_amount)}
              taxBreakdown={order.tax_breakdown}
              theme="light"
            />
            <div className="flex justify-between text-lg font-bold">
              <span className="text-flo-text">{t('pos.total')}</span>
              <span className="text-flo-brand-600">{fmt(Number(order.total))}</span>
            </div>
            {order.bill &&
              order.bill.payment_status !== 'paid' &&
              Number(order.bill.balance) > 0 && (
                <div className="flex justify-between text-sm font-medium">
                  <span className="text-flo-warning">{t('pos.balanceDue')}</span>
                  <span className="text-flo-warning">{fmt(Number(order.bill.balance))}</span>
                </div>
              )}

            {splitBills.length > 0 && (
              <div className="space-y-2">
                {splitBills.map((bill) => (
                  <div
                    key={bill.id}
                    className="flex items-center justify-between rounded-flo-md border border-flo-border p-2"
                  >
                    <div>
                      <p className="text-sm font-medium text-flo-text">{bill.split_label}</p>
                      <p className="text-xs text-flo-text-secondary">
                        {fmt(Number(bill.total))} · {bill.payment_status}
                      </p>
                    </div>
                    {bill.payment_status !== 'paid' && (
                      <Button
                        size="sm"
                        className="min-h-11 bg-flo-brand-600 hover:bg-flo-brand-700"
                        onClick={() => onPayment(bill)}
                      >
                        {t('pos.pay', { defaultValue: 'Pay' })}
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {splitBills.length === 0 &&
              splitChecksEnabled &&
              order.type === 'dine_in' &&
              order.bill?.payment_status !== 'paid' && (
                <Button
                  variant="outline"
                  onClick={handleSplitCheck}
                  disabled={generating}
                  className="w-full min-h-11"
                >
                  <Users size={15} className="mr-2" />
                  {t('pos.splitCheck', { defaultValue: 'Split check' })}
                </Button>
              )}
            {cartItemCount > 0 ? (
              <div className="space-y-2">
                <Button
                  onClick={handleAddCartToOrder}
                  disabled={addingItems}
                  className="w-full min-h-11 bg-flo-brand-600 hover:bg-flo-brand-700"
                  size="lg"
                >
                  <ShoppingCart size={16} className="mr-2" />
                  {addingItems ? t('pos.adding') : t('pos.addToOrder', { count: cartItemCount })}
                </Button>
                <Button
                  onClick={handleCheckout}
                  variant="outline"
                  className="w-full min-h-11"
                  disabled={generating}
                >
                  {generating ? t('pos.generating') : t('pos.checkoutInstead')}
                </Button>
              </div>
            ) : splitBills.length === 0 ? (
              <div className="grid grid-cols-2 gap-3">
                <Button
                  variant="outline"
                  className="min-h-11"
                  onClick={() => onAddItems(table, order)}
                >
                  {t('pos.addItems')}
                </Button>
                <Button
                  onClick={handleCheckout}
                  disabled={generating}
                  className="min-h-11 bg-flo-brand-600 hover:bg-flo-brand-700"
                >
                  {generating ? t('pos.generating') : tPos('checkout')}
                </Button>
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
      {splitBill && (
        <SplitCheckModal
          bill={splitBill}
          order={order}
          onClose={() => setSplitBill(null)}
          onSplit={(bills) => {
            setOrder({ ...order, bill: bills[0], bills });
            setSplitBill(null);
          }}
        />
      )}
    </>
  );
}
