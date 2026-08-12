'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface ContextHeaderProps {
  title: React.ReactNode;
  context?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  meta?: React.ReactNode;
  className?: string;
}

/**
 * Compact context header for the Flo AppShell content column.
 * Prefer operational context over dashboard chrome.
 */
export function ContextHeader({
  title,
  context,
  description,
  actions,
  meta,
  className,
}: ContextHeaderProps) {
  return (
    <header
      className={cn(
        'sticky top-0 z-[10] flex h-14 shrink-0 items-center gap-3 border-b border-flo-border bg-flo-surface/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-flo-surface/90',
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <h1 className="text-h3 text-flo-text truncate">{title}</h1>
          {context ? (
            <span className="text-caption text-flo-text-muted truncate">{context}</span>
          ) : null}
        </div>
        {description ? (
          <p className="text-caption text-flo-text-secondary truncate mt-0.5">{description}</p>
        ) : null}
      </div>
      {meta ? (
        <div className="hidden sm:flex shrink-0 items-center gap-2 text-caption text-flo-text-muted">
          {meta}
        </div>
      ) : null}
      {actions ? (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      ) : null}
    </header>
  );
}
