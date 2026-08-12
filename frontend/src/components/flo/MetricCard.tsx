'use client';

import * as React from 'react';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export type MetricCardVariant = 'default' | 'success' | 'warning' | 'info';

export interface MetricCardProps {
  label: React.ReactNode;
  value: React.ReactNode;
  icon?: LucideIcon;
  href?: string;
  variant?: MetricCardVariant;
  className?: string;
}

const variantStyles: Record<MetricCardVariant, string> = {
  default: 'border-flo-border hover:border-flo-brand-500',
  success: 'border-flo-success/20 bg-flo-success-subtle/40 hover:border-flo-success/40',
  warning: 'border-flo-warning/20 bg-flo-warning-subtle/40 hover:border-flo-warning/40',
  info: 'border-flo-info/20 bg-flo-info-subtle/40 hover:border-flo-info/40',
};

const iconStyles: Record<MetricCardVariant, string> = {
  default: 'text-flo-brand-600',
  success: 'text-flo-success',
  warning: 'text-flo-warning',
  info: 'text-flo-info',
};

export function MetricCard({
  label,
  value,
  icon: Icon,
  href,
  variant = 'default',
  className,
}: MetricCardProps) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="text-caption text-flo-text-secondary">{label}</span>
        {Icon ? <Icon className={cn('size-4 shrink-0', iconStyles[variant])} aria-hidden /> : null}
      </div>
      <div className="text-numeric-lg text-flo-text">{value}</div>
    </>
  );

  const classes = cn(
    'block rounded-flo-lg border bg-flo-surface p-4 min-h-[88px] transition-colors duration-[var(--flo-duration-fast)]',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flo-brand-500 focus-visible:ring-offset-2',
    variantStyles[variant],
    href && 'hover:bg-flo-surface-raised cursor-pointer',
    className,
  );

  if (href) {
    return (
      <Link href={href} className={classes}>
        {body}
      </Link>
    );
  }

  return <div className={classes}>{body}</div>;
}
