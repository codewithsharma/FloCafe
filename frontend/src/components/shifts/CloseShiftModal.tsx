'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useI18n } from '@/hooks/useI18n';
import { parseCurrencyInputToCents } from '@/lib/money';
import { closeShift, mapShiftMutationError, type Shift } from '@/lib/shifts';
import ShiftReconciliationPreviewStrip from './ShiftReconciliationPreviewStrip';

const MAX_NOTE_LENGTH = 500;

interface CloseShiftModalProps {
  open: boolean;
  shift: Shift | null;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => Promise<void>;
}

export default function CloseShiftModal({ open, shift, onOpenChange, onSuccess }: CloseShiftModalProps) {
  const { t } = useI18n();
  const [countedCash, setCountedCash] = useState('');
  const [closingNote, setClosingNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setCountedCash('');
    setClosingNote('');
    setError(null);
    setSubmitting(false);
  };

  const handleClose = () => {
    if (submitting) return;
    reset();
    onOpenChange(false);
  };

  const handleSubmit = async () => {
    if (submitting || !shift) return;
    setError(null);

    const parsed = parseCurrencyInputToCents(countedCash);
    if (!parsed.ok) {
      setError(
        parsed.error === 'empty'
          ? t('shift.errorCountedCashRequired')
          : t('shift.errorInvalidAmount'),
      );
      return;
    }

    const note = closingNote.trim();
    if (note.length > MAX_NOTE_LENGTH) {
      setError(t('shift.errorNoteTooLong'));
      return;
    }

    setSubmitting(true);
    try {
      await closeShift(shift.id, {
        counted_cash_cents: parsed.cents,
        closing_note: note || null,
      });
      toast.success(t('shift.closeSuccess'));
      reset();
      onOpenChange(false);
      await onSuccess();
    } catch (err) {
      setError(mapShiftMutationError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && handleClose()}>
      <DialogContent className="border-flo-border bg-flo-surface sm:max-w-md" showCloseButton={!submitting}>
        <DialogHeader>
          <DialogTitle className="text-flo-text">{t('shift.closeTitle')}</DialogTitle>
          <DialogDescription className="text-flo-text-secondary">{t('shift.closeDescription')}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <ShiftReconciliationPreviewStrip
            shiftId={shift?.id ?? null}
            active={open}
            countedCash={countedCash}
            showLiveVariance
          />
          <div className="grid gap-2">
            <Label htmlFor="shift-counted-cash">{t('shift.countedCash')}</Label>
            <Input
              id="shift-counted-cash"
              inputMode="decimal"
              autoComplete="off"
              value={countedCash}
              onChange={(e) => setCountedCash(e.target.value)}
              placeholder="0.00"
              disabled={submitting}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="shift-closing-note">{t('shift.closingNote')}</Label>
            <Input
              id="shift-closing-note"
              value={closingNote}
              onChange={(e) => setClosingNote(e.target.value)}
              placeholder={t('shift.noteOptional')}
              maxLength={MAX_NOTE_LENGTH}
              disabled={submitting}
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-flo-danger">{error}</p>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" className="min-h-11" onClick={handleClose} disabled={submitting}>
            {t('common.cancel')}
          </Button>
          <Button type="button" className="min-h-11" onClick={() => void handleSubmit()} disabled={submitting || !shift}>
            {submitting ? t('common.saving') : t('shift.closeAction')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
