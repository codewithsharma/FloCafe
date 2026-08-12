'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface PageHeaderProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  context?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  description,
  context,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        'flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-4 md:mb-6',
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="text-h1 text-flo-text truncate">{title}</h1>
        {context ? (
          <p className="text-caption text-flo-text-muted mt-1">{context}</p>
        ) : null}
        {description ? (
          <p className="text-body text-flo-text-secondary mt-1">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </header>
  );
}
