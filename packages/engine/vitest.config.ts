import { defineConfig } from 'vitest/config';

/**
 * The unit suite. Gates the build unconditionally.
 *
 * `golden-fixtures.test.ts` is excluded and runs as its own CI step — see
 * vitest.golden.config.ts. Everything else about the golden machinery stays
 * here and gates: fixture file integrity, the classifier that decides what is
 * held, and resolvePath.
 */
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['**/node_modules/**', 'tests/golden-fixtures.test.ts']
  }
});
