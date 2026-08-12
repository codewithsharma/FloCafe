'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import type { StatusBadgeVariant } from '@/lib/flo-display';

export interface StatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: StatusBadgeVariant;
  dot?: boolean;
}

const variantClasses: Record<StatusBadgeVariant, string> = {
  default: 'bg-flo-brand-50 text-flo-brand-700',
  success: 'bg-flo-success-subtle text-flo-success',
  warning: 'bg-flo-warning-subtle text-flo-warning',
  danger: 'bg-flo-danger-subtle text-flo-danger',
  info: 'bg-flo-info-subtle text-flo-info',
  secondary: 'bg-flo-bg text-flo-text-secondary',
};

const dotClasses: Record<StatusBadgeVariant, string> = {
  default: 'bg-flo-brand-500',
  success: 'bg-flo-success',
  warning: 'bg-flo-warning',
  danger: 'bg-flo-danger',
  info: 'bg-flo-info',
  secondary: 'bg-flo-text-muted',
};

export function StatusBadge({
  variant = 'default',
  dot = false,
  className,
  children,
  ...props
}: StatusBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center gap-1.5 rounded-flo-full px-2 text-caption font-medium',
        variantClasses[variant],
        className,
      )}
      {...props}
    >
      {dot ? (
        <span
          className={cn('size-1.5 rounded-full shrink-0', dotClasses[variant])}
          aria-hidden
        />
      ) : null}
      {children}
    </span>
  );
}
