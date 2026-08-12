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
import { mapShiftMutationError, openShift } from '@/lib/shifts';

const MAX_NOTE_LENGTH = 500;

interface OpenShiftModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => Promise<void>;
}

export default function OpenShiftModal({ open, onOpenChange, onSuccess }: OpenShiftModalProps) {
  const { t } = useI18n();
  const [openingFloat, setOpeningFloat] = useState('');
  const [openingNote, setOpeningNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setOpeningFloat('');
    setOpeningNote('');
    setError(null);
    setSubmitting(false);
  };

  const handleClose = () => {
    if (submitting) return;
    reset();
    onOpenChange(false);
  };

  const handleSubmit = async () => {
    if (submitting) return;
    setError(null);

    const parsed = parseCurrencyInputToCents(openingFloat);
    if (!parsed.ok) {
      setError(
        parsed.error === 'empty'
          ? t('shift.errorOpeningFloatRequired')
          : t('shift.errorInvalidAmount'),
      );
      return;
    }

    const note = openingNote.trim();
    if (note.length > MAX_NOTE_LENGTH) {
      setError(t('shift.errorNoteTooLong'));
      return;
    }

    setSubmitting(true);
    try {
      await openShift({
        opening_float_cents: parsed.cents,
        opening_note: note || null,
      });
      toast.success(t('shift.openSuccess'));
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
          <DialogTitle className="text-flo-text">{t('shift.openTitle')}</DialogTitle>
          <DialogDescription className="text-flo-text-secondary">{t('shift.openDescription')}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="shift-opening-float">{t('shift.openingFloat')}</Label>
            <Input
              id="shift-opening-float"
              inputMode="decimal"
              autoComplete="off"
              value={openingFloat}
              onChange={(e) => setOpeningFloat(e.target.value)}
              placeholder="0.00"
              disabled={submitting}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="shift-opening-note">{t('shift.openingNote')}</Label>
            <Input
              id="shift-opening-note"
              value={openingNote}
              onChange={(e) => setOpeningNote(e.target.value)}
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
          <Button type="button" className="min-h-11" onClick={() => void handleSubmit()} disabled={submitting}>
            {submitting ? t('common.saving') : t('shift.openAction')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
