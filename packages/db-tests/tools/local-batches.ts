// U7 chunk 5: two open batches on the LOCAL test farm, for checking Today by
// hand. Run after local-users.mjs, from packages/db-tests, with the stack's
// SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY and SUPABASE_DB_URL
// set as run-local.mjs sets them (the payload helpers load the test harness):
//
//   npx vite-node tools/local-batches.ts
//
// Refuses anything that is not a local host. Signs in as the local OWNER, so
// every write goes through the same RPCs and rules as the app's. Idempotent by
// batch code: re-running reuses the curve and the batches.
//   L-TODAY   placed 11 days before the farm's today: today is day 12.
//   L-LATE    placed past the curve's end, for the "no standard" case.
//
// With --curve-only (U8): the curve and the parameter set, and no batch, for
// checking Start batch by hand from an empty farm.
import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { SEED_BREED_CURVE } from '@runproduce/engine';
import { farmToday } from '../../../apps/web/lib/today/farm-date.js';
import { curvePayload, parameterSetPayload, BASE_PARAMETERS } from '../src/payloads.js';

const status = JSON.parse(execSync('npx supabase status -o json', { cwd: '../..', encoding: 'utf8' }));
const host = new URL(status.API_URL).hostname;
if (host !== '127.0.0.1' && host !== 'localhost') throw new Error(`Refusing: ${host} is not a local stack.`);

const owner = createClient(status.API_URL, status.ANON_KEY, { auth: { persistSession: false } });
const signedIn = await owner.auth.signInWithPassword({ email: 'owner@runproduce.local', password: 'local-only-password' });
if (signedIn.error) throw signedIn.error;

async function call<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await owner.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}

const [membership] = await call<Array<{ org_id: string }>>('my_memberships', {});
if (!membership) throw new Error('Run local-users.mjs first.');
const orgId = membership.org_id;

const daysBefore = (iso: string, days: number) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);
const today = farmToday(new Date());
const lastCurveDay = Math.max(...SEED_BREED_CURVE.points.map((p) => p.day_number));

const existing = await owner.from('batches').select('code, breed_curve_id').eq('org_id', orgId);
if (existing.error) throw existing.error;
const curves = await owner.from('breed_curves').select('id').eq('org_id', orgId).order('created_at');
if (curves.error) throw curves.error;
let curveId = (existing.data[0]?.breed_curve_id ?? curves.data[0]?.id) as string | undefined;
if (curveId === undefined) {
  curveId = await call<string>('create_breed_curve', { payload: curvePayload(orgId) });
  await call('create_parameter_set', { payload: parameterSetPayload(orgId, '2026-01-01', BASE_PARAMETERS) });
}

if (process.argv.includes('--curve-only')) {
  console.log(`curve ${curveId}; no batch placed (--curve-only)`);
  process.exit(0);
}

for (const [code, placementDate] of [
  ['L-TODAY', daysBefore(today, 11)],
  ['L-LATE', daysBefore(today, lastCurveDay + 4)]
] as const) {
  if (existing.data.some((b) => b.code === code)) {
    console.log(`${code} exists`);
    continue;
  }
  await call('record_batch', {
    payload: {
      org_id: orgId,
      code,
      breed_curve_id: curveId,
      client_request_id: randomUUID(),
      placement_date: placementDate,
      chick_count: 6000,
      extra_chick_count: 60,
      chick_price_cents: '100'
    }
  });
  console.log(`${code} placed ${placementDate}`);
}
