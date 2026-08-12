'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { useFormatCurrency } from '@/hooks/useFormatCurrency';
import { useI18n } from '@/hooks/useI18n';
import { varianceTone } from '@/lib/flo-display';
import { TrendingDown, TrendingUp, Minus, HelpCircle } from 'lucide-react';

export interface VarianceIndicatorProps {
  /** Variance in integer cents (null/undefined = unknown) */
  cents: number | null | undefined;
  className?: string;
  compact?: boolean;
}

export function VarianceIndicator({
  cents,
  className,
  compact = false,
}: VarianceIndicatorProps) {
  const { t } = useI18n();
  const formatCurrency = useFormatCurrency();
  const tone = varianceTone(cents);

  const toneClass =
    tone === 'balanced'
      ? 'text-flo-success bg-flo-success-subtle'
      : tone === 'over'
        ? 'text-flo-success bg-flo-success-subtle'
        : tone === 'short'
          ? 'text-flo-danger bg-flo-danger-subtle'
          : 'text-flo-text-muted bg-flo-bg';

  const Icon =
    tone === 'over'
      ? TrendingUp
      : tone === 'short'
        ? TrendingDown
        : tone === 'balanced'
          ? Minus
          : HelpCircle;

  let label: string;
  if (tone === 'unknown' || cents === null || cents === undefined) {
    label = t('flo.variance.unknown');
  } else if (tone === 'balanced') {
    label = t('flo.variance.balanced');
  } else if (tone === 'over') {
    label = t('flo.variance.over', { amount: formatCurrency(cents / 100) });
  } else {
    label = t('flo.variance.short', { amount: formatCurrency(Math.abs(cents) / 100) });
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-flo-full px-2.5 py-1 text-small font-medium tabular-nums',
        toneClass,
        className,
      )}
      role="status"
      aria-label={label}
      data-tone={tone}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden />
      {!compact ? label : tone === 'unknown' ? '—' : label}
    </span>
  );
}
