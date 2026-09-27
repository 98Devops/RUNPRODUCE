// U7 D14: one OWNER and one WORKER on the LOCAL stack, for checking the
// screens by hand. Reads the stack from `supabase status` and refuses anything
// that is not a local host, so it cannot reach dev or production.
//
//   node tools/local-users.mjs            (from packages/db-tests)
//
// Idempotent: re-running reuses the organisation and the two users.
import { execSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';

const status = JSON.parse(execSync('npx supabase status -o json', { cwd: '../..', encoding: 'utf8' }));
for (const url of [status.API_URL, status.DB_URL]) {
  const host = new URL(url).hostname;
  if (host !== '127.0.0.1' && host !== 'localhost') throw new Error(`Refusing: ${host} is not a local stack.`);
}

const ORG = 'Local test farm';
const PASSWORD = 'local-only-password';
const USERS = [
  { email: 'owner@runproduce.local', role: 'OWNER' },
  { email: 'worker@runproduce.local', role: 'WORKER' }
];

const service = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const db = new pg.Client({ connectionString: status.DB_URL });
await db.connect();

try {
  const existing = await db.query('select id from public.organizations where name = $1', [ORG]);
  const orgId =
    existing.rows[0]?.id ??
    (await db.query('insert into public.organizations (name) values ($1) returning id', [ORG])).rows[0].id;

  for (const { email, role } of USERS) {
    const found = await db.query('select id from auth.users where email = $1', [email]);
    let userId = found.rows[0]?.id;
    if (!userId) {
      const created = await service.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
      if (created.error) throw created.error;
      userId = created.data.user.id;
    }
    await db.query(
      `insert into private.memberships (org_id, user_id, role)
       select $1, $2, $3 where not exists (select 1 from private.memberships where org_id = $1 and user_id = $2)`,
      [orgId, userId, role]
    );
    console.log(`${role.padEnd(6)} ${email} / ${PASSWORD}`);
  }
} finally {
  await db.end();
}
