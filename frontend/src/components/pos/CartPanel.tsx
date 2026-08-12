'use client';

import {
  ShoppingCart, UtensilsCrossed, Package, Truck,
  Plus, Minus, Trash2, Pause, MapPin, SquarePen,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCartStore } from '@/store/cart';
import { useHeldOrdersStore } from '@/store/held-orders';
import { useAuthStore } from '@/store/auth';
import { usePosSettingsStore } from '@/store/pos-settings';
import { useI18n } from '@/hooks/useI18n';
import toast from 'react-hot-toast';
import type { Table, Order, OrderItem, CartItem } from '@/lib/types';
import { useFormatCurrency } from '@/hooks/useFormatCurrency';
import { cn } from '@/lib/utils';

interface Props {
  tables: Table[];
  currency: string;
  submitting: boolean;
  onPlaceOrder: () => void;
  onShowTablePicker: () => void;
  onEditItem?: (item: CartItem) => void;
  variant?: 'sidebar' | 'drawer';
  existingOrder?: Order | null;
}

const orderTypeIcons = {
  dine_in: UtensilsCrossed,
  takeaway: Package,
  delivery: Truck,
};

export default function CartPanel({
  tables, submitting, onPlaceOrder, onEditItem, variant = 'sidebar', existingOrder,
}: Props) {
  const cart = useCartStore();
  const heldOrders = useHeldOrdersStore();
  const { currentTenant } = useAuthStore();
  const billingType = usePosSettingsStore((s) => s.billingType);
  const { t } = useI18n();
  const isRestaurant = (currentTenant?.business_type ?? 'restaurant') === 'restaurant';
  const fmt = useFormatCurrency();
  const canHold = isRestaurant && cart.orderType === 'dine_in' && cart.tableId && cart.items.length > 0 && billingType === 'postpaid';
  const isDrawer = variant === 'drawer';

  const handleHold = async () => {
    if (!cart.tableId) {
      toast.error(t('pos.selectTableFirst'));
      return;
    }
    if (cart.items.length === 0) {
      toast.error(t('pos.cartEmpty'));
      return;
    }
    const tableName = tables.find((tbl) => tbl.id === cart.tableId)?.name || cart.tableId;
    try {
      await heldOrders.holdOrder(cart.tableId, cart.items, cart.customerId, cart.guestCount, cart.orderNotes);
      cart.clearCart();
      toast.success(t('pos.orderHeldFor', { table: tableName }));
    } catch (err: unknown) {
      const e = err as Error;
      toast.error(e.message || t('pos.holdOrderFailed'));
    }
  };

  return (
    <div
      className={cn(
        'flex flex-col h-full min-h-0',
        isDrawer ? 'w-full' : 'w-full rounded-flo-lg border border-flo-border bg-flo-surface shadow-sm',
      )}
    >
      {/* Order type + pax */}
      <div className="shrink-0 p-3 md:p-4 border-b border-flo-border space-y-2">
        <div className="flex gap-1 bg-flo-surface-muted rounded-flo-md p-1">
          {(['dine_in', 'takeaway', 'delivery'] as const)
            .filter((type) => isRestaurant || type !== 'dine_in')
            .map((type) => {
              const Icon = orderTypeIcons[type];
              const label = type === 'dine_in' ? t('pos.orderTypeDineIn') : type === 'takeaway' ? t('pos.orderTypeTakeaway') : t('pos.orderTypeDelivery');
              const active = cart.orderType === type;
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => cart.setOrderType(type)}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1 min-h-11 rounded-flo-sm text-caption font-medium transition-colors',
                    active ? 'bg-flo-surface text-flo-brand-700 shadow-sm' : 'text-flo-text-muted hover:text-flo-text',
                  )}
                >
                  <Icon className="size-3.5" aria-hidden />
                  {label}
                </button>
              );
            })}
        </div>

        {cart.orderType === 'dine_in' && (
          <div className="flex items-center justify-between rounded-flo-md border border-flo-border bg-flo-bg px-3 py-2">
            <div className="flex items-center gap-2 text-body text-flo-text-secondary">
              <Users className="size-4" aria-hidden />
              <span>{t('pos.pax', { defaultValue: 'Pax' })}</span>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" aria-label={t('pos.decreasePax', { defaultValue: 'Decrease pax' })} onClick={() => cart.setGuestCount(Math.max(1, cart.guestCount - 1))} className="size-11 rounded-full bg-flo-surface-muted flex items-center justify-center hover:bg-flo-border"><Minus className="size-4" /></button>
              <input aria-label={t('pos.pax', { defaultValue: 'Pax' })} type="number" min="1" max="99" value={cart.guestCount} onChange={(e) => cart.setGuestCount(Math.min(99, Math.max(1, Number(e.target.value) || 1)))} className="w-10 text-center text-body font-semibold tabular-nums border-0 outline-none bg-transparent" />
              <button type="button" aria-label={t('pos.increasePax', { defaultValue: 'Increase pax' })} onClick={() => cart.setGuestCount(Math.min(99, cart.guestCount + 1))} className="size-11 rounded-full bg-flo-surface-muted flex items-center justify-center hover:bg-flo-border"><Plus className="size-4" /></button>
            </div>
          </div>
        )}

        {cart.orderType === 'delivery' && (
          <div className="flex items-center gap-2">
            <MapPin className="size-4 text-flo-text-muted shrink-0" aria-hidden />
            <input
              type="text"
              value={cart.deliveryAddress}
              onChange={(e) => cart.setDeliveryAddress(e.target.value)}
              placeholder={t('pos.deliveryAddress')}
              className="flex-1 min-h-11 px-3 text-body border border-flo-border rounded-flo-md bg-flo-bg focus:ring-2 focus:ring-flo-brand-500/20 focus:border-flo-brand-500 outline-none"
            />
          </div>
        )}
      </div>

      {/* Line items */}
      <div className={cn('flex-1 overflow-y-auto p-3 md:p-4 min-h-0', isDrawer && 'max-h-[40vh]')}>
        {existingOrder && existingOrder.items && existingOrder.items.filter((i: OrderItem) => i.status !== 'cancelled').length > 0 && (
          <div className="mb-3 pb-3 border-b border-dashed border-flo-border">
            <p className="text-caption font-semibold text-flo-text-muted uppercase tracking-wider mb-2">{t('pos.alreadyOrdered')}</p>
            <div className="space-y-1.5">
              {existingOrder.items.filter((i: OrderItem) => i.status !== 'cancelled').map((item: OrderItem) => (
                <div key={item.id} className="flex justify-between items-center gap-2">
                  <span className="text-caption text-flo-text-muted truncate">{item.quantity}× {item.product_name}</span>
                  <span className="text-caption text-flo-text-muted tabular-nums shrink-0">{fmt(Number(item.total))}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {cart.items.length === 0 ? (
          <div className={cn('flex flex-col items-center justify-center text-flo-text-muted', existingOrder ? 'py-4' : isDrawer ? 'py-8' : 'py-12')}>
            <ShoppingCart className={existingOrder ? 'size-6' : 'size-10'} aria-hidden />
            <p className="mt-2 text-body">{existingOrder ? t('pos.addNewItemsAbove') : t('pos.cartEmpty')}</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {cart.items.map((item) => (
              <li key={item.id} className="flex items-start gap-2">
                <button
                  type="button"
                  onClick={() => cart.removeItem(item.id)}
                  aria-label={t('common.removeItem')}
                  className="size-11 shrink-0 rounded-full text-flo-text-muted hover:text-flo-danger hover:bg-flo-danger-subtle flex items-center justify-center transition-colors"
                >
                  <Trash2 className="size-4" />
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-body font-medium text-flo-text truncate">{item.product.name}</p>
                    {onEditItem && (
                      <button
                        type="button"
                        onClick={() => onEditItem(item)}
                        className="shrink-0 flex items-center gap-1 min-h-11 px-2 rounded-flo-full bg-flo-warning-subtle text-flo-warning text-caption font-medium"
                      >
                        <SquarePen className="size-3.5" aria-hidden />
                        {t('common.edit')}
                      </button>
                    )}
                  </div>
                  {item.addons.length > 0 && (
                    <div className="mt-0.5">
                      {item.addons.map((a) => (
                        <p key={a.id} className="text-caption text-flo-text-muted">
                          + {a.name}{(a.quantity || 1) > 1 ? ` ×${a.quantity}` : ''} {Number(a.price) > 0 && `(${fmt(Number(a.price) * (a.quantity || 1))})`}
                        </p>
                      ))}
                    </div>
                  )}
                  {item.special_instructions && (
                    <p className="text-caption text-flo-text-muted italic mt-0.5 break-words">{item.special_instructions}</p>
                  )}
                  <p className="text-numeric text-flo-text-secondary mt-0.5">{fmt(Number(item.product.price))}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button type="button" onClick={() => cart.updateQuantity(item.id, item.quantity - 1)} className="size-11 rounded-full bg-flo-surface-muted flex items-center justify-center hover:bg-flo-border"><Minus className="size-4" /></button>
                  <span className="text-body font-medium w-6 text-center tabular-nums">{item.quantity}</span>
                  <button type="button" onClick={() => cart.updateQuantity(item.id, item.quantity + 1)} className="size-11 rounded-full bg-flo-surface-muted flex items-center justify-center hover:bg-flo-border"><Plus className="size-4" /></button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Totals + actions */}
      <div className="shrink-0 p-3 md:p-4 border-t border-flo-border bg-flo-surface">
        {cart.items.length > 0 && (
          <div className="mb-3">
            <textarea
              value={cart.orderNotes}
              onChange={(e) => cart.setOrderNotes(e.target.value.slice(0, 200))}
              placeholder={t('pos.orderNotesPlaceholder')}
              rows={2}
              maxLength={200}
              className="w-full min-h-11 px-3 py-2 text-body border border-flo-border rounded-flo-md resize-none bg-flo-bg focus:outline-none focus:ring-2 focus:ring-flo-brand-500/20 focus:border-flo-brand-500"
            />
            <p className="text-caption text-flo-text-muted text-right mt-0.5 tabular-nums">{cart.orderNotes.length}/200</p>
          </div>
        )}
        <div className="flex justify-between mb-1 text-body">
          <span className="text-flo-text-secondary">{t('pos.items')}</span>
          <span className="font-medium tabular-nums">{cart.itemCount()}</span>
        </div>
        <div className="flex justify-between items-baseline mb-4">
          <span className="text-h3 text-flo-text">{t('pos.subtotal')}</span>
          <span className="text-numeric-xl text-flo-brand-700">{fmt(cart.subtotal())}</span>
        </div>
        <div className="flex gap-2">
          {canHold && (
            <Button variant="outline" onClick={handleHold} className="flex-1 min-h-12 border-flo-border">
              <Pause className="size-4 mr-1" aria-hidden /> {t('pos.holdButton')}
            </Button>
          )}
          <Button
            onClick={onPlaceOrder}
            disabled={submitting || cart.items.length === 0}
            className="flex-1 min-h-12 bg-flo-brand-600 hover:bg-flo-brand-700 text-white"
            size="lg"
          >
            {submitting ? t('pos.placing') : t('pos.placeOrderButton')}
          </Button>
        </div>
      </div>
    </div>
  );
}
