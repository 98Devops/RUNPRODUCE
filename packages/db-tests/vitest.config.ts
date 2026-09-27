import { defineConfig } from 'vitest/config';

/**
 * Database integration suite (U6). Run with `npm run test:db`, never by
 * `npm test`: it needs a database target, and the target is refused unless it
 * is a local stack or the CI project (src/env.ts). Missing environment fails the
 * run; it never skips, because a skipped integrity suite reports green.
 */
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    globals: true,
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000
  }
});
