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
 * POS layout shell: product discovery workspace + fixed order panel.
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
        <div className="flex flex-1 min-w-0 flex flex-col overflow-hidden">
          {workspace}
        </div>
        <aside
          className="hidden md:flex w-[320px] shrink-0 h-full min-h-0 overflow-hidden"
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
