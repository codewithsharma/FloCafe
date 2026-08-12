'use client';

import {
  CreditCard,
  Trash2,
  RotateCcw,
  Clock,
  MessageCircle,
  Printer,
  XCircle,
  Lock,
  Plus,
  ChevronDown,
  ChevronRight,
  UserPlus,
  User,
  ShoppingBag,
  Send,
  Loader2,
  Ban,
  Undo2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Panel } from '@/components/flo/Panel';
import { StatusBadge } from '@/components/flo/StatusBadge';
import { MoneyDisplay } from '@/components/flo/MoneyDisplay';
import { itemStatusVariant, orderStatusVariant, type StatusBadgeVariant } from '@/lib/flo-display';
import { ORDER_STATUS_LABEL_KEYS, ITEM_STATUS_LABEL_KEYS } from '@/lib/i18n-enums';
import { ORDER_TYPE_LABEL_KEYS } from '@/lib/order-types';
import type { Customer, Order, OrderItem } from '@/lib/types';
import { useI18n } from '@/hooks/useI18n';
import { useFormatCurrency } from '@/hooks/useFormatCurrency';
import { cn } from '@/lib/utils';

export type PaymentStatus = 'paid' | 'partial' | 'unpaid' | 'partially_refunded' | 'refunded';

export interface PrintHistoryEntry {
  id: number;
  print_type: string;
  user_name: string;
  printed_at: string;
}

export interface OrderCardProps {
  order: Order;
  timeSince: string;
  isPaid: boolean;
  paymentStatus: PaymentStatus | null;
  showCheckout: boolean;
  isOwnerOrManager: boolean;
  isWhatsAppReady: boolean;
  generatingBill: boolean;
  convertingOrder: boolean;
  cancellingOrder: boolean;
  printingBill: boolean;
  sendingWa: boolean;
  linkingCustomer: boolean;
  linkCustomerOpen: boolean;
  linkCustomerSearch: string;
  linkCustomerResults: Customer[];
  printHistory: PrintHistoryEntry[];
  printHistoryExpanded: boolean;
  formatDateTime: (iso: string) => string;
  onCheckout: () => void;
  onAddItems: () => void;
  onConvertToTakeaway: () => void;
  onCancel: () => void;
  onPrint: () => void;
  onWhatsApp: () => void;
  onNewOrderForCustomer: () => void;
  onOpenLinkCustomer: () => void;
  onCloseLinkCustomer: () => void;
  onLinkCustomerSearch: (query: string) => void;
  onLinkCustomer: (customerId: string) => void;
  onDeleteItem: (itemId: number) => void;
  onVoidItem: (itemId: number, productName: string) => void;
  onRestoreItem: (itemId: number) => void;
  onTogglePrintHistory: () => void;
  canRefund?: boolean;
  onRefund?: () => void;
  refunding?: boolean;
}

function paymentStatusVariant(status: PaymentStatus): StatusBadgeVariant {
  switch (status) {
    case 'paid':
      return 'success';
    case 'partial':
    case 'partially_refunded':
      return 'warning';
    case 'refunded':
      return 'secondary';
    case 'unpaid':
    default:
      return 'danger';
  }
}

const PAYMENT_LABEL_KEYS: Record<PaymentStatus, string> = {
  paid: 'orders.paid',
  partial: 'orders.partiallyPaid',
  unpaid: 'orders.unpaidBadge',
  partially_refunded: 'orders.partiallyRefunded',
  refunded: 'orders.refunded',
};

function toCents(major: number): number {
  return Math.round(major * 100);
}

export function OrderCard({
  order,
  timeSince,
  isPaid,
  paymentStatus,
  showCheckout,
  isOwnerOrManager,
  isWhatsAppReady,
  generatingBill,
  convertingOrder,
  cancellingOrder,
  printingBill,
  sendingWa,
  linkingCustomer,
  linkCustomerOpen,
  linkCustomerSearch,
  linkCustomerResults,
  printHistory,
  printHistoryExpanded,
  formatDateTime,
  onCheckout,
  onAddItems,
  onConvertToTakeaway,
  onCancel,
  onPrint,
  onWhatsApp,
  onNewOrderForCustomer,
  onOpenLinkCustomer,
  onCloseLinkCustomer,
  onLinkCustomerSearch,
  onLinkCustomer,
  onDeleteItem,
  onVoidItem,
  onRestoreItem,
  onTogglePrintHistory,
  canRefund = false,
  onRefund,
  refunding = false,
}: OrderCardProps) {
  const { t } = useI18n();
  const fmt = useFormatCurrency();

  const activeItems = (order.items || []).filter((i: OrderItem) => i.status !== 'cancelled');
  const cancelledItems = (order.items || []).filter((i: OrderItem) => i.status === 'cancelled');
  const bill = order.bill;
  const discount = bill ? Number(bill.discount_amount) : Number(order.discount_amount);
  const tax = bill ? Number(bill.tax_amount) : Number(order.tax_amount);
  const subtotal = bill ? Number(bill.subtotal) : Number(order.subtotal);
  const total = bill ? Number(bill.total) : Number(order.total);

  return (
    <Panel
      className={cn(
        'p-0 overflow-hidden flex flex-col border-l-4',
        order.status === 'cancelled'
          ? 'border-l-flo-danger opacity-75'
          : 'border-l-flo-brand-500',
      )}
    >
      <div className="flex items-center justify-between gap-2 px-4 py-3 bg-flo-bg border-b border-flo-border">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <span className="font-bold text-flo-text">#{order.order_number}</span>
          <StatusBadge variant={orderStatusVariant(order.status)} dot>
            {t(ORDER_STATUS_LABEL_KEYS[order.status] ?? order.status)}
          </StatusBadge>
          <span className="text-small text-flo-text-secondary capitalize">
            {t(ORDER_TYPE_LABEL_KEYS[order.type] ?? order.type)}
          </span>
          {order.table ? (
            <span className="text-small text-flo-warning font-medium">{order.table.name}</span>
          ) : null}
          <span className="flex items-center gap-1 text-caption text-flo-text-muted">
            <Clock size={12} aria-hidden />
            {timeSince}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {paymentStatus ? (
            <StatusBadge variant={paymentStatusVariant(paymentStatus)}>
              {t(PAYMENT_LABEL_KEYS[paymentStatus])}
            </StatusBadge>
          ) : null}
          {isPaid && order.customer?.phone ? (
            <button
              type="button"
              onClick={onWhatsApp}
              disabled={sendingWa}
              className="p-1.5 rounded-flo-md bg-flo-success hover:opacity-90 text-white transition-colors disabled:opacity-70 min-h-11 min-w-11 inline-flex items-center justify-center"
              title={isWhatsAppReady ? 'Send via Flo' : t('common.shareViaWhatsApp')}
            >
              {sendingWa ? (
                <Loader2 className="size-4 animate-spin" />
              ) : isWhatsAppReady ? (
                <Send size={14} />
              ) : (
                <MessageCircle size={14} />
              )}
            </button>
          ) : null}
          {canRefund && onRefund ? (
            <button
              type="button"
              onClick={onRefund}
              disabled={refunding}
              className="p-1.5 rounded-flo-md border border-flo-border text-flo-text-secondary hover:bg-flo-bg disabled:opacity-50 transition-colors min-h-11 min-w-11 inline-flex items-center justify-center"
              title={t('orders.refund')}
            >
              {refunding ? <Loader2 className="size-4 animate-spin" /> : <Undo2 size={14} />}
            </button>
          ) : null}
          {order.bill ? (
            <button
              type="button"
              onClick={onPrint}
              disabled={printingBill}
              className="p-1.5 rounded-flo-md border border-flo-border text-flo-text-secondary hover:bg-flo-bg disabled:opacity-50 transition-colors min-h-11 min-w-11 inline-flex items-center justify-center"
              title={printHistory.length > 0 ? t('common.reprint') : t('common.print')}
            >
              <Printer size={14} />
            </button>
          ) : null}
        </div>
      </div>

      {order.special_instructions ? (
        <div className="px-4 py-2 bg-flo-warning-subtle border-b border-flo-border">
          <p className="text-small text-flo-warning font-medium break-words">
            {order.special_instructions}
          </p>
        </div>
      ) : null}

      {order.customer ? (
        <div className="px-4 py-2 bg-flo-info-subtle/50 border-b border-flo-border flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <User size={14} className="text-flo-info shrink-0" aria-hidden />
            <span className="text-small font-medium text-flo-text truncate">{order.customer.name}</span>
            {order.customer.phone ? (
              <span className="text-caption text-flo-info shrink-0">{order.customer.phone}</span>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onNewOrderForCustomer}
            className="flex items-center gap-1 text-caption font-semibold text-flo-info hover:opacity-90 bg-flo-info-subtle px-2.5 py-1 rounded-flo-md transition-colors shrink-0 min-h-11"
            title={t('orders.startNewOrderForCustomer')}
          >
            <Plus size={12} aria-hidden /> {t('orders.newOrder')}
          </button>
        </div>
      ) : isOwnerOrManager && !['completed', 'cancelled'].includes(order.status) ? (
        <div className="px-4 py-2 bg-flo-bg border-b border-flo-border">
          {linkCustomerOpen ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={linkCustomerSearch}
                onChange={(e) => onLinkCustomerSearch(e.target.value)}
                placeholder={t('orders.searchCustomer')}
                className="flex-1 min-h-11 px-3 py-1.5 text-small border border-flo-border rounded-flo-md focus:ring-2 focus:ring-flo-brand-500/30 focus:border-flo-brand-500 outline-none bg-flo-surface"
                autoFocus
              />
              <button
                type="button"
                onClick={onCloseLinkCustomer}
                className="text-flo-text-muted hover:text-flo-text min-h-11 min-w-11 inline-flex items-center justify-center"
              >
                <XCircle size={16} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onOpenLinkCustomer}
              className="flex items-center gap-1.5 text-small text-flo-text-muted hover:text-flo-brand-600 transition-colors min-h-11"
            >
              <UserPlus size={14} aria-hidden />
              {t('orders.linkCustomer')}
            </button>
          )}
          {linkCustomerOpen && linkCustomerResults.length > 0 ? (
            <div className="mt-2 space-y-1">
              {linkCustomerResults.map((customer) => (
                <button
                  key={customer.id}
                  type="button"
                  onClick={() => onLinkCustomer(String(customer.id))}
                  disabled={linkingCustomer}
                  className="w-full flex items-center justify-between px-3 py-2 bg-flo-surface rounded-flo-md border border-flo-border hover:border-flo-brand-500 hover:bg-flo-brand-50 transition-colors text-left disabled:opacity-50 min-h-11"
                >
                  <div>
                    <span className="text-small font-medium text-flo-text">{customer.name}</span>
                    {customer.phone ? (
                      <span className="text-caption text-flo-text-muted ml-2">{customer.phone}</span>
                    ) : null}
                  </div>
                  {linkingCustomer ? (
                    <span className="text-caption text-flo-text-muted">{t('orders.linking')}</span>
                  ) : null}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="px-4 py-3 flex-1">
        <div className="divide-y divide-flo-border/60">
          {activeItems.map((item: OrderItem) => (
            <div key={item.id} className="py-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <StatusBadge
                    variant={itemStatusVariant(item.status)}
                    dot
                    className="h-5 px-1.5 shrink-0"
                    title={t(ITEM_STATUS_LABEL_KEYS[item.status] ?? item.status)}
                  >
                    {item.quantity}x
                  </StatusBadge>
                  <span className="text-small text-flo-text truncate">{item.product_name}</span>
                  {item.special_instructions ? (
                    <span className="text-caption text-flo-danger italic break-words">
                      &quot;{item.special_instructions}&quot;
                    </span>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-small text-flo-text-secondary tabular-nums">
                    {fmt(Number(item.total))}
                  </span>
                  {item.status === 'pending' && isOwnerOrManager && !isPaid ? (
                    <button
                      type="button"
                      onClick={() => onDeleteItem(item.id)}
                      className="p-1 rounded-flo-md hover:bg-flo-danger-subtle text-flo-danger transition-colors min-h-11 min-w-11 inline-flex items-center justify-center"
                      title={t('common.removeItem')}
                    >
                      <Trash2 size={14} />
                    </button>
                  ) : null}
                  {(item.status === 'preparing' || item.status === 'ready') &&
                  isOwnerOrManager &&
                  !isPaid ? (
                    <button
                      type="button"
                      onClick={() => onVoidItem(item.id, item.product_name)}
                      className="p-1 rounded-flo-md hover:bg-flo-danger-subtle text-flo-danger transition-colors min-h-11 min-w-11 inline-flex items-center justify-center"
                      title={t('orders.voidItem')}
                    >
                      <Ban size={14} />
                    </button>
                  ) : null}
                </div>
              </div>
              {item.addons && item.addons.length > 0 ? (
                <div className="pl-4 mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                  {item.addons.map((addon, idx) => (
                    <span key={addon.id ?? `${item.id}-${idx}`} className="text-caption text-flo-text-muted">
                      + {addon.name}
                      {(addon.quantity || 1) > 1 ? ` ×${addon.quantity}` : ''}
                      {addon.price
                        ? ` (${fmt(Number(addon.price) * (addon.quantity || 1))})`
                        : ''}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>

        <div className="mt-3 pt-3 border-t border-dashed border-flo-border space-y-1">
          <div className="flex justify-between text-small">
            <span className="text-flo-text-muted">{t('common.subtotal')}</span>
            <span className="text-flo-text tabular-nums">{fmt(subtotal)}</span>
          </div>
          {discount > 0 ? (
            <div className="flex justify-between text-small">
              <span className="text-flo-brand-600">{t('common.discount')}</span>
              <span className="text-flo-brand-600 tabular-nums">-{fmt(discount)}</span>
            </div>
          ) : null}
          {tax > 0 ? (
            <div className="flex justify-between text-small">
              <span className="text-flo-text-muted">{t('common.tax')}</span>
              <span className="text-flo-text tabular-nums">{fmt(tax)}</span>
            </div>
          ) : null}
          <div className="flex justify-between text-body font-bold pt-1 border-t border-flo-border">
            <span className="text-flo-text">{t('common.total')}</span>
            <MoneyDisplay cents={toCents(total)} size="md" />
          </div>
          {bill && paymentStatus === 'partial' ? (
            <div className="flex justify-between text-caption text-flo-text-muted pt-0.5">
              <span>
                {t('orders.paid')} {fmt(Number(bill.paid_amount))}
              </span>
              <span>
                {t('orders.balance')} {fmt(Number(bill.balance))}
              </span>
            </div>
          ) : null}
        </div>

        {cancelledItems.length > 0 && isOwnerOrManager ? (
          <div className="mt-2 pt-2 border-t border-flo-border/60">
            {cancelledItems.map((item: OrderItem) => (
              <div key={item.id} className="flex items-center justify-between py-1 opacity-50">
                <div className="flex items-center gap-2">
                  <StatusBadge variant="danger" className="h-5 px-1.5">
                    {t('orders.itemStatusCancelled')}
                  </StatusBadge>
                  <span className="text-caption text-flo-text-muted line-through">
                    {item.quantity}x {item.product_name}
                  </span>
                </div>
                {!isPaid && order.status !== 'completed' && order.status !== 'cancelled' ? (
                  <button
                    type="button"
                    onClick={() => onRestoreItem(item.id)}
                    className="p-1 rounded-flo-md hover:bg-flo-success-subtle text-flo-success min-h-11 min-w-11 inline-flex items-center justify-center"
                    title={t('common.restore')}
                  >
                    <RotateCcw size={12} />
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

        {order.bill && printHistory.length > 0 ? (
          <div className="mt-3 pt-3 border-t border-flo-border">
            <button
              type="button"
              onClick={onTogglePrintHistory}
              className="flex items-center gap-1 text-small text-flo-text-muted hover:text-flo-text min-h-11"
            >
              {printHistoryExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              {t('orders.printHistory')}
            </button>

            {printHistoryExpanded ? (
              <div className="mt-2 pl-4 space-y-1">
                {printHistory.map((print, index) => (
                  <div key={print.id} className="text-caption text-flo-text-muted">
                    {index + 1}.{' '}
                    {t('orders.printHistoryEntry', {
                      printedType:
                        print.print_type === 'reprint' ? t('orders.reprint') : t('orders.printed'),
                      user: print.user_name,
                      time: formatDateTime(print.printed_at),
                    })}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="px-4 py-3 border-t border-flo-border flex flex-wrap gap-2">
        {showCheckout ? (
          <Button
            onClick={onCheckout}
            disabled={generatingBill}
            size="sm"
            className="flex-1 justify-center min-h-11"
          >
            <CreditCard size={14} className="mr-1.5" aria-hidden />
            {generatingBill ? t('orders.generating') : t('orders.checkout')}
          </Button>
        ) : null}
        {!['completed', 'cancelled'].includes(order.status) ? (
          <Button
            variant="outline"
            onClick={onAddItems}
            size="sm"
            className="flex-1 justify-center min-h-11 border-flo-success text-flo-success hover:bg-flo-success-subtle"
          >
            <Plus size={14} className="mr-1.5" aria-hidden />
            {t('orders.addItem')}
          </Button>
        ) : null}
        {order.type === 'dine_in' && !['completed', 'cancelled'].includes(order.status) ? (
          <Button
            variant="outline"
            onClick={onConvertToTakeaway}
            disabled={convertingOrder}
            size="sm"
            className="flex-1 justify-center min-h-11 border-flo-info text-flo-info hover:bg-flo-info-subtle"
          >
            <ShoppingBag size={14} className="mr-1.5" aria-hidden />
            {convertingOrder ? t('orders.converting') : t('orders.convertToTakeaway')}
          </Button>
        ) : null}
        {!['completed', 'cancelled'].includes(order.status) ? (
          <Button
            variant="outline"
            onClick={onCancel}
            disabled={cancellingOrder}
            size="sm"
            className={cn(
              'flex-1 justify-center min-h-11',
              order.status === 'pending'
                ? 'border-flo-danger text-flo-danger hover:bg-flo-danger-subtle'
                : 'border-flo-warning text-flo-warning hover:bg-flo-warning-subtle',
            )}
          >
            {order.status === 'pending' ? (
              <XCircle size={14} className="mr-1.5" aria-hidden />
            ) : (
              <Lock size={14} className="mr-1.5" aria-hidden />
            )}
            {cancellingOrder ? t('orders.cancelling') : t('common.cancel')}
          </Button>
        ) : null}
      </div>
    </Panel>
  );
}
