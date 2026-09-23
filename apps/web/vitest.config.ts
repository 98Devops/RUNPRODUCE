import { defineConfig } from 'vitest/config';

/**
 * Unit suite for `apps/web`. Repository tests here use a fake client and never
 * reach a database; the database half of each repository test lives in
 * `packages/db-tests` and runs under `npm run test:db`.
 */
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    globals: true
  }
});
