'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Inbox } from 'lucide-react';

export interface EmptyStateProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  title,
  description,
  action,
  icon,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex min-h-[200px] flex-col items-center justify-center text-center px-6 py-10',
        className,
      )}
      role="status"
    >
      <div className="mb-3 text-flo-text-muted" aria-hidden>
        {icon ?? <Inbox className="size-10" strokeWidth={1.5} />}
      </div>
      <h3 className="text-h3 text-flo-text">{title}</h3>
      {description ? (
        <p className="text-body text-flo-text-secondary mt-1 max-w-md">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
