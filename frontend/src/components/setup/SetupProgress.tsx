'use client';

import { cn } from '@/lib/utils';
import { SETUP_STEP_COUNT, SETUP_STEP_KEYS } from './types';

interface SetupProgressProps {
  step: number;
  t: (key: string) => string;
}

export function SetupProgress({ step, t }: SetupProgressProps) {
  const label = t(SETUP_STEP_KEYS[step - 1] ?? SETUP_STEP_KEYS[0]);

  return (
    <div className="space-y-2" aria-label={t('setup.progressLabel')}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-small font-medium text-flo-text">{label}</p>
        <p className="text-caption text-flo-text-muted">
          {t('setup.stepOf')
            .replace('{current}', String(step))
            .replace('{total}', String(SETUP_STEP_COUNT))}
        </p>
      </div>
      <div className="flex gap-1.5" role="list">
        {Array.from({ length: SETUP_STEP_COUNT }, (_, index) => {
          const stepNumber = index + 1;
          const done = stepNumber < step;
          const active = stepNumber === step;
          return (
            <div
              key={stepNumber}
              role="listitem"
              aria-current={active ? 'step' : undefined}
              className={cn(
                'h-1.5 flex-1 rounded-full transition-colors duration-[var(--flo-duration-fast)]',
                done || active ? 'bg-flo-brand-600' : 'bg-flo-border',
              )}
            />
          );
        })}
      </div>
    </div>
  );
}
