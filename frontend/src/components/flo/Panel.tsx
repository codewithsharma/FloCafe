'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export type PanelVariant = 'default' | 'compact' | 'interactive';

export interface PanelProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  variant?: PanelVariant;
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  footer?: React.ReactNode;
}

export function Panel({
  className,
  variant = 'default',
  title,
  description,
  actions,
  footer,
  children,
  ...props
}: PanelProps) {
  const interactive = variant === 'interactive';
  const compact = variant === 'compact';

  return (
    <div
      className={cn(
        'bg-flo-surface border border-flo-border rounded-flo-lg text-flo-text',
        compact ? 'p-3' : 'p-4 md:p-6',
        interactive && 'transition-colors duration-[var(--flo-duration-fast)] hover:border-flo-brand-500 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flo-brand-500 focus-visible:ring-offset-2',
        className,
      )}
      {...props}
    >
      {(title || description || actions) && (
        <div className={cn('flex items-start justify-between gap-3', children || footer ? 'mb-3' : '')}>
          <div className="min-w-0">
            {title ? <h3 className="text-h3 truncate">{title}</h3> : null}
            {description ? (
              <p className="text-small text-flo-text-secondary mt-0.5">{description}</p>
            ) : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </div>
      )}
      {children}
      {footer ? (
        <div className={cn('border-t border-flo-border pt-3', children ? 'mt-4' : '')}>
          {footer}
        </div>
      ) : null}
    </div>
  );
}
