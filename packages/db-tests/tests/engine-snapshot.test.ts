/**
 * T-RP2 · Snapshot rules, and the database half of T-RP3 · Money and errors on
 * the wire. `public.engine_snapshot` (D25, AD-90) read through `loadEngineInput`
 * (D27, AD-92), the way the app will read it, as a signed-in member.
 *
 * The snapshot's shape is pinned once, in
 * `apps/web/tests/repositories/snapshot-fixture.ts`; this file checks the real
 * function returns those sections. The unit half of D26 to D28 (Zod, the
 * mapping, SQLSTATE to typed error) is in `apps/web/tests/repositories`.
 */
import { SEED_BREED_CURVE, type BreedCurve, type Cents, type IsoDate, type Parameters } from '@runproduce/engine';
import { Forbidden, loadEngineInput, NoParametersInForce } from '../../../apps/web/lib/repositories/index.js';
import { SNAPSHOT_SECTIONS } from '../../../apps/web/tests/repositories/snapshot-fixture.js';
import { BASE_PARAMETERS, day, newBatch, newFarm, parameterSetPayload, type Farm, type Placement } from '../src/payloads.js';
import { newMember, newOrg, pool, refused, rpc, uuid, type Member } from '../src/harness.js';

afterAll(async () => {
  await pool.end();
});

const on = (date: string) => date as IsoDate;
const grams = (g: number) => g as Parameters['slaughter_target_g'];

const PLACEMENT: Placement = { placement_date: '2026-03-10', chick_count: 1000, extra_chick_count: 0, chick_price_cents: '85' };

async function addSet(farm: Farm, effectiveFrom: string, overrides: Partial<Parameters> = {}, curve?: BreedCurve): Promise<string> {
  return rpc<string>(farm.owner, 'create_parameter_set', {
    payload: parameterSetPayload(farm.orgId, effectiveFrom, { ...BASE_PARAMETERS, ...overrides }, curve)
  });
}

function snapshot(member: Member, batchId: string, asOf: string): Promise<Record<string, unknown>> {
  return rpc<Record<string, unknown>>(member, 'engine_snapshot', { p_batch_id: batchId, p_as_of: asOf });
}

/** Every `*_cents` value and every `bags` value anywhere in the document, with its path. */
function moneyAndBags(value: unknown, path = '$'): Array<[string, unknown]> {
  if (Array.isArray(value)) return value.flatMap((v, i) => moneyAndBags(v, `${path}[${i}]`));
  if (value === null || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([k, v]) => {
    const here = `${path}.${k}`;
    const own: Array<[string, unknown]> = (k.endsWith('_cents') || k === 'bags' || k.startsWith('price_cents')) && v !== null ? [[here, v]] : [];
    return [...own, ...moneyAndBags(v, here)];
  });
}

describe('engine_snapshot · the function (D25)', () => {
  it('is SECURITY INVOKER, STABLE, with an empty search_path, so RLS applies', async () => {
    const { rows } = await pool.query<{ prosecdef: boolean; provolatile: string; proconfig: string[] | null }>(
      `select p.prosecdef, p.provolatile, p.proconfig
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'engine_snapshot'`
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.prosecdef).toBe(false);
    expect(rows[0]!.provolatile).toBe('s');
    expect(rows[0]!.proconfig).toContain('search_path=""');
  });

  it('is executable by authenticated and not by anon (AD-89)', async () => {
    const { rows } = await pool.query<{ authenticated: boolean; anon: boolean }>(
      `select has_function_privilege('authenticated', 'public.engine_snapshot(uuid, date)', 'execute') as authenticated,
              has_function_privilege('anon', 'public.engine_snapshot(uuid, date)', 'execute') as anon`
    );
    expect(rows[0]).toEqual({ authenticated: true, anon: false });
  });

  it('returns one document with exactly the contract sections', async () => {
    const farm = await newFarm('T-RP2 sections');
    const batchId = await newBatch(farm, PLACEMENT);
    const doc = await snapshot(farm.owner, batchId, '2026-04-01');
    expect(Object.keys(doc).sort()).toEqual([...SNAPSHOT_SECTIONS].sort());
  });
});

describe('T-RP2 · the parameter set in force is chosen once, in SQL (D7, D10, D25)', () => {
  let farm: Farm;
  let batchId: string;
  const dearer: BreedCurve = {
    ...SEED_BREED_CURVE,
    phases: SEED_BREED_CURVE.phases.map((p) => ({ ...p, price_per_bag_cents: (p.price_per_bag_cents + 100n) as Cents }))
  };

  beforeAll(async () => {
    // newFarm's own set: effective 2026-01-01, slaughter target 1770 g.
    farm = await newFarm('T-RP2 set in force');
    await addSet(farm, '2026-03-01', { slaughter_target_g: grams(1800) });
    await addSet(farm, '2026-03-01', { slaughter_target_g: grams(1810) }); // same-day revision 2
    await addSet(farm, '2026-06-01', { slaughter_target_g: grams(1900) }, dearer);
    batchId = await newBatch(farm, PLACEMENT);
  });

  it.each([
    ['2026-02-15', 1770, 'before the March sets: the January set'],
    ['2026-03-01', 1810, 'on the March date: its highest revision'],
    ['2026-04-15', 1810, 'between sets: the latest effective on or before asOf'],
    ['2026-06-01', 1900, 'on the June date, which is after placement: asOf decides, not placement']
  ])('asOf %s gives slaughter target %i (%s)', async (asOf, target) => {
    const input = await loadEngineInput(farm.owner.client, batchId, on(asOf));
    expect(input.parameters.slaughter_target_g).toBe(target);
  });

  it('prices the pinned curve from the set in force, and passes the curve every time (D6, D11, D12)', async () => {
    const april = await loadEngineInput(farm.owner.client, batchId, on('2026-04-15'));
    const june = await loadEngineInput(farm.owner.client, batchId, on('2026-06-01'));
    expect(april.curve).toStrictEqual(SEED_BREED_CURVE);
    expect(june.curve).toStrictEqual(dearer);
  });

  it('no set in force is NoParametersInForce naming the date, not a MissingInput (D28)', async () => {
    const error = await loadEngineInput(farm.owner.client, batchId, on('2025-12-31')).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NoParametersInForce);
    expect((error as Error).message).toContain('2025-12-31');
  });

  it('no set in force raises RP002 from the function itself', async () => {
    await refused(snapshot(farm.owner, batchId, '2025-12-31'), 'RP002');
  });
});

describe('T-RP2 · shape rules (D5, D27)', () => {
  it('omits max_placement_birds when the set has none, and passes it when it has one', async () => {
    const farm = await newFarm('T-RP2 max placement');
    const batchId = await newBatch(farm, PLACEMENT);
    const without = await loadEngineInput(farm.owner.client, batchId, on('2026-04-01'));
    expect('max_placement_birds' in without.parameters).toBe(false);

    await addSet(farm, '2026-05-01', { max_placement_birds: 30000 });
    const withMax = await loadEngineInput(farm.owner.client, batchId, on('2026-05-01'));
    expect(withMax.parameters.max_placement_birds).toBe(30000);
  });

  it('gives zero overhead rows as { lines: [] } and zero planning bands as []', async () => {
    const farm = await newFarm('T-RP2 empty lists');
    await addSet(farm, '2026-02-01', { overheads: { lines: [] }, bulk_bands: [] });
    const batchId = await newBatch(farm, PLACEMENT);
    const input = await loadEngineInput(farm.owner.client, batchId, on('2026-04-01'));
    expect(input.parameters.overheads).toStrictEqual({ lines: [] });
    expect(input.parameters.bulk_bands).toStrictEqual([]);
  });
});

describe('T-RP2 · facts: current rows only, and nothing filtered by asOf except the set (D25)', () => {
  let farm: Farm;
  let batchId: string;
  const AS_OF = on('2026-04-01');

  beforeAll(async () => {
    farm = await newFarm('T-RP2 facts');
    batchId = await newBatch(farm, PLACEMENT);

    const [, day2] = await rpc<string[]>(farm.owner, 'record_daily_records', {
      p_batch_id: batchId,
      p_rows: [
        day({ record_date: '2026-03-10', mortality_cumulative: 1, cull_cumulative: 0 }),
        day({ record_date: '2026-03-11', mortality_cumulative: 2, cull_cumulative: 0 }),
        day({ record_date: '2026-03-12', mortality_cumulative: 4, cull_cumulative: 0 }),
        // After asOf: still returned. The engine filters records by asOf itself.
        day({ record_date: '2026-04-10', mortality_cumulative: 6, cull_cumulative: 0 })
      ]
    });
    await rpc(farm.owner, 'record_daily_records', {
      p_batch_id: batchId,
      p_rows: [day({ record_date: '2026-03-11', mortality_cumulative: 3, cull_cumulative: 0, supersedes_id: day2! })]
    });

    const draw = (collection_date: string, bags: string, feed_g: number) => ({
      batch_id: batchId,
      client_request_id: uuid(),
      collection_date,
      phase: 'STARTER',
      bags,
      feed_g,
      price_per_bag_cents: '3060',
      terms_days: 30,
      reference: null
    });
    const voidedDraw = await rpc<string>(farm.owner, 'record_feed_draw', { payload: draw('2026-03-10', '4', 200000) });
    await rpc(farm.owner, 'record_feed_draw', {
      payload: { batch_id: batchId, client_request_id: uuid(), supersedes_id: voidedDraw, voided: true }
    });
    await rpc(farm.owner, 'record_feed_draw', { payload: draw('2026-03-10', '2.5', 125000) });
    await rpc(farm.owner, 'record_feed_draw', { payload: draw('2026-04-05', '1', 50000) });

    const order = (extra: Record<string, unknown>) => ({
      batch_id: batchId,
      client_request_id: uuid(),
      avg_dressed_weight_g: null,
      price_cents_per_bird: null,
      price_cents_per_kg: null,
      bands: [],
      ...extra
    });
    await rpc(farm.owner, 'record_sales_order', {
      payload: order({
        channel: 'GATE',
        order_date: '2026-04-20',
        bird_count: 100,
        avg_live_weight_g: 2100,
        pricing_basis: 'PER_BIRD',
        price_cents_per_bird: '425',
        terms_days: 0
      })
    });
    await rpc(farm.owner, 'record_sales_order', {
      payload: order({
        channel: 'BULK',
        order_date: '2026-04-25',
        bird_count: 200,
        avg_live_weight_g: 2000,
        avg_dressed_weight_g: 1250,
        pricing_basis: 'BANDED',
        terms_days: 14,
        bands: [
          { dressed_floor_g: 1300, price_cents_per_bird: '370' },
          { dressed_floor_g: 1100, price_cents_per_bird: '350' }
        ]
      })
    });
  });

  it('returns current daily records only, day-numbered from placement, including those after asOf', async () => {
    const input = await loadEngineInput(farm.owner.client, batchId, AS_OF);
    expect(input.records.map((r) => [r.day_number, r.mortality_cumulative, r.feed_starter_kg])).toEqual([
      [1, 1, 1],
      [2, 3, 1],
      [3, 4, 1],
      [32, 6, 1]
    ]);
  });

  it('leaves voided draws out, keeps part bags as recorded, and keeps draws after asOf', async () => {
    const input = await loadEngineInput(farm.owner.client, batchId, AS_OF);
    expect(input.draws.map((d) => [d.collection_date, d.bags, d.kg])).toEqual([
      ['2026-03-10', 2.5, 125],
      ['2026-04-05', 1, 50]
    ]);
  });

  it('keeps forward orders; zero band rows is null, bands arrive ordered by floor', async () => {
    const input = await loadEngineInput(farm.owner.client, batchId, AS_OF);
    expect(input.sales.map((s) => [s.order_date, s.bands])).toEqual([
      ['2026-04-20', null],
      [
        '2026-04-25',
        [
          { dressed_floor_g: 1100, price_cents_per_bird: 350n },
          { dressed_floor_g: 1300, price_cents_per_bird: 370n }
        ]
      ]
    ]);
  });

  it('emits every money field and every bags value as a string (AD-91)', async () => {
    const doc = await snapshot(farm.owner, batchId, AS_OF);
    const found = moneyAndBags(doc);
    expect(found.length).toBeGreaterThan(10);
    expect(found.filter(([, v]) => typeof v !== 'string')).toEqual([]);
  });
});

describe('T-RP3 · money on the wire, through the database', () => {
  it('carries 2^53 + 1 cents exactly, as a string in the document and a bigint in EngineInput', async () => {
    const farm = await newFarm('T-RP3 big money');
    const batchId = await newBatch(farm, { ...PLACEMENT, chick_price_cents: '9007199254740993' });
    const doc = await snapshot(farm.owner, batchId, '2026-04-01');
    expect((doc['batch'] as Record<string, unknown>)['chick_price_cents']).toBe('9007199254740993');
    const input = await loadEngineInput(farm.owner.client, batchId, on('2026-04-01'));
    expect(input.batch.chick_price_cents).toBe(9007199254740993n);
  });
});

describe('T-RP2 · the cash section: current openings, and unlinked transactions before placement (D25, AD-67)', () => {
  it('returns exactly those, as strings, with nothing voided or superseded', async () => {
    const farm = await newFarm('T-RP2 cash');
    const batchId = await newBatch(farm, PLACEMENT);
    const otherBatch = await newBatch(farm, { ...PLACEMENT, placement_date: '2026-01-10' });

    const accountId = await rpc<string>(farm.owner, 'record_cash_account', {
      payload: {
        org_id: farm.orgId,
        name: 'Farm account',
        client_request_id: uuid(),
        opening_date: '2026-02-01',
        opening_balance_cents: '500000'
      }
    });
    const { data: opening, error } = await farm.owner.client.from('cash_accounts').select('opening_version_id').eq('id', accountId).single();
    if (error) throw new Error(error.message);
    await rpc(farm.owner, 'record_cash_account', {
      payload: {
        account_id: accountId,
        supersedes_id: (opening as { opening_version_id: string }).opening_version_id,
        client_request_id: uuid(),
        opening_date: '2026-02-01',
        opening_balance_cents: '600000'
      }
    });

    const txn = (txn_date: string, direction: string, amount_cents: string, batch_id: string | null) =>
      rpc<string>(farm.owner, 'record_cash_transaction', {
        payload: { account_id: accountId, client_request_id: uuid(), txn_date, direction, amount_cents, category: 'test', batch_id }
      });
    const unlinked = await txn('2026-03-01', 'OUT', '20000', null);
    const otherBatchsIncome = await txn('2026-03-06', 'IN', '7000', otherBatch);
    await txn('2026-03-02', 'OUT', '1000', batchId); // linked to this batch: out
    await txn('2026-03-10', 'OUT', '3000', null); // on placement day: out
    const voided = await txn('2026-03-05', 'IN', '5000', null);
    await rpc(farm.owner, 'record_cash_transaction', {
      payload: { account_id: accountId, client_request_id: uuid(), supersedes_id: voided, voided: true }
    });

    const doc = await snapshot(farm.owner, batchId, '2026-04-01');
    const cash = doc['cash'] as { accounts: Array<Record<string, unknown>>; transactions: Array<Record<string, unknown>> };
    expect(cash.accounts).toEqual([{ id: accountId, opening_date: '2026-02-01', opening_balance_cents: '600000' }]);
    expect(cash.transactions.map((t) => [t['id'], t['txn_date'], t['direction'], t['amount_cents']])).toEqual([
      [unlinked, '2026-03-01', 'OUT', '20000'],
      [otherBatchsIncome, '2026-03-06', 'IN', '7000']
    ]);
  });
});

describe('access: the role check comes first, and "not permitted" equals "not found" (AD-87, AD-88)', () => {
  let farm: Farm;
  let batchId: string;

  beforeAll(async () => {
    farm = await newFarm('T-RP2 access');
    batchId = await newBatch(farm, PLACEMENT);
  });

  it('a MANAGER loads the batch', async () => {
    const input = await loadEngineInput(farm.manager.client, batchId, on('2026-04-01'));
    expect(input.batch.placement_date).toBe('2026-03-10');
  });

  it('a WORKER is Forbidden, and never reaches the mapping', async () => {
    await expect(loadEngineInput(farm.worker.client, batchId, on('2026-04-01'))).rejects.toBeInstanceOf(Forbidden);
  });

  it('a WORKER is Forbidden even where no set is in force: the role is checked before anything is read', async () => {
    await expect(loadEngineInput(farm.worker.client, batchId, on('2025-01-01'))).rejects.toBeInstanceOf(Forbidden);
  });

  it('an OWNER of another organisation and a batch that does not exist get the same 42501', async () => {
    const stranger = await newMember(await newOrg('T-RP2 stranger'), 'OWNER');
    const theirs = await refused(snapshot(stranger, batchId, '2026-04-01'), '42501');
    const missing = await refused(snapshot(farm.owner, uuid(), '2026-04-01'), '42501');
    expect(theirs.message).toBe(missing.message);
    await expect(loadEngineInput(stranger.client, batchId, on('2026-04-01'))).rejects.toBeInstanceOf(Forbidden);
  });
});
