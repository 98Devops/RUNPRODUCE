/**
 * T-C10 · What a WORKER reads to capture (U7 chunk 3, D18, AD-101).
 *
 * A WORKER learns the batch's curve from `capture_batches()`, which now returns
 * `breed_curve_id` (the curve is pinned by the batch, U6 D11), and reads that
 * curve's points, which hold no money. Everything else about curves and
 * parameters stays OWNER and MANAGER only: whole tables, not columns (U6 D22).
 *
 * U6's read matrix (T-AC2) and catalog lint (T-AC5) were never written. This
 * covers only what D18 changes, and the catalog properties of the function it
 * recreates.
 */
import { SEED_BREED_CURVE } from '@runproduce/engine';
import { newBatch, newFarm, type Farm } from '../src/payloads.js';
import { pool, rpc, type Member } from '../src/harness.js';

let farm: Farm;
let other: Farm;
let batchId: string;

const placement = { placement_date: '2026-02-06', chick_count: 100, extra_chick_count: 5, chick_price_cents: '100' };

beforeAll(async () => {
  [farm, other] = await Promise.all([newFarm('T-C10'), newFarm('T-C10 other')]);
  batchId = await newBatch(farm, placement);
});

afterAll(async () => {
  await pool.end();
});

async function rows(by: Member, table: string, column: string, value: string): Promise<number> {
  const { data, error } = await by.client.from(table).select('*').eq(column, value);
  expect(error).toBeNull();
  return data?.length ?? 0;
}

describe('T-C10 · capture_batches() names the curve, and still carries no money', () => {
  it('returns breed_curve_id for the batch, to a WORKER', async () => {
    const batches = await rpc<Array<Record<string, unknown>>>(farm.worker, 'capture_batches', {});
    const mine = batches.find((b) => b['batch_id'] === batchId);
    expect(mine).toMatchObject({ placement_date: '2026-02-06', chick_count: 100, extra_chick_count: 5, breed_curve_id: farm.curveId });
  });

  it('returns exactly the columns a capture screen needs, none of them money', async () => {
    const [first] = await rpc<Array<Record<string, unknown>>>(farm.worker, 'capture_batches', {});
    expect(Object.keys(first!).sort()).toEqual(
      ['batch_id', 'breed_curve_id', 'chick_count', 'code', 'extra_chick_count', 'placement_date'].sort()
    );
    expect(Object.keys(first!).filter((k) => k.endsWith('_cents'))).toEqual([]);
  });

  it('shows another organisation none of this one’s batches', async () => {
    const batches = await rpc<Array<Record<string, unknown>>>(other.worker, 'capture_batches', {});
    expect(batches.map((b) => b['batch_id'])).not.toContain(batchId);
  });

  it('is still SECURITY DEFINER, STABLE, with an empty search_path, executable by authenticated and not anon (AD-89)', async () => {
    const { rows: fn } = await pool.query<{
      prosecdef: boolean;
      provolatile: string;
      proconfig: string[] | null;
      authenticated: boolean;
      anon: boolean;
      commented: boolean;
    }>(
      `select p.prosecdef, p.provolatile, p.proconfig,
              has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
              has_function_privilege('anon', p.oid, 'execute') as anon,
              obj_description(p.oid, 'pg_proc') is not null as commented
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'capture_batches'`
    );
    expect(fn).toHaveLength(1);
    expect(fn[0]).toMatchObject({ prosecdef: true, provolatile: 's', authenticated: true, anon: false, commented: true });
    expect(fn[0]!.proconfig).toContain('search_path=""');
  });
});

describe('T-C10 · a WORKER reads curve points, and nothing else about curves or parameters', () => {
  it('reads every point of the batch’s curve', async () => {
    expect(await rows(farm.worker, 'breed_curve_points', 'curve_id', farm.curveId)).toBe(SEED_BREED_CURVE.points.length);
  });

  it('reads no point of another organisation’s curve', async () => {
    expect(await rows(farm.worker, 'breed_curve_points', 'curve_id', other.curveId)).toBe(0);
  });

  it.each(['owner', 'manager'] as const)('the %s still reads them', async (who) => {
    expect(await rows(farm[who], 'breed_curve_points', 'curve_id', farm.curveId)).toBe(SEED_BREED_CURVE.points.length);
  });

  it.each<[string, string]>([
    ['breed_curves', 'org_id'],
    ['breed_curve_phases', 'org_id'],
    ['parameter_sets', 'org_id'],
    ['overhead_lines', 'org_id'],
    ['planning_bulk_bands', 'org_id'],
    ['feed_prices', 'org_id'],
    ['batches', 'org_id']
  ])('gets zero rows from %s, which the OWNER can read', async (table, column) => {
    expect(await rows(farm.owner, table, column, farm.orgId)).toBeGreaterThan(0);
    expect(await rows(farm.worker, table, column, farm.orgId)).toBe(0);
  });
});
