'use client';

import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface SetupNavFooterProps {
  t: (key: string) => string;
  onBack?: () => void;
  onContinue?: () => void;
  continueLabel?: string;
  continueDisabled?: boolean;
  continueLoading?: boolean;
  continueType?: 'button' | 'submit';
  showBack?: boolean;
}

export function SetupNavFooter({
  t,
  onBack,
  onContinue,
  continueLabel,
  continueDisabled = false,
  continueLoading = false,
  continueType = 'button',
  showBack = true,
}: SetupNavFooterProps) {
  return (
    <div className="flex items-center justify-between gap-3">
      {showBack && onBack ? (
        <Button
          type="button"
          variant="ghost"
          onClick={onBack}
          className="min-h-10 shrink-0 px-2 text-flo-text-secondary hover:text-flo-text hover:bg-transparent"
        >
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          {t('setup.back')}
        </Button>
      ) : (
        <span />
      )}

      <Button
        type={continueType}
        onClick={continueType === 'button' ? onContinue : undefined}
        disabled={continueDisabled || continueLoading}
        className="min-h-10 min-w-[8.5rem] flex-1 sm:flex-none"
        size="lg"
      >
        {continueLoading ? t('setup.completingSetup') : (continueLabel ?? t('setup.continue'))}
        {!continueLoading ? <ArrowRight className="ml-1.5 h-4 w-4" /> : null}
      </Button>
    </div>
  );
}
