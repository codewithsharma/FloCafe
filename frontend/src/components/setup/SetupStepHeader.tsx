'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

interface SetupStepHeaderProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  note?: React.ReactNode;
  className?: string;
}

export function SetupStepHeader({
  title,
  description,
  icon,
  note,
  className,
}: SetupStepHeaderProps) {
  return (
    <div className={cn('mb-4 space-y-2', className)}>
      <div className="flex items-start gap-3">
        {icon ? (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-flo-md bg-flo-brand-50 text-flo-brand-600">
            {icon}
          </div>
        ) : null}
        <div className="min-w-0">
          <h2 className="text-h3 text-flo-text">{title}</h2>
          {description ? (
            <p className="mt-0.5 text-small text-flo-text-secondary">{description}</p>
          ) : null}
        </div>
      </div>
      {note ? (
        <div className="rounded-flo-md bg-flo-surface-muted px-3 py-2.5 text-caption text-flo-text-secondary">
          {note}
        </div>
      ) : null}
    </div>
  );
}
