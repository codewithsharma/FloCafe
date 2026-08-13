'use client';

import { Package, Folder, Puzzle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ProductsTabType } from './types';

export interface ProductsTabBarProps {
  activeTab: ProductsTabType;
  onTabChange: (tab: ProductsTabType) => void;
  /** Additive product options — gated by Opervia `addons` module. */
  addonsEnabled: boolean;
  labels: {
    products: string;
    categories: string;
    addonGroups: string;
  };
}

const tabs: { id: ProductsTabType; icon: typeof Package; requiresAddons?: boolean }[] = [
  { id: 'products', icon: Package },
  { id: 'categories', icon: Folder },
  { id: 'addons', icon: Puzzle, requiresAddons: true },
];

export function ProductsTabBar({
  activeTab,
  onTabChange,
  addonsEnabled,
  labels,
}: ProductsTabBarProps) {
  const labelFor = (id: ProductsTabType) => {
    if (id === 'products') return labels.products;
    if (id === 'categories') return labels.categories;
    return labels.addonGroups;
  };

  return (
    <nav
      className="flex gap-1 mb-6 border-b border-flo-border"
      aria-label="Menu inventory sections"
    >
      {tabs.map(({ id, icon: Icon, requiresAddons }) => {
        if (requiresAddons && !addonsEnabled) return null;
        const active = activeTab === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onTabChange(id)}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 text-small font-medium border-b-2 -mb-px min-h-11 transition-colors',
              active
                ? 'border-flo-brand-600 text-flo-brand-700'
                : 'border-transparent text-flo-text-secondary hover:text-flo-text',
            )}
          >
            <Icon size={16} aria-hidden />
            {labelFor(id)}
          </button>
        );
      })}
    </nav>
  );
}
