import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Unit suite for `apps/web`. Repository tests here use a fake client and never
 * reach a database; the database half of each repository test lives in
 * `packages/db-tests` and runs under `npm run test:db`.
 *
 * Components render on the server only (`renderToString`): there is no browser
 * here. The `@/` alias is the one `tsconfig.json` gives Next.
 */
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./', import.meta.url)) }
  },
  esbuild: { jsx: 'automatic' },
  test: {
    include: ['tests/**/*.test.ts'],
    globals: true
  }
});
