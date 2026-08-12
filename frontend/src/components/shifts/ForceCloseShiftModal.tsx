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
import { forceCloseShift, mapShiftMutationError, type Shift } from '@/lib/shifts';

const MAX_NOTE_LENGTH = 500;
const MAX_REASON_LENGTH = 500;

interface ForceCloseShiftModalProps {
  open: boolean;
  shift: Shift | null;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => Promise<void>;
}

export default function ForceCloseShiftModal({
  open,
  shift,
  onOpenChange,
  onSuccess,
}: ForceCloseShiftModalProps) {
  const { t } = useI18n();
  const [reason, setReason] = useState('');
  const [countedCash, setCountedCash] = useState('');
  const [closingNote, setClosingNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setReason('');
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

    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      setError(t('shift.errorForceCloseReasonRequired'));
      return;
    }
    if (trimmedReason.length > MAX_REASON_LENGTH) {
      setError(t('shift.errorReasonTooLong'));
      return;
    }

    let countedCashCents: number | null = null;
    if (countedCash.trim()) {
      const parsed = parseCurrencyInputToCents(countedCash);
      if (!parsed.ok) {
        setError(t('shift.errorInvalidAmount'));
        return;
      }
      countedCashCents = parsed.cents;
    }

    const note = closingNote.trim();
    if (note.length > MAX_NOTE_LENGTH) {
      setError(t('shift.errorNoteTooLong'));
      return;
    }

    setSubmitting(true);
    try {
      await forceCloseShift(shift.id, {
        reason: trimmedReason,
        counted_cash_cents: countedCashCents,
        closing_note: note || null,
      });
      toast.success(t('shift.forceCloseSuccess'));
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
      <DialogContent className="sm:max-w-md" showCloseButton={!submitting}>
        <DialogHeader>
          <DialogTitle>{t('shift.forceCloseTitle')}</DialogTitle>
          <DialogDescription>{t('shift.forceCloseDescription')}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="shift-force-close-reason">{t('shift.forceCloseReason')}</Label>
            <Input
              id="shift-force-close-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t('shift.forceCloseReasonPlaceholder')}
              maxLength={MAX_REASON_LENGTH}
              disabled={submitting}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="shift-force-counted-cash">{t('shift.countedCash')}</Label>
            <Input
              id="shift-force-counted-cash"
              inputMode="decimal"
              autoComplete="off"
              value={countedCash}
              onChange={(e) => setCountedCash(e.target.value)}
              placeholder={t('shift.noteOptional')}
              disabled={submitting}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="shift-force-closing-note">{t('shift.closingNote')}</Label>
            <Input
              id="shift-force-closing-note"
              value={closingNote}
              onChange={(e) => setClosingNote(e.target.value)}
              placeholder={t('shift.noteOptional')}
              maxLength={MAX_NOTE_LENGTH}
              disabled={submitting}
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-red-600">{error}</p>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleClose} disabled={submitting}>
            {t('common.cancel')}
          </Button>
          <Button type="button" variant="destructive" onClick={() => void handleSubmit()} disabled={submitting || !shift}>
            {submitting ? t('common.saving') : t('shift.forceCloseAction')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
