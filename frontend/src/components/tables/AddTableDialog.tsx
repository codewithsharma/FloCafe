'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useI18n } from '@/hooks/useI18n';

export interface AddTableFormState {
  name: string;
  capacity: string;
  floor: string;
  section: string;
}

export interface AddTableDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: AddTableFormState;
  onFormChange: (form: AddTableFormState) => void;
  onSubmit: (e: React.FormEvent) => void;
}

export function AddTableDialog({
  open,
  onOpenChange,
  form,
  onFormChange,
  onSubmit,
}: AddTableDialogProps) {
  const { t } = useI18n();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-flo-border bg-flo-surface sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-flo-text">{t('tables.add')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-small font-medium text-flo-text mb-1">
              {t('tables.tableName')}
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => onFormChange({ ...form, name: e.target.value })}
              placeholder={t('tables.tableNamePlaceholder')}
              className="w-full px-3 py-2 border border-flo-border rounded-flo-md outline-none focus:ring-2 focus:ring-flo-brand-500 min-h-11"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-small font-medium text-flo-text mb-1">
                {t('tables.capacity')}
              </label>
              <input
                type="number"
                min="1"
                value={form.capacity}
                onChange={(e) => onFormChange({ ...form, capacity: e.target.value })}
                className="w-full px-3 py-2 border border-flo-border rounded-flo-md outline-none focus:ring-2 focus:ring-flo-brand-500 min-h-11"
                required
              />
            </div>
            <div>
              <label className="block text-small font-medium text-flo-text mb-1">
                {t('tables.floor')}
              </label>
              <input
                type="text"
                value={form.floor}
                onChange={(e) => onFormChange({ ...form, floor: e.target.value })}
                className="w-full px-3 py-2 border border-flo-border rounded-flo-md outline-none focus:ring-2 focus:ring-flo-brand-500 min-h-11"
              />
            </div>
          </div>
          <Button type="submit" className="w-full min-h-11">
            {t('tables.createTable')}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
