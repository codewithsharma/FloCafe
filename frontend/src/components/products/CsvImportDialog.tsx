'use client';

import { AlertCircle, CheckCircle, Download, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useI18n } from '@/hooks/useI18n';

export interface CsvImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  csvType: 'categories' | 'products' | 'addons';
  csvFile: File | null;
  onCsvFileChange: (file: File | null) => void;
  csvResult: Record<string, unknown> | null;
  csvUploading: boolean;
  onDownload: (path: string, filename: string) => void;
  onUpload: () => void;
}

export function CsvImportDialog({
  open,
  onOpenChange,
  csvType,
  csvFile,
  onCsvFileChange,
  csvResult,
  csvUploading,
  onDownload,
  onUpload,
}: CsvImportDialogProps) {
  const { t } = useI18n();

  const typeLabel =
    csvType === 'categories'
      ? t('products.tabCategories')
      : csvType === 'products'
        ? t('products.tabProducts')
        : t('products.tabAddonGroups');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-flo-border bg-flo-surface sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-flo-text">
            {t('products.csvModalTitle', { type: typeLabel })}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <div className="bg-flo-surface-muted rounded-flo-md p-4 space-y-3">
            <p className="text-small font-medium text-flo-text">{t('products.download')}</p>
            <div className="flex gap-3 flex-wrap">
              <button
                type="button"
                onClick={() => onDownload(`/menu-csv/template/${csvType}`, `${csvType}-template.csv`)}
                className="flex items-center gap-2 px-4 py-2 min-h-11 text-small border border-flo-border rounded-flo-md bg-flo-surface hover:bg-flo-surface-muted font-medium text-flo-text"
              >
                <Download size={14} /> {t('products.csvBlankTemplate')}
              </button>
              <button
                type="button"
                onClick={() => onDownload(`/menu-csv/export/${csvType}`, `${csvType}-export.csv`)}
                className="flex items-center gap-2 px-4 py-2 min-h-11 text-small border border-flo-border rounded-flo-md bg-flo-surface hover:bg-flo-surface-muted font-medium text-flo-text"
              >
                <Download size={14} /> {t('products.csvCurrentData')}
              </button>
            </div>
            {csvType === 'products' && (
              <p className="text-xs text-flo-text-muted">{t('products.csvProductsHelp')}</p>
            )}
            {csvType === 'categories' && (
              <p className="text-xs text-flo-text-muted">{t('products.csvCategoriesHelp')}</p>
            )}
            {csvType === 'addons' && (
              <p className="text-xs text-flo-text-muted">{t('products.csvAddonsHelp')}</p>
            )}
          </div>

          <div className="space-y-3">
            <p className="text-small font-medium text-flo-text">{t('products.uploadCsv')}</p>
            <label className="flex flex-col items-center justify-center w-full h-28 border-2 border-dashed border-flo-border rounded-flo-md cursor-pointer hover:bg-flo-surface-muted transition-colors">
              <Upload size={20} className="text-flo-text-muted mb-1" />
              <span className="text-small text-flo-text-secondary">
                {csvFile ? csvFile.name : t('products.csvChooseFile')}
              </span>
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  onCsvFileChange(e.target.files?.[0] ?? null);
                }}
              />
            </label>
            {csvFile && (
              <Button onClick={onUpload} disabled={csvUploading} className="w-full min-h-11">
                {csvUploading ? t('products.csvImporting') : t('common.import')}
              </Button>
            )}
          </div>

          {csvResult && (
            <div className="rounded-flo-md border border-flo-border overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 bg-green-50 border-b border-flo-border">
                <CheckCircle size={15} className="text-green-600" />
                <span className="text-small font-medium text-green-800">{t('products.importComplete')}</span>
              </div>
              <div className="px-4 py-3 text-small text-flo-text-secondary space-y-1">
                {csvType === 'addons' ? (
                  <>
                    <p>
                      {t('products.csvGroupsCreated')}{' '}
                      <span className="font-medium text-flo-text">{String(csvResult.groups_created ?? 0)}</span>
                    </p>
                    <p>
                      {t('products.csvAddonsCreated')}{' '}
                      <span className="font-medium text-flo-text">{String(csvResult.addons_created ?? 0)}</span>
                    </p>
                  </>
                ) : (
                  <p>
                    {t('common.created')}{' '}
                    <span className="font-medium text-flo-text">{String(csvResult.created ?? 0)}</span>
                  </p>
                )}
                <p>
                  {t('common.skipped')}{' '}
                  <span className="font-medium text-flo-text">{String(csvResult.skipped ?? 0)}</span>
                </p>
              </div>
              {Array.isArray(csvResult.warnings) && (csvResult.warnings as string[]).length > 0 && (
                <div className="px-4 py-3 border-t border-flo-border bg-amber-50">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertCircle size={14} className="text-amber-500" />
                    <span className="text-xs font-medium text-amber-700">{t('products.csvMissingFields')}</span>
                  </div>
                  <ul className="space-y-1">
                    {(csvResult.warnings as string[]).map((w, i) => (
                      <li key={i} className="text-xs text-amber-800">
                        {w}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {Array.isArray(csvResult.errors) && (csvResult.errors as string[]).length > 0 && (
                <div className="px-4 py-3 border-t border-flo-border">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertCircle size={14} className="text-red-500" />
                    <span className="text-xs font-medium text-red-700">{t('products.csvSkippedErrors')}</span>
                  </div>
                  <ul className="space-y-1">
                    {(csvResult.errors as string[]).map((e, i) => (
                      <li key={i} className="text-xs text-flo-text-secondary">
                        {e}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
