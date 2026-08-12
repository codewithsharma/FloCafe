'use client';

import { Download, Loader2, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useI18n } from '@/hooks/useI18n';

export interface PrintConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isReprint: boolean;
  printing: boolean;
  previewing: boolean;
  onPrint: () => void;
  onDownloadPreview: () => void;
}

export function PrintConfirmDialog({
  open,
  onOpenChange,
  isReprint,
  printing,
  previewing,
  onPrint,
  onDownloadPreview,
}: PrintConfirmDialogProps) {
  const { t } = useI18n();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-flo-border bg-flo-surface sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-flo-text">
            {isReprint ? t('orders.reprintReceiptTitle') : t('orders.printReceiptTitle')}
          </DialogTitle>
        </DialogHeader>
        <p className="text-small text-flo-text-secondary">
          {isReprint ? t('orders.reprintReceiptWarning') : t('orders.printReceiptConfirm')}
        </p>
        <DialogFooter className="gap-2 sm:justify-end">
          <Button variant="outline" className="min-h-11" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="outline"
            className="min-h-11 w-11 px-0"
            onClick={onDownloadPreview}
            disabled={previewing}
            title={t('orders.downloadPrintPreview')}
            aria-label={t('orders.downloadPrintPreview')}
          >
            {previewing ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
          </Button>
          <Button className="min-h-11" onClick={onPrint} disabled={printing}>
            <Printer size={14} className="mr-1.5" />
            {printing
              ? t('orders.printing')
              : isReprint
                ? t('orders.confirmReprint')
                : t('orders.confirmPrint')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
