/**
 * GUI-0005 — direct-URL route access must match nav RBAC (not sidebar hide alone).
 * GUI-0006 — chef may access /kds and sees kitchen in nav policy.
 */
import * as assert from 'node:assert/strict';
import {
  canAccessAppPath,
  canAccessPos,
  getLandingPageForRole,
} from '../frontend/src/lib/rbac';
import { filterNavItems, getNavItemById, getRolesForAppPath } from '../frontend/src/config/navigation';

console.log('GUI-0005 / GUI-0006 route RBAC');

const kitchen = getNavItemById('kitchen');
assert.ok(kitchen, 'kitchen nav exists');
assert.ok(kitchen!.roles.includes('chef'), 'GUI-0006: chef in kitchen nav roles');
assert.ok(kitchen!.roles.includes('owner') && kitchen!.roles.includes('manager'));
assert.ok(!kitchen!.roles.includes('waiter'), 'waiter must not get kitchen nav');
assert.ok(!kitchen!.roles.includes('cashier'), 'cashier must not get kitchen nav');

const chefNav = filterNavItems({
  role: 'chef',
  businessType: 'restaurant',
  tablesRequired: true,
  kdsEnabled: true,
  whatsappEnabled: false,
});
assert.ok(
  chefNav.some((i) => i.id === 'kitchen'),
  'GUI-0006: chef sidebar includes kitchen when kds enabled',
);
assert.ok(!chefNav.some((i) => i.id === 'pos'), 'chef sidebar excludes POS');

assert.deepEqual(getRolesForAppPath('/kds'), kitchen!.roles);
assert.deepEqual(getRolesForAppPath('/kds/'), kitchen!.roles);
assert.deepEqual(getRolesForAppPath('/products'), getNavItemById('inventory')!.roles);
assert.deepEqual(getRolesForAppPath('/products/purchasing'), getNavItemById('inventory')!.roles);
assert.deepEqual(getRolesForAppPath('/staff'), getNavItemById('team')!.roles);
assert.deepEqual(getRolesForAppPath('/expenses'), getNavItemById('expenses')!.roles);
assert.deepEqual(getRolesForAppPath('/audit'), getNavItemById('audit')!.roles);
assert.deepEqual(getRolesForAppPath('/orders'), getNavItemById('orders')!.roles);

// Owner / manager: full ops (owner home is owner-only)
for (const path of [
  '/pos',
  '/orders',
  '/tables',
  '/kds',
  '/products',
  '/products/purchasing',
  '/customers',
  '/reports',
  '/expenses',
  '/audit',
  '/staff',
  '/settings',
  '/support',
  '/operations',
]) {
  assert.equal(canAccessAppPath('owner', path), true, `owner → ${path}`);
  assert.equal(canAccessAppPath('manager', path), true, `manager → ${path}`);
}
assert.equal(canAccessAppPath('owner', '/dashboard'), true);
assert.equal(canAccessAppPath('manager', '/dashboard'), false, 'manager not on owner home');

// Cashier: POS + orders + support (+ whatsapp gated elsewhere); not management
assert.equal(canAccessPos('cashier'), true);
assert.equal(canAccessAppPath('cashier', '/pos'), true);
assert.equal(canAccessAppPath('cashier', '/orders'), true);
assert.equal(canAccessAppPath('cashier', '/support'), true);
for (const path of [
  '/settings',
  '/reports',
  '/products',
  '/products/purchasing',
  '/customers',
  '/expenses',
  '/audit',
  '/staff',
  '/kds',
  '/tables',
  '/operations',
  '/dashboard',
]) {
  assert.equal(canAccessAppPath('cashier', path), false, `cashier deny ${path}`);
}

// Waiter: support only among primary; no POS / management / KDS
assert.equal(canAccessPos('waiter'), false);
assert.equal(getLandingPageForRole('waiter'), '/support');
assert.equal(canAccessAppPath('waiter', '/support'), true);
for (const path of [
  '/pos',
  '/orders',
  '/reports',
  '/products',
  '/expenses',
  '/audit',
  '/staff',
  '/settings',
  '/kds',
  '/tables',
  '/customers',
]) {
  assert.equal(canAccessAppPath('waiter', path), false, `waiter deny ${path}`);
}

// Chef: KDS + support; no POS / management
assert.equal(canAccessPos('chef'), false);
assert.equal(getLandingPageForRole('chef'), '/support');
assert.equal(canAccessAppPath('chef', '/kds'), true, 'GUI-0006 chef KDS');
assert.equal(canAccessAppPath('chef', '/support'), true);
for (const path of [
  '/pos',
  '/orders',
  '/reports',
  '/products',
  '/expenses',
  '/audit',
  '/staff',
  '/settings',
  '/tables',
  '/customers',
]) {
  assert.equal(canAccessAppPath('chef', path), false, `chef deny ${path}`);
}

console.log('✅ GUI-0005 / GUI-0006 route RBAC tests passed');
