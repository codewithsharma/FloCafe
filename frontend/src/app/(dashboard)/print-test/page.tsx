'use client';

import { useMemo, useState } from 'react';
import { Printer, FileText, MessageCircle, Download, Usb, Globe } from 'lucide-react';
import { PageHeader, Panel } from '@/components/flo';
import { Button } from '@/components/ui/button';
import { usePrinterStore } from '@/hooks/usePrinter';
import { showPrintWarningsToast } from '@/lib/printer/warnings-toast';
import { usePosSettingsStore } from '@/store/pos-settings';
import { printerService } from '@/lib/printer/PrinterService';
import {
  createTestBill,
  createTestOrder,
  createTestTenant,
  createTestCustomer,
} from '@/lib/printer/test-data';
import { printWebBill, generateBillHtml } from '@/lib/printer/web-print';
import { shareBillViaWhatsApp, getWhatsAppMessage } from '@/lib/whatsapp-share';
import { formatCurrencyForTenant, getCountryByCode } from '@/lib/countries';
import { formatDate } from '@/lib/printer/format-date';
import { formatTaxComponentLabel, resolveTaxComponents } from '@/lib/printer/tax-components';
import toast from 'react-hot-toast';
import { useI18n } from '@/hooks/useI18n';
type TestMode = 'receipt' | 'tax' | 'kot' | 'web-print' | 'whatsapp';
type PaperWidth = 58 | 80;

export default function PrintTestPage() {
  const [testMode, setTestMode] = useState<TestMode>('receipt');
  const [paperWidth, setPaperWidth] = useState<PaperWidth>(58);
  const [testing, setTesting] = useState(false);

  const {
    printBill,
    printTaxBill,
    printKot,
    printMethod,
    setPrintMethod,
    downloadLastReceipt,
    lastPrintedBytes,
    status,
  } = usePrinterStore();
  const kotPrintingEnabled = usePosSettingsStore((s) => s.kotPrintingEnabled);
  const printerPaperSize = usePosSettingsStore((s) => s.printerPaperSize);
  const { t } = useI18n();
  const effectiveTestMode: TestMode =
    !kotPrintingEnabled && testMode === 'kot' ? 'receipt' : testMode;

  const testBill = useMemo(() => createTestBill(), []);
  const testOrder = useMemo(() => createTestOrder(), []);
  const testTenant = useMemo(() => createTestTenant(), []);
  const testCustomer = useMemo(() => createTestCustomer(), []);

  const handlePrint = async () => {
    setTesting(true);
    try {
      switch (effectiveTestMode) {
        case 'receipt':
          if (printMethod === 'browser') {
            const html = generateThermalReceiptHtml(testBill, testTenant, paperWidth, { t });
            await printerService.printViaBrowser(html, paperWidth);
            toast.success(t('printTest.browserDialogOpened'));
          } else {
            const printWarnings = await printBill(testBill, testTenant, { paperWidth });
            toast.success(t('printTest.receiptPrinted'));
            showPrintWarningsToast(printWarnings);
          }
          break;
        case 'tax':
          if (printMethod === 'browser') {
            const html = generateThermalReceiptHtml(testBill, testTenant, paperWidth, {
              t,
              taxRegistrationNumber: 'TAXID-0001',
              address: '123 Main Street, Mumbai - 400001',
              phone: '+91 9876543210',
            });
            await printerService.printViaBrowser(html, paperWidth);
            toast.success(t('printTest.browserDialogOpened'));
          } else {
            const printWarnings = await printTaxBill(testBill, testTenant, {
              paperWidth,
              taxRegistrationNumber: 'TAXID-0001',
              address: '123 Main Street, Mumbai - 400001',
              phone: '+91 9876543210',
            });
            toast.success(t('printTest.taxBillPrinted'));
            showPrintWarningsToast(printWarnings);
          }
          break;
        case 'kot':
          // Manual "Print KOT" test action — must be blocked here too, since
          // the browser-print path below never goes through the printKot()
          // choke point that enforces kot_printing_enabled (issue #133).
          if (!kotPrintingEnabled) {
            toast.error(t('printTest.failedWithReason', { message: 'KOT disabled' }));
            break;
          }
          if (printMethod === 'browser') {
            const html = generateKotHtml(testOrder, paperWidth);
            await printerService.printViaBrowser(html, paperWidth);
            toast.success(t('printTest.browserDialogOpened'));
          } else {
            const printWarnings = await printKot(testOrder, { paperWidth });
            toast.success(t('printTest.kotPrinted'));
            showPrintWarningsToast(printWarnings);
          }
          break;
        case 'web-print':
          printWebBill(testBill, testTenant, { paperSize: printerPaperSize, includeTaxId: true });
          toast.success(t('printTest.webPrintDialogOpened'));
          break;
        case 'whatsapp':
          shareBillViaWhatsApp(testBill, testCustomer, testTenant, {
            pointsEarned: 50,
            walletBalance: 200,
          });
          toast.success(t('printTest.whatsappOpened'));
          break;
      }
    } catch (err) {
      toast.error(t('printTest.failedWithReason', { message: (err as Error).message }));
    } finally {
      setTesting(false);
    }
  };

  const handleDownloadHtml = () => {
    const html = generateBillHtml(testBill, testTenant, {
      paperSize: printerPaperSize,
      includeTaxId: true,
      taxRegistrationNumber: 'TAXID-0001',
      address: '123 Main Street, Mumbai - 400001',
      phone: '+91 9876543210',
    });

    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bill-${printerPaperSize}-preview.html`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('HTML downloaded');
  };

  const handleCopyWhatsappText = async () => {
    const message = getWhatsAppMessage(testBill, testTenant, {
      pointsEarned: 50,
      walletBalance: 200,
    });
    await navigator.clipboard.writeText(message);
    toast.success('WhatsApp message copied to clipboard');
  };

  const testOptions: { value: TestMode; label: string; icon: React.ElementType }[] = [
    { value: 'receipt', label: 'Basic Receipt (Thermal)', icon: Printer },
    { value: 'tax', label: 'Detailed Tax Bill (Thermal)', icon: Printer },
    // Hidden entirely when KOT printing is disabled — this is a manual
    // "Print KOT" action, which must never be reachable in that state (#133).
    ...(kotPrintingEnabled
      ? [{ value: 'kot' as TestMode, label: 'KOT (Kitchen Ticket)', icon: Printer }]
      : []),
    { value: 'web-print', label: 'Web Print (Browser)', icon: FileText },
    { value: 'whatsapp', label: 'WhatsApp Share', icon: MessageCircle },
  ];

  return (
    <div className="min-h-full bg-flo-bg">
      <div className="flo-page-frame flo-page-frame--standard">
        <PageHeader
          title={
            <span className="inline-flex items-center gap-3">
              <Printer size={28} className="text-flo-brand-600" aria-hidden />
              {t('printTest.title')}
            </span>
          }
        />

        <Panel title={t('printTest.selectTestType')} className="mb-6">
          <div className="grid grid-cols-2 gap-2">
            {testOptions.map((opt) => {
              const Icon = opt.icon;
              return (
                <button
                  key={opt.value}
                  onClick={() => setTestMode(opt.value)}
                  className={`flex items-center gap-2 rounded-flo-md border p-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flo-brand-500 ${
                    effectiveTestMode === opt.value
                      ? 'border-flo-brand-500 bg-flo-brand-50 text-flo-brand-700'
                      : 'border-flo-border hover:border-flo-text-muted'
                  }`}
                >
                  <Icon size={16} />
                  <span className="text-sm font-medium">{opt.label}</span>
                </button>
              );
            })}
          </div>
        </Panel>

        <Panel title={t('printTest.printerSettings')} className="mb-6">
          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-flo-text">
                {t('printTest.paperWidthLabel')}
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => setPaperWidth(58)}
                  className={`rounded-flo-md border px-4 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flo-brand-500 ${
                    paperWidth === 58
                      ? 'border-flo-brand-500 bg-flo-brand-50 text-flo-brand-700'
                      : 'border-flo-border hover:border-flo-text-muted'
                  }`}
                >
                  {t('printTest.paperWidth58')}
                </button>
                <button
                  onClick={() => setPaperWidth(80)}
                  className={`rounded-flo-md border px-4 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flo-brand-500 ${
                    paperWidth === 80
                      ? 'border-flo-brand-500 bg-flo-brand-50 text-flo-brand-700'
                      : 'border-flo-border hover:border-flo-text-muted'
                  }`}
                >
                  {t('printTest.paperWidth80')}
                </button>
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-flo-text">
                {t('printTest.printMethodLabel')}
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => setPrintMethod('escpos')}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-flo-md border px-4 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flo-brand-500 ${
                    printMethod === 'escpos'
                      ? 'border-flo-brand-500 bg-flo-brand-50 text-flo-brand-700'
                      : 'border-flo-border hover:border-flo-text-muted'
                  }`}
                >
                  <Usb size={16} />
                  {t('printTest.escpos')}
                </button>
                <button
                  onClick={() => setPrintMethod('browser')}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-flo-md border px-4 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flo-brand-500 ${
                    printMethod === 'browser'
                      ? 'border-flo-brand-500 bg-flo-brand-50 text-flo-brand-700'
                      : 'border-flo-border hover:border-flo-text-muted'
                  }`}
                >
                  <Globe size={16} />
                  {t('printTest.browserPrint')}
                </button>
              </div>
              <p className="mt-2 text-xs text-flo-text-secondary">
                {printMethod === 'escpos'
                  ? t('printTest.escposHint', { status })
                  : t('printTest.browserHint')}
              </p>
            </div>

            {printMethod === 'escpos' && lastPrintedBytes && (
              <div className="rounded-flo-md bg-flo-surface-muted p-3">
                <p className="text-sm text-flo-text-secondary">
                  {t('printTest.lastPrintedBytes', { bytes: lastPrintedBytes.length })}
                </p>
                <button
                  onClick={downloadLastReceipt}
                  className="mt-2 flex items-center gap-1 text-sm text-flo-text-muted hover:text-flo-text"
                >
                  <Download size={14} /> {t('printTest.downloadBin')}
                </button>
              </div>
            )}
          </div>
        </Panel>

        <div className="flex gap-3">
          <Button onClick={handlePrint} disabled={testing} className="flex-1" size="lg">
            {testing ? t('printTest.printing') : t('printTest.runTest')}
          </Button>

          {effectiveTestMode === 'web-print' && (
            <Button onClick={handleDownloadHtml} variant="outline" size="lg">
              <Download size={18} className="mr-2" />
              {t('printTest.downloadHtml')}
            </Button>
          )}

          {effectiveTestMode === 'whatsapp' && (
            <Button onClick={handleCopyWhatsappText} variant="outline" size="lg">
              {t('printTest.copyText')}
            </Button>
          )}
        </div>

        <Panel title={t('printTest.dataPreview')} className="mt-6">
          <pre className="overflow-x-auto text-xs text-flo-text-secondary">
            {JSON.stringify(
              {
                bill: testBill.bill_number,
                total: testBill.total,
                items: testOrder.items?.length,
                customer: testCustomer.name,
              },
              null,
              2,
            )}
          </pre>
        </Panel>
      </div>
    </div>
  );
}

function generateThermalReceiptHtml(
  bill: ReturnType<typeof createTestBill>,
  tenant: ReturnType<typeof createTestTenant>,
  paperWidth: 58 | 80,
  options?: {
    taxRegistrationNumber?: string;
    address?: string;
    phone?: string;
    t?: (key: string, params?: Record<string, string | number>) => string;
  },
): string {
  const t = options?.t ?? ((k: string) => k);
  const fontSize = paperWidth === 58 ? '10px' : '12px';
  const padding = paperWidth === 58 ? '4px' : '6px';

  const fmtCurrency = (amount: number) =>
    formatCurrencyForTenant(amount, tenant.country, tenant.currency);

  const items = bill.order?.items || [];
  const rows = items
    .map(
      (item, idx) => `
    <tr>
      <td style="font-size:${fontSize};padding:${padding};">${idx + 1}. ${item.product_name}</td>
      <td style="font-size:${fontSize};padding:${padding};text-align:right;">${item.quantity}</td>
      <td style="font-size:${fontSize};padding:${padding};text-align:right;">${fmtCurrency(item.unit_price)}</td>
      <td style="font-size:${fontSize};padding:${padding};text-align:right;">${fmtCurrency(item.subtotal)}</td>
    </tr>
  `,
    )
    .join('');

  const taxComponents = resolveTaxComponents(bill);
  const taxIdLabel = getCountryByCode(tenant.country ?? 'IN')?.taxIdLabel || 'Tax ID';
  const taxRows = taxComponents
    .map(
      (component) => `
        <tr>
          <td style="padding:${padding};">${formatTaxComponentLabel(component)}</td>
          <td style="text-align:right;padding:${padding};">${fmtCurrency(component.amount)}</td>
        </tr>
  `,
    )
    .join('');

  return `
    <div style="text-align:center;padding:${padding};font-family:'Courier New',monospace;font-size:${fontSize};">
      <h2 style="margin:0;font-size:${paperWidth === 58 ? '14px' : '16px'};">${tenant.business_name}</h2>
      ${options?.address ? `<p style="margin:2px 0;font-size:${fontSize};">${options.address}</p>` : ''}
      ${options?.phone ? `<p style="margin:2px 0;font-size:${fontSize};">${options.phone}</p>` : ''}
      ${options?.taxRegistrationNumber ? `<p style="margin:2px 0;font-size:${fontSize};">${taxIdLabel}: ${options.taxRegistrationNumber}</p>` : ''}
      <hr style="border:1px dashed #000;margin:4px 0;">
      <p style="margin:2px 0;">Bill #: ${bill.bill_number}</p>
      <p style="margin:2px 0;">${formatDate(new Date().toISOString(), getCountryByCode(tenant.country ?? 'IN')?.locale)}</p>
      <hr style="border:1px dashed #000;margin:4px 0;">
      <table style="width:100%;border-collapse:collapse;font-size:${fontSize};">
        <thead>
          <tr>
            <th style="text-align:left;padding:${padding};">${t('printTest.item')}</th>
            <th style="text-align:right;padding:${padding};">${t('printTest.qty')}</th>
            <th style="text-align:right;padding:${padding};">${t('printTest.rate')}</th>
            <th style="text-align:right;padding:${padding};">${t('printTest.amt')}</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
      <hr style="border:1px dashed #000;margin:4px 0;">
      <table style="width:100%;font-size:${fontSize};">
        <tr>
          <td style="padding:${padding};">${t('common.subtotal')}</td>
          <td style="text-align:right;padding:${padding};">${fmtCurrency(bill.subtotal)}</td>
        </tr>
        ${
          bill.discount_amount > 0
            ? `
        <tr>
          <td style="padding:${padding};">${t('common.discount')}</td>
          <td style="text-align:right;padding:${padding};">-${fmtCurrency(bill.discount_amount)}</td>
        </tr>
        `
            : ''
        }
        ${taxRows}
        <tr style="font-weight:bold;">
          <td style="padding:${padding};">${t('common.total')}</td>
          <td style="text-align:right;padding:${padding};">${fmtCurrency(bill.total)}</td>
        </tr>
      </table>
      <hr style="border:1px dashed #000;margin:8px 0;">
      <p style="margin:4px 0;font-size:${fontSize};">Thank you for visiting!</p>
      <p style="margin:4px 0;font-size:${fontSize};">Please visit again</p>
    </div>
  `;
}

function generateKotHtml(order: ReturnType<typeof createTestOrder>, paperWidth: 58 | 80): string {
  const fontSize = paperWidth === 58 ? '10px' : '12px';
  const padding = paperWidth === 58 ? '4px' : '6px';

  const items = order.items || [];
  const rows = items
    .map(
      (item, idx) => `
    <tr>
      <td style="font-size:${fontSize};padding:${padding};">${idx + 1}. ${item.product_name}</td>
      <td style="font-size:${fontSize};padding:${padding};text-align:right;font-weight:bold;">${item.quantity}</td>
    </tr>
  `,
    )
    .join('');

  return `
    <div style="text-align:center;padding:${padding};font-family:'Courier New',monospace;font-size:${fontSize};">
      <h2 style="margin:0;font-size:${paperWidth === 58 ? '14px' : '16px'};">KOT</h2>
      <p style="margin:2px 0;">Order #: ${order.order_number}</p>
      <p style="margin:2px 0;">${formatDate(order.created_at, 'en-US')}</p>
      <hr style="border:1px dashed #000;margin:4px 0;">
      <table style="width:100%;border-collapse:collapse;font-size:${fontSize};">
        <tbody>
          ${rows}
        </tbody>
      </table>
      <hr style="border:1px dashed #000;margin:8px 0;">
    </div>
  `;
}
