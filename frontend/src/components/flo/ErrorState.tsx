'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { AlertCircle } from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';
import { Button } from '@/components/ui/button';

export interface ErrorStateProps {
  title?: React.ReactNode;
  description?: React.ReactNode;
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({
  title,
  description,
  onRetry,
  className,
}: ErrorStateProps) {
  const { t } = useI18n();
  return (
    <div
      className={cn(
        'flex min-h-[200px] flex-col items-center justify-center text-center px-6 py-10',
        className,
      )}
      role="alert"
    >
      <AlertCircle className="size-10 text-flo-danger mb-3" aria-hidden />
      <h3 className="text-h3 text-flo-text">{title ?? t('flo.state.errorTitle')}</h3>
      {description ? (
        <p className="text-body text-flo-text-secondary mt-1 max-w-md">{description}</p>
      ) : (
        <p className="text-body text-flo-text-secondary mt-1 max-w-md">
          {t('flo.state.errorDescription')}
        </p>
      )}
      {onRetry ? (
        <Button type="button" variant="outline" className="mt-4 min-h-11" onClick={onRetry}>
          {t('flo.state.retry')}
        </Button>
      ) : null}
    </div>
  );
}
