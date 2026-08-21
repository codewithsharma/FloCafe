/**
 * Phase 9 Team (staff) workspace contracts.
 *
 * Usage: npx ts-node --transpile-only -P tests/tsconfig.json tests/flo-staff.test.ts
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
  console.log('Phase 9 Flo Team (Staff) Workspace Contracts');
  console.log('='.repeat(60));

  const page = read('app/(dashboard)/staff/page.tsx');
  assert.ok(page.includes('PageHeader'), 'staff page uses PageHeader');
  assert.ok(page.includes('LoadingState'), 'staff page uses LoadingState');
  assert.ok(page.includes('StaffGrid'), 'staff page uses StaffGrid');
  assert.ok(page.includes('StaffFormDialog'), 'staff page uses StaffFormDialog');
  assert.ok(page.includes('StaffResetPasswordDialog'), 'staff page uses StaffResetPasswordDialog');
  assert.ok(page.includes(".get('/staff'") || page.includes("api.get('/staff')"), 'staff list API preserved');
  assert.ok(page.includes("api.post('/staff'") || page.includes(".post('/staff'"), 'create staff API preserved');
  assert.ok(page.includes("api.put(`/staff/${") || page.includes(".put(`/staff/${"), 'update staff API preserved');
  assert.ok(page.includes('deactivate') && page.includes('reactivate'), 'activate toggle APIs preserved');
  assert.ok(page.includes('editingLastActiveOwner'), 'last active owner guard preserved');
  assert.ok(page.includes('pin'), 'PIN fields preserved');
  assert.ok(page.includes('confirmPassword') || page.includes('confirmNewPassword'), 'password confirm preserved');
  assert.ok(!page.includes('fixed inset-0 bg-black/50'), 'legacy modal overlay removed from page');
  console.log('   ✓ staff page orchestration preserved');

  assert.ok(fs.existsSync(path.join(FRONTEND, 'components/staff/StaffGrid.tsx')), 'StaffGrid exists');
  assert.ok(fs.existsSync(path.join(FRONTEND, 'components/staff/StaffFormDialog.tsx')), 'StaffFormDialog exists');
  assert.ok(fs.existsSync(path.join(FRONTEND, 'components/staff/StaffResetPasswordDialog.tsx')), 'StaffResetPasswordDialog exists');
  assert.ok(fs.existsSync(path.join(FRONTEND, 'components/staff/index.ts')), 'staff index exists');
  console.log('   ✓ staff components exist');

  const grid = read('components/staff/StaffGrid.tsx');
  assert.ok(grid.includes('Panel'), 'StaffGrid uses Panel');
  assert.ok(grid.includes('StatusBadge'), 'StaffGrid uses StatusBadge');
  assert.ok(grid.includes('staffRoleVariant'), 'StaffGrid uses staffRoleVariant');
  assert.ok(grid.includes('EmptyState'), 'StaffGrid uses EmptyState');
  console.log('   ✓ StaffGrid flo styling');

  const formDialog = read('components/staff/StaffFormDialog.tsx');
  assert.ok(formDialog.includes('Dialog'), 'StaffFormDialog uses Dialog');
  assert.ok(formDialog.includes('DialogContent'), 'StaffFormDialog uses DialogContent');
  assert.ok(formDialog.includes('VALID_ROLES'), 'role list on StaffFormDialog');
  assert.ok(formDialog.includes("['owner', 'manager', 'cashier', 'waiter', 'chef']") || formDialog.includes('owner') && formDialog.includes('chef'), 'roles enumerated');
  assert.ok(formDialog.includes('replace(/\\D/g'), 'PIN digit filter preserved');
  assert.ok(formDialog.includes('slice(0, 6)'), 'PIN max length preserved');
  assert.ok(formDialog.includes('owner') && formDialog.includes('manager'), 'PIN role gate preserved');
  console.log('   ✓ StaffFormDialog flo dialog + PIN rules');

  const resetDialog = read('components/staff/StaffResetPasswordDialog.tsx');
  assert.ok(resetDialog.includes('Dialog'), 'StaffResetPasswordDialog uses Dialog');
  console.log('   ✓ StaffResetPasswordDialog flo dialog');

  const floDisplay = read('lib/flo-display.ts');
  assert.ok(floDisplay.includes('staffRoleVariant'), 'staffRoleVariant helper');
  console.log('   ✓ flo-display staffRoleVariant');

  console.log('='.repeat(60));
  console.log('✅ Phase 9 Flo Team workspace contracts passed');
}

main();
