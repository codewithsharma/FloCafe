'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type PageFrameVariant = 'standard' | 'wide' | 'full';

export interface PageFrameProps {
  children: ReactNode;
  /** standard ≈ forms/reading; wide ≈ tables/ops (AppShell default); full = no max */
  variant?: PageFrameVariant;
  className?: string;
}

/**
 * Shared content-width contract for non–full-bleed dashboard pages.
 * Keep variants few — do not invent a second layout system.
 */
export function PageFrame({ children, variant = 'wide', className }: PageFrameProps) {
  return (
    <div
      className={cn(
        'flo-page-frame',
        variant === 'standard' && 'flo-page-frame--standard',
        variant === 'wide' && 'flo-page-frame--wide',
        variant === 'full' && 'flo-page-frame--full',
        className,
      )}
    >
      {children}
    </div>
  );
}
