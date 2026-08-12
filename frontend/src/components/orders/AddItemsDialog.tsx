'use client';

import { Plus, Search, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { Order, Product } from '@/lib/types';
import { useI18n } from '@/hooks/useI18n';

export interface SelectedAddItem {
  product_id: number;
  product_name: string;
  quantity: number;
  special_instructions: string;
}

export interface AddItemsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: Order | null;
  products: Product[];
  productSearch: string;
  onProductSearchChange: (query: string) => void;
  selectedItems: SelectedAddItem[];
  onAddProduct: (product: Product) => void;
  onRemoveItem: (productId: number) => void;
  onUpdateQty: (productId: number, quantity: number) => void;
  onUpdateNotes: (productId: number, notes: string) => void;
  onSubmit: () => void;
  adding: boolean;
  fmt: (amount: number) => string;
}

export function AddItemsDialog({
  open,
  onOpenChange,
  order,
  products,
  productSearch,
  onProductSearchChange,
  selectedItems,
  onAddProduct,
  onRemoveItem,
  onUpdateQty,
  onUpdateNotes,
  onSubmit,
  adding,
  fmt,
}: AddItemsDialogProps) {
  const { t } = useI18n();

  if (!order) return null;

  const filteredProducts = products.filter(
    (p) => !productSearch || p.name.toLowerCase().includes(productSearch.toLowerCase()),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-flo-border bg-flo-surface sm:max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-flo-text">
            {t('orders.addItems')} #{order.order_number}
          </DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-flo-text-muted" />
          <input
            type="text"
            placeholder={t('orders.searchMenu')}
            value={productSearch}
            onChange={(e) => onProductSearchChange(e.target.value)}
            className="w-full pl-9 pr-3 py-2 min-h-11 border border-flo-border rounded-flo-md text-small text-flo-text focus:outline-none focus:ring-2 focus:ring-flo-brand-500"
          />
        </div>

        <div className="flex-1 overflow-y-auto border border-flo-border rounded-flo-md max-h-48">
          {filteredProducts.map((product) => (
            <button
              key={product.id}
              type="button"
              onClick={() => onAddProduct(product)}
              className="w-full flex items-center justify-between px-3 py-2 min-h-11 hover:bg-flo-surface-muted text-left border-b border-flo-border last:border-0 transition-colors"
            >
              <div>
                <span className="text-small font-medium text-flo-text">{product.name}</span>
                {product.price && (
                  <span className="text-xs text-flo-text-secondary ml-2">{fmt(Number(product.price))}</span>
                )}
              </div>
              <Plus size={14} className="text-flo-brand-600" />
            </button>
          ))}
          {filteredProducts.length === 0 && (
            <div className="px-3 py-4 text-small text-flo-text-muted text-center">{t('orders.noItemsFound')}</div>
          )}
        </div>

        {selectedItems.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-flo-text-secondary uppercase">{t('orders.selectedItems')}</p>
            {selectedItems.map((item) => (
              <div key={item.product_id} className="flex items-center gap-2 bg-flo-surface-muted rounded-flo-md p-2">
                <div className="flex-1 min-w-0">
                  <span className="text-small font-medium text-flo-text truncate block">{item.product_name}</span>
                  <input
                    type="text"
                    placeholder={t('orders.notesOptional')}
                    value={item.special_instructions}
                    maxLength={100}
                    onChange={(e) => onUpdateNotes(item.product_id, e.target.value.slice(0, 100))}
                    className="w-full text-xs text-flo-text-secondary bg-transparent border-0 p-0 focus:outline-none placeholder:text-flo-text-muted"
                  />
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onUpdateQty(item.product_id, item.quantity - 1)}
                    className="w-6 h-6 rounded bg-flo-border text-flo-text-secondary text-xs hover:bg-flo-surface-muted min-h-11 min-w-11 flex items-center justify-center"
                  >
                    -
                  </button>
                  <span className="w-6 text-center text-small font-medium">{item.quantity}</span>
                  <button
                    type="button"
                    onClick={() => onUpdateQty(item.product_id, item.quantity + 1)}
                    className="w-6 h-6 rounded bg-flo-border text-flo-text-secondary text-xs hover:bg-flo-surface-muted min-h-11 min-w-11 flex items-center justify-center"
                  >
                    +
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => onRemoveItem(item.product_id)}
                  className="p-1 rounded hover:bg-red-50 text-red-400 hover:text-red-600 min-h-11 min-w-11 flex items-center justify-center"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-end pt-2 border-t border-flo-border">
          <Button variant="outline" className="min-h-11" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            className="min-h-11 bg-flo-brand-600 hover:bg-flo-brand-700 text-white"
            onClick={onSubmit}
            disabled={selectedItems.length === 0 || adding}
          >
            <Plus size={14} className="mr-1.5" />
            {adding ? t('orders.adding') : t('orders.addItemsCount', { count: selectedItems.length })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
