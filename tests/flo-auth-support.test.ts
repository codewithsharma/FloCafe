/**
 * Flo Auth + Support shell contracts.
 *
 * Usage: npx ts-node --transpile-only -P tests/tsconfig.json tests/flo-auth-support.test.ts
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
  console.log('Flo Auth + Support Shell Contracts');
  console.log('='.repeat(60));

  assert.ok(
    fs.existsSync(path.join(FRONTEND, 'components/flo/AuthShell.tsx')),
    'AuthShell component exists',
  );
  const authShell = read('components/flo/AuthShell.tsx');
  assert.ok(authShell.includes('bg-flo-bg'), 'AuthShell uses flo-bg');
  assert.ok(authShell.includes('bg-flo-surface'), 'AuthShell uses flo-surface');
  assert.ok(authShell.includes('border-flo-border'), 'AuthShell uses flo-border');
  console.log('   ✓ AuthShell flo tokens');

  const floIndex = read('components/flo/index.ts');
  assert.ok(floIndex.includes('AuthShell'), 'AuthShell exported from flo index');
  console.log('   ✓ AuthShell export');

  const login = read('app/auth/login/page.tsx');
  assert.ok(login.includes('AuthShell'), 'login uses AuthShell');
  assert.ok(!login.includes('CardContent'), 'login Card layout removed');
  assert.ok(login.includes('login(') || login.includes('await login'), 'login auth logic preserved');
  assert.ok(login.includes('selectTenant'), 'tenant select preserved');
  assert.ok(login.includes('getLandingPage'), 'landing redirect preserved');
  assert.ok(login.includes('/api/auth/setup/status'), 'setup status check preserved');
  assert.ok(login.includes('/api/health'), 'health check preserved');
  assert.ok(login.includes('rememberMe'), 'remember me preserved');
  assert.ok(login.includes('/auth/recover'), 'recover link preserved');
  console.log('   ✓ login page flo shell + auth logic');

  const register = read('app/auth/register/page.tsx');
  assert.ok(register.includes('AuthShell'), 'register uses AuthShell');
  assert.ok(!register.includes('bg-gray-50'), 'register legacy gray shell removed');
  assert.ok(register.includes('register(form)'), 'register API preserved');
  assert.ok(register.includes('password_confirmation'), 'password confirmation preserved');
  assert.ok(register.includes('selectTenant'), 'auto tenant select preserved');
  assert.ok(register.includes('/auth/login'), 'login link preserved');
  console.log('   ✓ register page flo shell + auth logic');

  const recover = read('app/auth/recover/page.tsx');
  assert.ok(recover.includes('AuthShell'), 'recover uses AuthShell');
  assert.ok(recover.includes('LoadingState'), 'recover uses LoadingState');
  assert.ok(!recover.includes('CardContent'), 'recover Card layout removed');
  assert.ok(recover.includes('/auth/setup/status'), 'pin availability check preserved');
  assert.ok(recover.includes('/auth/recover-password'), 'recover-password API preserved');
  assert.ok(recover.includes('master_pin'), 'master pin field preserved');
  assert.ok(recover.includes('isPasswordValid'), 'password validation preserved');
  console.log('   ✓ recover page flo shell + auth logic');

  const support = read('app/(dashboard)/support/page.tsx');
  assert.ok(support.includes('PageHeader'), 'support uses PageHeader');
  assert.ok(support.includes('Panel'), 'support uses Panel');
  assert.ok(support.includes('LoadingState'), 'support uses LoadingState');
  assert.ok(!support.includes('CardHeader'), 'support Card layout removed');
  assert.ok(support.includes('/support-ticket/profile'), 'profile API preserved');
  assert.ok(support.includes("post('/support-ticket'") || support.includes('post("/support-ticket"'), 'ticket submit API preserved');
  assert.ok(support.includes('useSupportTicketStatus'), 'delivery status hook preserved');
  assert.ok(support.includes('useSupportDiagnosticsPreview'), 'diagnostics preview preserved');
  assert.ok(support.includes('correlation_id'), 'correlation id preserved');
  assert.ok(support.includes('client_ticket_id'), 'client ticket id preserved');
  console.log('   ✓ support page flo shell + ticket API');

  console.log('='.repeat(60));
  console.log('✅ Flo Auth + Support shell contracts passed');
}

main();
