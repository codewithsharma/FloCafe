'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';

export interface LoadingStateProps {
  label?: React.ReactNode;
  className?: string;
}

export function LoadingState({ label, className }: LoadingStateProps) {
  const { t } = useI18n();
  return (
    <div
      className={cn(
        'flex min-h-[160px] flex-col items-center justify-center gap-3 px-6 py-8 text-flo-text-secondary',
        className,
      )}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <Loader2 className="size-6 animate-spin text-flo-brand-600" aria-hidden />
      <p className="text-body">{label ?? t('flo.state.loading')}</p>
    </div>
  );
}
