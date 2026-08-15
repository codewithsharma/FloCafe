/**
 * GUI-0003 — desktop POS role gates + landing pages.
 */
import * as assert from 'node:assert/strict';
import {
  canAccessPos,
  getLandingPageForRole,
} from '../frontend/src/lib/rbac';

console.log('GUI-0003 POS RBAC');

for (const role of ['owner', 'manager', 'cashier'] as const) {
  assert.equal(canAccessPos(role), true, `${role} may access POS`);
}
for (const role of ['waiter', 'chef', null, undefined, ''] as const) {
  assert.equal(canAccessPos(role), false, `${String(role)} must not access POS`);
}

assert.equal(getLandingPageForRole('owner'), '/dashboard');
assert.equal(getLandingPageForRole('manager'), '/pos');
assert.equal(getLandingPageForRole('cashier'), '/pos');
assert.equal(getLandingPageForRole('waiter'), '/support');
assert.equal(getLandingPageForRole('chef'), '/support');
assert.equal(getLandingPageForRole(null), '/auth/login');

console.log('✅ GUI-0003 POS RBAC tests passed');
