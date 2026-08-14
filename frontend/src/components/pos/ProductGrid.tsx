'use client';

import { Search, SlidersHorizontal } from 'lucide-react';
import type { Category, Product } from '@/lib/types';
import { useCartStore } from '@/store/cart';
import { usePosSettingsStore } from '@/store/pos-settings';
import { nameToColor } from '@/lib/image-utils';
import TagBadge from './DietaryBadge';
import api from '@/lib/api';
import { useI18n } from '@/hooks/useI18n';
import { parseDbTimestamp } from '@/lib/utils';
import { useFormatCurrency } from '@/hooks/useFormatCurrency';
import { StatusBadge } from '@/components/flo/StatusBadge';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';
import { findProductByScanCode, productMatchesPosSearch } from '@/lib/pos/product-search';

const CATEGORY_COLORS: Record<
  string,
  { bg: string; text: string; border: string; activeBg: string; activeText: string }
> = {
  red: {
    bg: 'bg-red-50',
    text: 'text-red-700',
    border: 'border-red-200',
    activeBg: 'bg-red-500',
    activeText: 'text-white',
  },
  orange: {
    bg: 'bg-orange-50',
    text: 'text-orange-700',
    border: 'border-orange-200',
    activeBg: 'bg-orange-500',
    activeText: 'text-white',
  },
  amber: {
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    border: 'border-amber-200',
    activeBg: 'bg-amber-500',
    activeText: 'text-white',
  },
  yellow: {
    bg: 'bg-yellow-50',
    text: 'text-yellow-700',
    border: 'border-yellow-200',
    activeBg: 'bg-yellow-500',
    activeText: 'text-white',
  },
  lime: {
    bg: 'bg-lime-50',
    text: 'text-lime-700',
    border: 'border-lime-200',
    activeBg: 'bg-lime-500',
    activeText: 'text-white',
  },
  green: {
    bg: 'bg-green-50',
    text: 'text-green-700',
    border: 'border-green-200',
    activeBg: 'bg-green-500',
    activeText: 'text-white',
  },
  emerald: {
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-200',
    activeBg: 'bg-emerald-500',
    activeText: 'text-white',
  },
  teal: {
    bg: 'bg-teal-50',
    text: 'text-teal-700',
    border: 'border-teal-200',
    activeBg: 'bg-teal-500',
    activeText: 'text-white',
  },
  cyan: {
    bg: 'bg-cyan-50',
    text: 'text-cyan-700',
    border: 'border-cyan-200',
    activeBg: 'bg-cyan-500',
    activeText: 'text-white',
  },
  sky: {
    bg: 'bg-sky-50',
    text: 'text-sky-700',
    border: 'border-sky-200',
    activeBg: 'bg-sky-500',
    activeText: 'text-white',
  },
  blue: {
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'border-blue-200',
    activeBg: 'bg-blue-500',
    activeText: 'text-white',
  },
  indigo: {
    bg: 'bg-indigo-50',
    text: 'text-indigo-700',
    border: 'border-indigo-200',
    activeBg: 'bg-indigo-500',
    activeText: 'text-white',
  },
  violet: {
    bg: 'bg-violet-50',
    text: 'text-violet-700',
    border: 'border-violet-200',
    activeBg: 'bg-violet-500',
    activeText: 'text-white',
  },
  purple: {
    bg: 'bg-purple-50',
    text: 'text-purple-700',
    border: 'border-purple-200',
    activeBg: 'bg-purple-500',
    activeText: 'text-white',
  },
  fuchsia: {
    bg: 'bg-fuchsia-50',
    text: 'text-fuchsia-700',
    border: 'border-fuchsia-200',
    activeBg: 'bg-fuchsia-500',
    activeText: 'text-white',
  },
  pink: {
    bg: 'bg-pink-50',
    text: 'text-pink-700',
    border: 'border-pink-200',
    activeBg: 'bg-pink-500',
    activeText: 'text-white',
  },
  rose: {
    bg: 'bg-rose-50',
    text: 'text-rose-700',
    border: 'border-rose-200',
    activeBg: 'bg-rose-500',
    activeText: 'text-white',
  },
};

function getCategoryColorClasses(color: string | null | undefined) {
  if (!color) return null;
  return CATEGORY_COLORS[color.toLowerCase()] || null;
}

interface Props {
  categories: Category[];
  products: Product[];
  selectedCategory: number | null;
  setSelectedCategory: (id: number | null) => void;
  search: string;
  setSearch: (s: string) => void;
  currency: string;
  onProductClick: (product: Product) => void;
  sidebarOpen?: boolean;
}

export default function ProductGrid({
  categories,
  products,
  selectedCategory,
  setSelectedCategory,
  search,
  setSearch,
  onProductClick,
  sidebarOpen = true,
}: Props) {
  const cart = useCartStore();
  const { showProductImages } = usePosSettingsStore();
  const { t } = useI18n();
  const fmt = useFormatCurrency();

  const filtered = products.filter((p) => {
    const matchCat = !selectedCategory || p.category_id === selectedCategory;
    const matchSearch = productMatchesPosSearch(p, search);
    return matchCat && matchSearch;
  });

  return (
    <div
      data-testid="pos-product-grid"
      className="flex flex-1 flex-col min-w-0 h-full overflow-hidden rounded-flo-lg border border-flo-border bg-flo-surface"
    >
      {/* Discovery bar — categories + search */}
      <div className="shrink-0 border-b border-flo-border p-3 md:p-4 space-y-3">
        <div className="relative">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-flo-text-muted pointer-events-none"
            aria-hidden
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              const trimmed = search.trim();
              if (!trimmed) return;
              // Exact barcode/SKU → add once (scanner Enter into focused field).
              // Name substrings stay as filter-only (no silent no-op on exact miss).
              const match = findProductByScanCode(products, trimmed);
              if (match) {
                onProductClick(match);
                setSearch('');
                toast.success(t('pos.barcodeAdded', { name: match.name }));
              } else if (/^\d{4,}$/.test(trimmed) || trimmed.length >= 8) {
                toast.error(t('pos.barcodeNotFound', { code: trimmed }));
              }
            }}
            placeholder={t('pos.searchProducts')}
            aria-label={t('pos.searchProducts')}
            className="w-full min-h-11 pl-9 pr-4 py-2 bg-flo-bg border border-flo-border rounded-flo-md focus:border-flo-brand-500 focus:ring-2 focus:ring-flo-brand-500/20 outline-none transition-colors text-body"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-0.5 scrollbar-thin">
          <button
            type="button"
            onClick={() => setSelectedCategory(null)}
            className={cn(
              'min-h-11 shrink-0 px-4 rounded-flo-md text-sm font-medium whitespace-nowrap transition-colors',
              !selectedCategory
                ? 'bg-flo-brand-600 text-white'
                : 'bg-flo-bg text-flo-text-secondary border border-flo-border hover:border-flo-brand-500',
            )}
          >
            {t('pos.allCategories')}
          </button>
          {categories
            .filter((cat) => cat.id != null)
            .map((cat) => {
              const colorClasses = getCategoryColorClasses(cat.color);
              const isSelected = selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedCategory(cat.id)}
                  className={cn(
                    'min-h-11 shrink-0 px-4 rounded-flo-md text-sm font-medium whitespace-nowrap transition-colors',
                    isSelected
                      ? colorClasses
                        ? `${colorClasses.activeBg} ${colorClasses.activeText}`
                        : 'bg-flo-brand-600 text-white'
                      : colorClasses
                        ? `${colorClasses.bg} ${colorClasses.text} border ${colorClasses.border}`
                        : 'bg-flo-bg text-flo-text-secondary border border-flo-border hover:border-flo-brand-500',
                  )}
                >
                  {cat.name}
                </button>
              );
            })}
        </div>
      </div>

      {/* Product workspace */}
      <div className="flex-1 overflow-y-auto p-3 md:p-4 pb-24 md:pb-4">
        <div
          className={cn(
            'grid gap-3',
            sidebarOpen
              ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4'
              : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5',
          )}
        >
          {filtered.map((product) => {
            const inCartQty = cart.items
              .filter((i) => i.product.id === product.id)
              .reduce((sum, i) => sum + i.quantity, 0);

            const outOfStock = !!product.track_inventory && product.stock_quantity <= 0;
            const lowStock =
              !!product.track_inventory &&
              product.stock_quantity > 0 &&
              product.stock_quantity <= (product.low_stock_threshold || 0);

            return (
              <button
                key={product.id}
                type="button"
                data-testid="pos-product-card"
                onClick={() => onProductClick(product)}
                disabled={outOfStock}
                className={cn(
                  'relative min-h-[88px] rounded-flo-lg p-3 border text-left transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flo-brand-500 focus-visible:ring-offset-2',
                  outOfStock
                    ? 'border-flo-border bg-flo-surface-muted opacity-60 cursor-not-allowed'
                    : 'border-flo-border bg-flo-surface hover:border-flo-brand-500 hover:bg-flo-brand-50/30',
                )}
              >
                {outOfStock && (
                  <StatusBadge variant="danger" className="absolute top-2 left-2 z-10">
                    {t('pos.outOfStock')}
                  </StatusBadge>
                )}
                {lowStock && (
                  <StatusBadge variant="warning" className="absolute top-2 left-2 z-10">
                    {t('pos.lowStock')}
                  </StatusBadge>
                )}
                {inCartQty > 0 && (
                  <span className="absolute top-0 right-0 min-w-6 h-6 px-1 rounded-bl-flo-lg rounded-tr-flo-lg bg-flo-brand-600 text-white text-xs flex items-center justify-center font-bold tabular-nums">
                    {inCartQty}
                  </span>
                )}

                {showProductImages && (
                  <div className="w-full aspect-square rounded-flo-md mb-2 relative overflow-hidden">
                    <div
                      className="absolute inset-0 flex items-center justify-center"
                      style={{ backgroundColor: nameToColor(product.name) }}
                    >
                      <span className="text-2xl font-bold text-white/80">
                        {product.name.substring(0, 2).toUpperCase()}
                      </span>
                    </div>
                    {product.has_image && (
                      <img
                        src={`${api.defaults.baseURL}/products/${product.id}/image?t=${product.updated_at ? parseDbTimestamp(product.updated_at).getTime() : 0}`}
                        alt=""
                        className="absolute inset-0 w-full h-full object-cover rounded-flo-md"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    )}
                    {product.tags && product.tags.length > 0 && (
                      <span className="absolute bottom-1.5 right-1.5 z-10">
                        <TagBadge tag={product.tags[0]} />
                      </span>
                    )}
                  </div>
                )}

                <h3 className="text-body font-medium text-flo-text line-clamp-2 leading-snug text-left">
                  {product.name}
                </h3>
                <div className="flex items-center justify-between mt-1.5 gap-1">
                  <p className="text-numeric text-flo-brand-700">{fmt(Number(product.price))}</p>
                  <div className="flex items-center gap-1 shrink-0">
                    {!showProductImages && product.tags && product.tags.length > 0 && (
                      <TagBadge tag={product.tags[0]} />
                    )}
                    {product.addon_groups && product.addon_groups.length > 0 && (
                      <SlidersHorizontal size={14} className="text-flo-text-muted" aria-hidden />
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
