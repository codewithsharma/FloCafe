import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

/**
 * Vitest for pure domain / validation / util unit tests.
 * Existing Electron/node:test suites remain the primary integration runners.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
    globals: false,
  },
  resolve: {
    alias: {
      '@main': path.resolve(rootDir, 'main'),
    },
  },
});
