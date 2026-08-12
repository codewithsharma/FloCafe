'use client';

import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface AttentionItem {
  id: string;
  label: string;
  detail?: string;
  href: string;
  variant: 'warning' | 'info' | 'danger' | 'success';
  icon?: LucideIcon;
}

export interface AttentionStripProps {
  items: AttentionItem[];
  title: string;
  className?: string;
}

/**
 * Surfaces operational items that may need action now.
 * Hidden when items array is empty.
 */
export function AttentionStrip({ items, title, className }: AttentionStripProps) {
  if (items.length === 0) return null;

  return (
    <section
      className={cn(
        'mb-6 rounded-flo-lg border border-flo-warning/30 bg-flo-warning-subtle/30 p-4',
        className,
      )}
      aria-label={title}
    >
      <h2 className="text-caption font-semibold uppercase tracking-wide text-flo-text-secondary mb-3">
        {title}
      </h2>
      <ul className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {items.map((item) => (
          <li key={item.id}>
            <Link
              href={item.href}
              className={cn(
                'flex min-h-11 items-center gap-2 rounded-flo-md border border-flo-border bg-flo-surface px-3 py-2',
                'text-body text-flo-text transition-colors hover:border-flo-brand-500',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flo-brand-500 focus-visible:ring-offset-2',
              )}
            >
              {item.icon ? <item.icon className="size-4 shrink-0 text-flo-text-secondary" aria-hidden /> : null}
              <span className="font-medium">{item.label}</span>
              {item.detail ? (
                <span className="text-small text-flo-text-muted">{item.detail}</span>
              ) : null}
              <ChevronRight className="ml-auto size-4 shrink-0 text-flo-text-muted" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
