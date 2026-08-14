/**
 * Phase 4.10 — FIN-01 collectible outstanding display.
 *
 * Usage: node tests/run-electron-node-test.cjs tests/phase-4.10-fin01-display.test.ts
 *    or: npm run test:phase-4.10
 */
const Module = require('module');
const originalLoad = Module._load;
const fs = require('fs');
const os = require('os');
const path = require('path');
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-4.10-fin01-'));
Module._load = function (request: string, parent: unknown, isMain: boolean) {
  if (request === 'electron') {
    return { app: { isPackaged: true, getPath: () => testDir, getVersion: () => 'test' } };
  }
  return originalLoad.apply(this, arguments as any);
};

const { assert, assertEqual, getResults } = require('./helpers/test-setup');

const {
  collectibleOutstanding,
  collectibleOutstandingCents,
  hasCollectibleOutstanding,
} = require('../frontend/src/lib/bill-collectible');

const ROOT = path.join(__dirname, '..');
const FRONTEND = path.join(ROOT, 'frontend/src');

function readFrontend(rel: string): string {
  return fs.readFileSync(path.join(FRONTEND, rel), 'utf8');
}

function main() {
  console.log('Phase 4.10 — FIN-01 collectible display');
  console.log('='.repeat(60));

  // Canonical §19: total 1000, pay 600, refund 200 → collectible 400, net balance 600
  const afterRefund = {
    total: 1000,
    paid_amount: 400,
    balance: 600,
    payment_status: 'partial',
    payment_details: [{ method: 'cash', amount: 600 }],
  };
  assertEqual(collectibleOutstanding(afterRefund), 400, 'collectible is 400 not net 600');
  assertEqual(collectibleOutstandingCents(afterRefund), 40000, 'collectible cents 40000');
  assert(hasCollectibleOutstanding(afterRefund), 'still collectible after partial+refund');

  const fullTenderRefund = {
    total: 1000,
    paid_amount: 800,
    balance: 200,
    payment_status: 'partially_refunded',
    payment_details: [{ method: 'cash', amount: 1000 }],
  };
  assertEqual(collectibleOutstanding(fullTenderRefund), 0, 'full tender then refund collectible 0');
  assert(!hasCollectibleOutstanding(fullTenderRefund), 'Pay disabled when collectible is 0');

  const unpaid = { total: 250, payment_details: [] };
  assertEqual(collectibleOutstanding(unpaid), 250, 'unpaid collectible equals total');

  const ordersPage = readFrontend('app/(dashboard)/orders/page.tsx');
  assert(
    ordersPage.includes('hasCollectibleOutstanding') ||
      ordersPage.includes('collectibleOutstanding'),
    'Orders uses collectible helper',
  );
  const card = readFrontend('components/orders/OrderCard.tsx');
  assert(
    card.includes('collectible') || card.includes('orders.collectible'),
    'OrderCard shows collectible',
  );
  const pay = readFrontend('components/pos/PaymentModal.tsx');
  assert(
    pay.includes('collectibleOutstanding') || pay.includes('hasCollectibleOutstanding'),
    'PaymentModal uses collectible not only net balance',
  );

  const en = readFrontend('lib/i18n/en.json');
  assert(en.includes('"orders.collectible"'), 'en orders.collectible');
  const es = readFrontend('lib/i18n/es.json');
  assert(es.includes('"orders.collectible"'), 'es orders.collectible');
  const pt = readFrontend('lib/i18n/pt.json');
  assert(pt.includes('"orders.collectible"'), 'pt orders.collectible');

  const { passed, failed, total } = getResults();
  console.log('\n' + '='.repeat(60));
  console.log(`Results: ${passed}/${total} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  console.log('Phase 4.10 FIN-01 display tests passed.');
}

main();
