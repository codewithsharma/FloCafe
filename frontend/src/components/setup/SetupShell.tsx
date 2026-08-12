'use client';

import * as React from 'react';
import { SetupProgress } from './SetupProgress';

interface SetupShellProps {
  step: number;
  title: string;
  tagline: string;
  t: (key: string) => string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export function SetupShell({
  step,
  title,
  tagline,
  t,
  children,
  footer,
}: SetupShellProps) {
  return (
    <div className="relative min-h-screen overflow-x-hidden bg-flo-bg">
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

      <div className="relative mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center px-4 py-8 sm:px-6 sm:py-10">
        <header className="mb-5 text-center sm:mb-6">
          <img
            src="/logo.png"
            alt="Flo POS"
            width={88}
            height={58}
            className="mx-auto mb-4"
          />
          <h1 className="text-[1.75rem] font-semibold tracking-tight text-flo-text sm:text-[2rem]">
            {title}
          </h1>
          <p className="mx-auto mt-1.5 max-w-md text-small text-flo-text-secondary">
            {tagline}
          </p>
        </header>

        <div className="mb-4">
          <SetupProgress step={step} t={t} />
        </div>

        <section className="rounded-flo-xl border border-flo-border/80 bg-flo-surface/95 shadow-[0_12px_40px_rgba(41,37,36,0.06)] backdrop-blur-sm">
          <div className="px-4 py-5 sm:px-6 sm:py-6">{children}</div>
          {footer ? (
            <div className="border-t border-flo-border px-4 py-4 sm:px-6">
              {footer}
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
