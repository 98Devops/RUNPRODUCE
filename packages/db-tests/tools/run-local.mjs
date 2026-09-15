// Runs the database suite against the LOCAL Supabase stack (`npx supabase start`).
// Reads the stack's URL and keys from `supabase status`, so no key is written
// anywhere. Hosted targets go through the environment and src/env.ts instead.
import { execSync, spawnSync } from 'node:child_process';
import process from 'node:process';

const status = JSON.parse(execSync('npx supabase status -o json', { cwd: '../..', encoding: 'utf8' }));
const result = spawnSync('npx', ['vitest', 'run', ...process.argv.slice(2)], {
  stdio: 'inherit',
  shell: true,
  env: {
    ...process.env,
    SUPABASE_URL: status.API_URL,
    SUPABASE_ANON_KEY: status.ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
    SUPABASE_DB_URL: status.DB_URL
  }
});
process.exit(result.status ?? 1);
