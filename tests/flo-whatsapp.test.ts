/**
 * Flo WhatsApp workspace contracts.
 *
 * Usage: npx ts-node --transpile-only -P tests/tsconfig.json tests/flo-whatsapp.test.ts
 */
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.join(__dirname, '..');
const FRONTEND = path.join(ROOT, 'frontend/src');

function read(rel: string): string {
  return fs.readFileSync(path.join(FRONTEND, rel), 'utf8');
}

function main(): void {
  console.log('Flo WhatsApp Workspace Contracts');
  console.log('='.repeat(60));

  const page = read('app/(dashboard)/whatsapp/page.tsx');

  assert.ok(page.includes('PageHeader'), 'whatsapp uses PageHeader');
  assert.ok(page.includes('Panel'), 'whatsapp uses Panel');
  assert.ok(page.includes('EmptyState'), 'whatsapp uses EmptyState');
  assert.ok(page.includes('LoadingState'), 'whatsapp uses LoadingState');
  assert.ok(page.includes('StatusBadge'), 'whatsapp uses StatusBadge');
  assert.ok(!page.includes('CardHeader'), 'whatsapp Card layout removed');
  assert.ok(!page.includes("from '@/components/ui/card'"), 'Card import removed');
  console.log('   ✓ Flo shell components');

  assert.ok(page.includes('Tabs'), 'tabs preserved');
  assert.ok(page.includes('value="sent"'), 'sent tab preserved');
  assert.ok(page.includes('value="inbox"'), 'inbox tab preserved');
  assert.ok(page.includes('value="connection"'), 'connection tab preserved');
  assert.ok(page.includes('whatsapp.activeTab'), 'tab persistence preserved');
  console.log('   ✓ tabs + persistence');

  assert.ok(page.includes('/whatsapp/status'), 'status API preserved');
  assert.ok(page.includes('/whatsapp/qr'), 'qr API preserved');
  assert.ok(page.includes('/whatsapp/pairing-code'), 'pairing code API preserved');
  assert.ok(page.includes('/whatsapp/connect'), 'connect API preserved');
  assert.ok(page.includes('/whatsapp/disconnect'), 'disconnect API preserved');
  assert.ok(page.includes('/whatsapp/disable'), 'disable API preserved');
  assert.ok(page.includes('/whatsapp/messages'), 'messages API preserved');
  assert.ok(page.includes('/whatsapp/inbox'), 'inbox API preserved');
  assert.ok(page.includes('/whatsapp/blocklist'), 'blocklist API preserved');
  assert.ok(page.includes('/whatsapp/settings'), 'settings API preserved');
  console.log('   ✓ WhatsApp API routes preserved');

  assert.ok(page.includes('connectQr'), 'QR connect flow preserved');
  assert.ok(page.includes('connectPairing'), 'pairing connect flow preserved');
  assert.ok(page.includes('blockFromInbox'), 'inbox block flow preserved');
  assert.ok(page.includes('StatusStepper'), 'status stepper preserved');
  assert.ok(page.includes('translateLastError'), 'error translation preserved');
  assert.ok(page.includes('toastApiError'), 'toast error helper preserved');
  assert.ok(page.includes('useConfirm'), 'confirm dialog preserved');
  assert.ok(page.includes('setWhatsappEnabled'), 'settings store sync preserved');
  assert.ok(page.includes('filterGroups'), 'filter groups setting preserved');
  console.log('   ✓ business logic preserved');

  assert.ok(page.includes('waiting_qr'), 'QR waiting state preserved');
  assert.ok(page.includes('waiting_pairing'), 'pairing waiting state preserved');
  assert.ok(page.includes('qrDataUrl'), 'QR display preserved');
  assert.ok(page.includes('pairingCode'), 'pairing code display preserved');
  console.log('   ✓ QR / pairing flow preserved');

  console.log('='.repeat(60));
  console.log('✅ Flo WhatsApp workspace contracts passed');
}

main();
