'use client';

import * as React from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SetupOptionCardProps {
  selected: boolean;
  onSelect: () => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  details?: React.ReactNode;
  badge?: React.ReactNode;
  icon?: React.ReactNode;
  compact?: boolean;
  className?: string;
}

export function SetupOptionCard({
  selected,
  onSelect,
  title,
  description,
  details,
  badge,
  icon,
  compact = false,
  className,
}: SetupOptionCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        'w-full rounded-flo-md border text-left transition-colors duration-[var(--flo-duration-fast)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flo-brand-500 focus-visible:ring-offset-2',
        compact ? 'px-3 py-2.5' : 'px-3.5 py-3',
        selected
          ? 'border-flo-brand-600 bg-flo-brand-50/80'
          : 'border-flo-border bg-flo-surface hover:border-flo-border-strong hover:bg-flo-surface-muted/60',
        className,
      )}
    >
      <div className="flex items-start gap-2.5">
        {icon ? (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-flo-md bg-flo-brand-50 text-flo-brand-600">
            {icon}
          </div>
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-body font-semibold text-flo-text">{title}</span>
            {badge}
          </div>
          {description ? (
            <p className="mt-0.5 text-caption text-flo-text-secondary">{description}</p>
          ) : null}
          {details ? (
            <p className="mt-1 text-caption text-flo-text-muted">{details}</p>
          ) : null}
        </div>
        {selected ? (
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-flo-brand-600" aria-hidden />
        ) : null}
      </div>
    </button>
  );
}
