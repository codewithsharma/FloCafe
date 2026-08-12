'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { useFormatCurrency } from '@/hooks/useFormatCurrency';
import { moneySizeClass, type MoneyDisplaySize } from '@/lib/flo-display';

export interface MoneyDisplayProps {
  /** Amount in integer cents */
  cents: number;
  size?: MoneyDisplaySize;
  className?: string;
  /** When true, show leading + for positive values */
  showSign?: boolean;
}

export function MoneyDisplay({
  cents,
  size = 'md',
  className,
  showSign = false,
}: MoneyDisplayProps) {
  const formatCurrency = useFormatCurrency();
  const major = cents / 100;
  const formatted = formatCurrency(Math.abs(major));
  const sign = showSign && cents > 0 ? '+' : cents < 0 ? '−' : '';
  const value = cents < 0 || (showSign && cents > 0)
    ? `${sign}${formatted}`
    : formatted;

  return (
    <span
      className={cn(moneySizeClass(size), 'tabular-nums text-flo-text', className)}
      data-cents={cents}
    >
      {value}
    </span>
  );
}
