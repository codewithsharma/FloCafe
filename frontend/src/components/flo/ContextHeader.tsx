'use client';

import * as React from 'react';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { useI18n } from '@/hooks/useI18n';
import { cn } from '@/lib/utils';

export interface ContextHeaderProps {
  /** Optional compact route label — prefer PageHeader for the page h1 */
  title?: React.ReactNode;
  context?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  meta?: React.ReactNode;
  className?: string;
}

/**
 * Sticky shell chrome for the Flo AppShell content column.
 * Owns navigation affordance (SidebarTrigger) + status context — not the page h1.
 * Page titles belong on PageHeader.
 */
export function ContextHeader({
  title,
  context,
  description,
  actions,
  meta,
  className,
}: ContextHeaderProps) {
  const { t } = useI18n();

  return (
    <header
      className={cn(
        'sticky top-0 z-[10] flex h-14 shrink-0 items-center gap-2 border-b border-flo-border bg-flo-surface/95 backdrop-blur supports-[backdrop-filter]:bg-flo-surface/90',
        'px-[length:var(--flo-page-pad-x)]',
        className,
      )}
    >
      <SidebarTrigger
        className="min-h-[var(--flo-touch-min)] min-w-[var(--flo-touch-min)] size-[var(--flo-touch-min)] shrink-0 text-flo-text"
        aria-label={t('nav.toggleSidebar')}
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          {title ? (
            <p className="text-body font-medium text-flo-text-secondary truncate">{title}</p>
          ) : null}
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
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
