/**
 * Flo dark mode / theme contracts.
 *
 * Usage: npx ts-node --transpile-only -P tests/tsconfig.json tests/flo-theme.test.ts
 */
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.join(__dirname, '..');
const FRONTEND = path.join(ROOT, 'frontend/src');

function read(rel: string): string {
  return fs.readFileSync(path.join(FRONTEND, rel), 'utf8');
}

function exists(rel: string): boolean {
  return fs.existsSync(path.join(FRONTEND, rel));
}

function main(): void {
  console.log('Flo Theme / Dark Mode Contracts');
  console.log('='.repeat(60));

  const css = read('app/globals.css');
  assert.ok(css.includes('@custom-variant dark'), 'dark variant registered');
  assert.ok(/\.dark\s*\{/.test(css), '.dark selector exists');
  assert.ok(css.includes('--flo-bg'), 'flo-bg token exists');
  assert.ok(css.includes('--flo-surface'), 'flo-surface token exists');
  assert.ok(css.includes('--flo-text'), 'flo-text token exists');
  assert.ok(css.includes('--flo-brand-600'), 'flo-brand-600 token exists');

  const darkBlockMatch = css.match(/\.dark\s*\{([\s\S]*?)\n\}/);
  assert.ok(darkBlockMatch, 'can parse .dark block');
  const darkBlock = darkBlockMatch![1];
  for (const token of [
    '--flo-brand-50',
    '--flo-brand-100',
    '--flo-brand-500',
    '--flo-brand-600',
    '--flo-brand-700',
    '--flo-brand-900',
    '--flo-success',
    '--flo-success-subtle',
    '--flo-warning',
    '--flo-warning-subtle',
    '--flo-danger',
    '--flo-danger-subtle',
    '--flo-info',
    '--flo-info-subtle',
    '--flo-bg',
    '--flo-surface',
    '--flo-surface-raised',
    '--flo-border',
    '--flo-border-strong',
    '--flo-text',
    '--flo-text-secondary',
    '--flo-text-muted',
    '--background',
    '--foreground',
    '--primary',
    '--card',
    '--border',
  ]) {
    assert.ok(darkBlock.includes(token), `dark tokens include ${token}`);
  }
  console.log('   ✓ dark mode CSS tokens');

  assert.ok(exists('lib/theme.ts'), 'theme helper exists');
  const themeLib = read('lib/theme.ts');
  assert.ok(themeLib.includes('flo_theme'), 'persists flo_theme key');
  assert.ok(/['"]light['"]/.test(themeLib) && /['"]dark['"]/.test(themeLib) && /['"]system['"]/.test(themeLib), 'supports light|dark|system');
  assert.ok(
    themeLib.includes('documentElement') || themeLib.includes('classList'),
    'applies class on documentElement',
  );
  assert.ok(
    themeLib.includes('getStoredTheme') || themeLib.includes('readTheme') || themeLib.includes('getTheme'),
    'exports theme read helper',
  );
  assert.ok(
    themeLib.includes('applyTheme') || themeLib.includes('setTheme'),
    'exports theme apply helper',
  );
  console.log('   ✓ theme persistence helpers');

  assert.ok(exists('components/flo/ThemeToggle.tsx'), 'ThemeToggle component exists');
  const toggle = read('components/flo/ThemeToggle.tsx');
  assert.ok(toggle.includes('flo_theme') || toggle.includes('setTheme') || toggle.includes('applyTheme'), 'toggle uses theme API');
  assert.ok(toggle.includes('use client'), 'ThemeToggle is a client component');
  console.log('   ✓ ThemeToggle component');

  const sidebar = read('components/flo/Sidebar.tsx');
  assert.ok(sidebar.includes('ThemeToggle'), 'Sidebar mounts ThemeToggle');

  const appShell = read('components/flo/AppShell.tsx');
  assert.ok(
    appShell.includes('applyTheme') || appShell.includes('getStoredTheme') || appShell.includes('initTheme'),
    'AppShell applies saved theme on load',
  );

  const rootLayout = read('app/layout.tsx');
  assert.ok(
    rootLayout.includes('FLO_THEME_BOOTSTRAP')
      || rootLayout.includes('flo_theme')
      || rootLayout.includes('prefers-color-scheme'),
    'root layout bootstraps theme before paint',
  );
  assert.ok(rootLayout.includes('suppressHydrationWarning') || rootLayout.includes('classList'), 'avoids hydration flash for dark class');
  console.log('   ✓ shell wiring');

  const en = fs.readFileSync(path.join(FRONTEND, 'lib/i18n/en.json'), 'utf8');
  assert.ok(en.includes('"flo.theme'), 'theme i18n keys present');
  console.log('   ✓ i18n');

  console.log('='.repeat(60));
  console.log('✅ Flo theme / dark mode contracts passed');
}

main();
