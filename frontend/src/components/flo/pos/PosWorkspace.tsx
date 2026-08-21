'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface PosWorkspaceProps {
  toolbar: ReactNode;
  workspace: ReactNode;
  orderPanel: ReactNode;
  mobileOrder?: ReactNode;
  className?: string;
}

/**
 * POS layout shell: product discovery workspace + order panel.
 * Cart width uses Flo V1 tokens (min/max clamp) — not a fixed 320px.
 * Full-bleed within AppShell; no business logic.
 */
export function PosWorkspace({
  toolbar,
  workspace,
  orderPanel,
  mobileOrder,
  className,
}: PosWorkspaceProps) {
  return (
    <div className={cn('flex flex-col flex-1 min-h-0 overflow-hidden bg-flo-bg', className)}>
      {toolbar}
      <div className="flex flex-1 min-h-0 overflow-hidden gap-3 md:gap-4 px-3 md:px-4 pb-3 md:pb-4 pt-0">
        <div className="flex flex-1 min-w-0 flex flex-col overflow-hidden">{workspace}</div>
        <aside
          data-testid="pos-order-panel"
          className="hidden md:flex shrink-0 h-full min-h-0 overflow-hidden w-[clamp(var(--flo-pos-cart-min),28vw,var(--flo-pos-cart-max))]"
          aria-label="Current order"
        >
          {orderPanel}
        </aside>
      </div>
      {mobileOrder}
    </div>
  );
}

export default PosWorkspace;
