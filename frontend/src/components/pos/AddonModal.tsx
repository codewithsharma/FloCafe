'use client';

import { useState } from 'react';
import { Plus, Minus } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useI18n } from '@/hooks/useI18n';
import { useFormatCurrency } from '@/hooks/useFormatCurrency';
import type { Product, Addon, AddonGroup } from '@/lib/types';

interface Props {
  product: Product;
  currency: string;
  onAdd: (product: Product, quantity: number, addons: Addon[], specialInstructions: string) => void;
  onClose: () => void;
  initialQuantity?: number;
  initialAddons?: Addon[];
  initialInstructions?: string;
  mode?: 'add' | 'edit';
}

function groupInitialAddons(addons: Addon[]): Record<string | number, Addon[]> {
  const grouped: Record<string | number, Addon[]> = {};
  for (const addon of addons) {
    const groupId = addon.addon_group_id;
    if (groupId == null) continue;
    grouped[groupId] = [...(grouped[groupId] || []), addon];
  }
  return grouped;
}

export default function AddonModal({
  product,
  onAdd,
  onClose,
  initialQuantity = 1,
  initialAddons = [],
  initialInstructions = '',
  mode = 'add',
}: Props) {
  const { t } = useI18n();
  const fmt = useFormatCurrency();
  const [selected, setSelected] = useState<Record<string | number, Addon[]>>(() =>
    groupInitialAddons(initialAddons),
  );
  const [quantity, setQuantity] = useState(initialQuantity);
  const [instructions, setInstructions] = useState(initialInstructions);

  const groups = product.addon_groups || [];

  const getGroupTotalQuantity = (groupId: string | number): number => {
    const list = selected[groupId] || [];
    return list.reduce((sum, a) => sum + (a.quantity || 1), 0);
  };

  const updateAddonQuantity = (group: AddonGroup, addon: Addon, delta: number) => {
    const groupId = group.id;
    const currentList = selected[groupId] || [];
    const existingIndex = currentList.findIndex((a) => a.id === addon.id);
    const currentQty = existingIndex >= 0 ? currentList[existingIndex].quantity || 1 : 0;
    const newQty = currentQty + delta;

    if (newQty <= 0) {
      const updatedList = currentList.filter((a) => a.id !== addon.id);
      setSelected({ ...selected, [groupId]: updatedList });
    } else {
      const currentGroupTotal = currentList.reduce((sum, a) => sum + (a.quantity || 1), 0);
      const newGroupTotal = currentGroupTotal + delta;
      const max = group.max_selection || 999;
      if (delta > 0 && newGroupTotal > max) {
        toast.error(t('pos.maxSelectionReached', { count: max }));
        return;
      }

      if (existingIndex >= 0) {
        const updatedList = [...currentList];
        updatedList[existingIndex] = { ...updatedList[existingIndex], quantity: newQty };
        setSelected({ ...selected, [groupId]: updatedList });
      } else {
        setSelected({ ...selected, [groupId]: [...currentList, { ...addon, quantity: newQty }] });
      }
    }
  };

  const toggleAddonCheckbox = (group: AddonGroup, addon: Addon) => {
    const currentList = selected[group.id] || [];
    const exists = currentList.some((a) => a.id === addon.id);
    if (exists) {
      updateAddonQuantity(group, addon, -1);
    } else {
      updateAddonQuantity(group, addon, 1);
    }
  };

  const getAddonQuantity = (groupId: string | number, addonId: string | number): number => {
    const list = selected[groupId] || [];
    const item = list.find((a) => a.id === addonId);
    return item ? item.quantity || 1 : 0;
  };

  const allAddons = Object.values(selected).flat();
  const addonTotal = allAddons.reduce((sum, a) => sum + Number(a.price) * (a.quantity || 1), 0);
  const itemTotal = (Number(product.price) + addonTotal) * quantity;

  const isValid = groups.every((g) => {
    const count = getGroupTotalQuantity(g.id);
    const requiredMin = Boolean(g.is_required)
      ? Math.max(1, g.min_selection || 1)
      : g.min_selection || 0;
    if (count < requiredMin) return false;
    if (g.max_selection && count > g.max_selection) return false;
    return true;
  });

  const handleAdd = () => {
    if (!isValid) return;
    onAdd(product, quantity, allAddons, instructions);
    onClose();
  };

  const selectedRow = 'border-flo-brand-600 bg-flo-brand-50 text-flo-brand-600';
  const idleRow = 'border-flo-border hover:border-flo-text-muted text-flo-text';

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="border-flo-border bg-flo-surface sm:max-w-md max-h-[85vh] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogHeader className="p-5 border-b border-flo-border">
          <DialogTitle className="text-flo-text">{product.name}</DialogTitle>
          <p className="text-flo-brand-600 font-semibold">{fmt(Number(product.price))}</p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {groups.map((group) => {
            const count = getGroupTotalQuantity(group.id);
            const activeAddons = (group.addons || []).filter((a) => a.is_active);
            const allowMultiple = Boolean(group.allow_multiple_quantities);

            return (
              <div key={group.id}>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-sm text-flo-text">{group.name}</h3>
                  <span className="flex items-center gap-2">
                    {Boolean(group.is_required) && (
                      <span className="text-xs text-flo-danger font-medium">
                        {t('pos.required')}
                      </span>
                    )}
                    {group.max_selection
                      ? (() => {
                          const remaining = Math.max(0, group.max_selection - count);
                          const isZero = remaining === 0;
                          return (
                            <span
                              className={`font-semibold transition-all ${
                                isZero ? 'text-sm text-flo-warning' : 'text-xs text-flo-info'
                              }`}
                            >
                              {isZero
                                ? t('pos.selectionComplete')
                                : t('pos.remainingCount', { count: remaining })}
                            </span>
                          );
                        })()
                      : null}
                  </span>
                </div>
                {group.description && (
                  <p className="text-xs text-flo-text-muted mb-2">{group.description}</p>
                )}
                <div className="space-y-1">
                  {activeAddons.map((addon) => {
                    const addonQty = getAddonQuantity(group.id, addon.id);
                    const isSel = addonQty > 0;

                    if (allowMultiple) {
                      return (
                        <div
                          key={addon.id}
                          className={`w-full flex items-center justify-between px-3 py-2.5 min-h-11 rounded-flo-md border text-sm transition-colors ${
                            isSel ? selectedRow : idleRow
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1 pr-2">
                            <span className="font-medium min-w-0 truncate">{addon.name}</span>
                            <span
                              className={`text-xs shrink-0 ${isSel ? 'text-flo-brand-600 font-semibold' : 'text-flo-text-secondary'}`}
                            >
                              {Number(addon.price) === 0
                                ? t('pos.freeAddon')
                                : `+${fmt(Number(addon.price))}`}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {isSel ? (
                              <div className="flex items-center gap-1 bg-flo-surface border border-flo-brand-600 rounded-flo-md p-0.5">
                                <button
                                  type="button"
                                  onClick={() => updateAddonQuantity(group, addon, -1)}
                                  aria-label={t('pos.decreaseQuantity', {
                                    defaultValue: 'Decrease quantity',
                                  })}
                                  className="min-h-[var(--flo-touch-min)] min-w-[var(--flo-touch-min)] rounded flex items-center justify-center text-flo-brand-600 hover:bg-flo-brand-50"
                                >
                                  <Minus size={14} aria-hidden />
                                </button>
                                <span className="text-xs font-bold w-4 text-center text-flo-brand-600">
                                  {addonQty}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => updateAddonQuantity(group, addon, 1)}
                                  aria-label={t('pos.increaseQuantity', {
                                    defaultValue: 'Increase quantity',
                                  })}
                                  className="min-h-[var(--flo-touch-min)] min-w-[var(--flo-touch-min)] rounded flex items-center justify-center text-flo-brand-600 hover:bg-flo-brand-50"
                                >
                                  <Plus size={14} aria-hidden />
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => updateAddonQuantity(group, addon, 1)}
                                aria-label={t('pos.increaseQuantity', {
                                  defaultValue: 'Increase quantity',
                                })}
                                className="min-h-[var(--flo-touch-min)] min-w-[var(--flo-touch-min)] rounded-full bg-flo-bg flex items-center justify-center text-flo-text-secondary hover:bg-flo-border"
                              >
                                <Plus size={14} aria-hidden />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={addon.id}
                        className={`w-full flex items-center justify-between px-3 py-2.5 min-h-11 rounded-flo-md border text-sm transition-colors ${
                          isSel ? selectedRow : idleRow
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1 pr-2">
                          <span className="font-medium min-w-0 truncate">{addon.name}</span>
                          <span
                            className={`text-xs shrink-0 ${isSel ? 'text-flo-brand-600 font-semibold' : 'text-flo-text-secondary'}`}
                          >
                            {Number(addon.price) === 0
                              ? t('pos.freeAddon')
                              : `+${fmt(Number(addon.price))}`}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {isSel ? (
                            <div className="flex items-center gap-1 bg-flo-surface border border-flo-brand-600 rounded-flo-md p-0.5">
                              <button
                                type="button"
                                onClick={() => toggleAddonCheckbox(group, addon)}
                                aria-label={t('pos.decreaseQuantity', {
                                  defaultValue: 'Decrease quantity',
                                })}
                                className="min-h-[var(--flo-touch-min)] min-w-[var(--flo-touch-min)] rounded flex items-center justify-center text-flo-brand-600 hover:bg-flo-brand-50"
                              >
                                <Minus size={14} aria-hidden />
                              </button>
                              <span className="text-xs font-bold w-4 text-center text-flo-brand-600">
                                1
                              </span>
                              <button
                                type="button"
                                disabled
                                aria-label={t('pos.increaseQuantity', {
                                  defaultValue: 'Increase quantity',
                                })}
                                className="min-h-[var(--flo-touch-min)] min-w-[var(--flo-touch-min)] rounded flex items-center justify-center text-flo-text-muted cursor-not-allowed opacity-50"
                              >
                                <Plus size={14} aria-hidden />
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => toggleAddonCheckbox(group, addon)}
                              aria-label={t('pos.increaseQuantity', {
                                defaultValue: 'Increase quantity',
                              })}
                              className="min-h-[var(--flo-touch-min)] min-w-[var(--flo-touch-min)] rounded-full bg-flo-bg flex items-center justify-center text-flo-text-secondary hover:bg-flo-border"
                            >
                              <Plus size={14} aria-hidden />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {(() => {
                  const requiredMin = Boolean(group.is_required)
                    ? Math.max(1, group.min_selection || 1)
                    : group.min_selection || 0;
                  if (requiredMin > 0 && count < requiredMin) {
                    return (
                      <p className="text-xs text-flo-danger mt-1">
                        {t('pos.selectAtLeast', { count: requiredMin })}
                      </p>
                    );
                  }
                  return null;
                })()}
              </div>
            );
          })}

          <div>
            <label className="block text-sm font-medium text-flo-text mb-1">
              {t('pos.specialInstructions')}
            </label>
            <input
              type="text"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value.slice(0, 100))}
              placeholder={t('pos.specialInstructionsPlaceholder')}
              maxLength={100}
              className="w-full px-3 py-2 min-h-11 text-sm border border-flo-border rounded-flo-md bg-flo-surface text-flo-text outline-none focus:ring-2 focus:ring-flo-brand-500"
            />
            <p className="text-xs text-flo-text-muted text-right mt-0.5">
              {instructions.length}/100
            </p>
          </div>
        </div>

        <div className="p-5 border-t border-flo-border shrink-0">
          <div className="flex items-center justify-center gap-4 mb-4">
            <button
              type="button"
              onClick={() => setQuantity(Math.max(1, quantity - 1))}
              aria-label={t('pos.decreaseQuantity', { defaultValue: 'Decrease quantity' })}
              className="min-h-[var(--flo-touch-min)] min-w-[var(--flo-touch-min)] rounded-full bg-flo-bg flex items-center justify-center hover:bg-flo-border text-flo-text"
            >
              <Minus size={16} aria-hidden />
            </button>
            <span className="text-lg font-bold w-8 text-center text-flo-text tabular-nums">
              {quantity}
            </span>
            <button
              type="button"
              onClick={() => setQuantity(quantity + 1)}
              aria-label={t('pos.increaseQuantity', { defaultValue: 'Increase quantity' })}
              className="min-h-[var(--flo-touch-min)] min-w-[var(--flo-touch-min)] rounded-full bg-flo-bg flex items-center justify-center hover:bg-flo-border text-flo-text"
            >
              <Plus size={16} aria-hidden />
            </button>
          </div>
          <Button
            onClick={handleAdd}
            disabled={!isValid}
            className="w-full min-h-12 bg-flo-brand-600 hover:bg-flo-brand-700"
            size="lg"
          >
            {mode === 'edit'
              ? t('pos.saveItemChanges', {
                  total: fmt(itemTotal),
                  defaultValue: 'Save changes — {total}',
                })
              : t('pos.addToCart', { total: fmt(itemTotal) })}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
