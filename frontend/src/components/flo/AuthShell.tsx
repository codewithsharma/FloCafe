'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface AuthShellProps {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  backLink?: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
  footer?: React.ReactNode;
  alert?: React.ReactNode;
  className?: string;
}

const maxWidthClass: Record<NonNullable<AuthShellProps['maxWidth']>, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
};

export function AuthShell({
  title,
  subtitle,
  icon,
  backLink,
  maxWidth = 'md',
  children,
  footer,
  alert,
  className,
}: AuthShellProps) {
  return (
    <div className={cn('relative min-h-screen overflow-x-hidden bg-flo-bg', className)}>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 80% 50% at 50% -10%, rgba(232, 93, 4, 0.14), transparent 55%), radial-gradient(ellipse 60% 40% at 100% 100%, rgba(194, 65, 12, 0.08), transparent 50%), radial-gradient(ellipse 50% 35% at 0% 80%, rgba(232, 93, 4, 0.05), transparent 45%)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.3]"
        style={{
          backgroundImage:
            'radial-gradient(circle at 1px 1px, rgba(41, 37, 36, 0.05) 1px, transparent 0)',
          backgroundSize: '22px 22px',
        }}
      />

      <div
        className={cn(
          'relative mx-auto flex min-h-screen w-full flex-col justify-center px-4 py-8 sm:px-6 sm:py-10',
          maxWidthClass[maxWidth],
        )}
      >
        {backLink ? <div className="mb-4">{backLink}</div> : null}

        {(title || subtitle || icon) && (
          <header className="mb-6 text-center">
            {icon ? (
              <div className="mb-3 flex justify-center">{icon}</div>
            ) : (
              <img src="/logo.png" alt="OPERAVIA" width={88} height={58} className="mx-auto mb-4" />
            )}
            {title ? <h1 className="text-h1 text-flo-text">{title}</h1> : null}
            {subtitle ? (
              <p className="mx-auto mt-1.5 max-w-md text-body text-flo-text-secondary">
                {subtitle}
              </p>
            ) : null}
          </header>
        )}

        {alert ? <div className="mb-4">{alert}</div> : null}

        <section className="rounded-flo-xl border border-flo-border/80 bg-flo-surface/95 shadow-[0_12px_40px_rgba(41,37,36,0.06)] backdrop-blur-sm">
          <div className="px-4 py-5 sm:px-6 sm:py-6">{children}</div>
          {footer ? (
            <div className="border-t border-flo-border px-4 py-4 sm:px-6">{footer}</div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
