import { defineConfig } from 'vitest/config';

/**
 * The golden fixture suite, run as its own CI step so its result is read
 * separately from lint, typecheck, unit tests and build.
 *
 * It is a real gate, not a permissive one. Fixtures waiting on an unbuilt
 * module skip; a fixture whose module exists and whose number is wrong fails
 * this step and the workflow.
 */
export default defineConfig({
  test: {
    include: ['tests/golden-fixtures.test.ts']
  }
});
