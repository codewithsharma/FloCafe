/**
 * Phase 9 Customers workspace contracts.
 *
 * Usage: npx ts-node --transpile-only -P tests/tsconfig.json tests/flo-customers.test.ts
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
  console.log('Phase 9 Flo Customers Workspace Contracts');
  console.log('='.repeat(60));

  const page = read('app/(dashboard)/customers/page.tsx');
  assert.ok(page.includes('PageHeader'), 'customers page uses PageHeader');
  assert.ok(page.includes('LoadingState'), 'customers page uses LoadingState');
  assert.ok(page.includes('CustomersTable'), 'customers page uses CustomersTable');
  assert.ok(page.includes('CustomerFormDialog'), 'customers page uses CustomerFormDialog');
  assert.ok(page.includes('CustomerLedgerDialog'), 'customers page uses CustomerLedgerDialog');
  assert.ok(page.includes('parsePhone'), 'phone validation preserved');
  assert.ok(page.includes('250'), 'debounced search preserved (250ms)');
  assert.ok(page.includes('AbortController'), 'search abort preserved');
  assert.ok(page.includes("get('/customers'") || page.includes('get("/customers"'), 'customers list API preserved');
  assert.ok(page.includes("post('/customers'") || page.includes('post("/customers"'), 'create customer API preserved');
  assert.ok(page.includes('put(`/customers/${') || page.includes("put(`/customers/${"), 'update customer API preserved');
  assert.ok(page.includes('/wallet'), 'wallet ledger API preserved');
  assert.ok(page.includes('sortField') && page.includes('sortOrder'), 'sort state preserved');
  assert.ok(page.includes('invalid_phones'), 'invalid phones filter preserved');
  assert.ok(!page.includes('fixed inset-0 bg-black/50'), 'legacy modal overlay removed from page');
  assert.ok(!page.includes('bg-white rounded-xl border border-gray-100'), 'legacy table card pattern removed from page');
  console.log('   ✓ customers page orchestration preserved');

  assert.ok(fs.existsSync(path.join(FRONTEND, 'components/customers/CustomersTable.tsx')), 'CustomersTable exists');
  assert.ok(fs.existsSync(path.join(FRONTEND, 'components/customers/CustomerFormDialog.tsx')), 'CustomerFormDialog exists');
  assert.ok(fs.existsSync(path.join(FRONTEND, 'components/customers/CustomerLedgerDialog.tsx')), 'CustomerLedgerDialog exists');
  assert.ok(fs.existsSync(path.join(FRONTEND, 'components/customers/index.ts')), 'customers index exists');
  console.log('   ✓ customers components exist');

  const table = read('components/customers/CustomersTable.tsx');
  assert.ok(table.includes('Panel'), 'CustomersTable uses Panel');
  assert.ok(table.includes('MoneyDisplay'), 'CustomersTable uses MoneyDisplay');
  assert.ok(table.includes('EmptyState'), 'CustomersTable uses EmptyState');
  assert.ok(table.includes('onSort'), 'CustomersTable sort handlers');
  console.log('   ✓ CustomersTable flo styling');

  const formDialog = read('components/customers/CustomerFormDialog.tsx');
  assert.ok(formDialog.includes('Dialog'), 'CustomerFormDialog uses Dialog');
  assert.ok(formDialog.includes('DialogContent'), 'CustomerFormDialog uses DialogContent');
  console.log('   ✓ CustomerFormDialog flo dialog');

  const ledgerDialog = read('components/customers/CustomerLedgerDialog.tsx');
  assert.ok(ledgerDialog.includes('Dialog'), 'CustomerLedgerDialog uses Dialog');
  assert.ok(ledgerDialog.includes('LoadingState'), 'CustomerLedgerDialog uses LoadingState');
  console.log('   ✓ CustomerLedgerDialog flo dialog');

  console.log('='.repeat(60));
  console.log('✅ Phase 9 Flo Customers workspace contracts passed');
}

main();
