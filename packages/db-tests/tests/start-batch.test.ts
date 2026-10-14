/**
 * T-SB11 to T-SB17 · Start batch on the local stack (u8-start-batch.md D1, D4,
 * D7, D8, D9). The unit half is T-SB10 in `apps/web/tests/repositories/`.
 *
 * Daniel's real case throughout: 6,000 ordered + 60 extras at $1.00.
 */
import type { Cents, IsoDate } from '@runproduce/engine';
import {
  breedCurves,
  captureBatches,
  Conflict,
  farmBatches,
  placementByRequest,
  recordBatch,
  recordBatchPlacement,
  StaleCorrection,
  type BatchInsert
} from '../../../apps/web/lib/repositories/index.js';
import { parseStartBatchForm, type CorrectRequest, type StartRequest } from '../../../apps/web/lib/start/placement.js';
import { submitPlacement } from '../../../apps/web/lib/start/save.js';
import { day, newFarm, type Farm } from '../src/payloads.js';
import { pool, refused, rowCount, rpc, uuid } from '../src/harness.js';

let farm: Farm;
let other: Farm;
/** The farm's today, as the database computes it (D7). */
let farmToday: IsoDate;
let farmTomorrow: IsoDate;

beforeAll(async () => {
  [farm, other] = await Promise.all([newFarm('T-SB'), newFarm('T-SB-other')]);
  const { rows } = await pool.query<{ today: string; tomorrow: string }>(
    `select ((now() at time zone 'Africa/Harare')::date)::text as today,
            ((now() at time zone 'Africa/Harare')::date + 1)::text as tomorrow`
  );
  farmToday = rows[0]!.today as IsoDate;
  farmTomorrow = rows[0]!.tomorrow as IsoDate;
});

afterAll(async () => {
  await pool.end();
});

const code = (prefix: string) => `${prefix}-${uuid().slice(0, 8)}`;

const daniel = (over: Partial<BatchInsert> = {}): BatchInsert => ({
  orgId: farm.orgId,
  code: code('D'),
  breedCurveId: farm.curveId,
  placementDate: '2026-10-12' as IsoDate,
  chickCount: 6000,
  extraChickCount: 60,
  chickPriceCents: 100n as Cents,
  clientRequestId: uuid(),
  ...over
});

/** The raw payload, for what the repository's own checks would never send. */
const rawPayload = (over: Record<string, unknown> = {}) => ({
  org_id: farm.orgId,
  code: code('R'),
  breed_curve_id: farm.curveId,
  placement_date: '2026-10-12',
  chick_count: 6000,
  extra_chick_count: 60,
  chick_price_cents: '100',
  client_request_id: uuid(),
  ...over
});

describe('T-SB11 · recordBatch and the round trip', () => {
  it.each(['owner', 'manager'] as const)('an %s starts Daniel’s batch, read back as 6000, 60 and 100n', async (who) => {
    const input = daniel();
    const batchId = await recordBatch(farm[who].client, input);
    const found = (await farmBatches(farm[who].client)).find((b) => b.batchId === batchId);
    expect(found).toMatchObject({
      code: input.code,
      breedCurveId: farm.curveId,
      placementDate: '2026-10-12',
      chickCount: 6000,
      extraChickCount: 60,
      chickPriceCents: 100n,
      closedOn: null
    });
    expect(typeof found?.chickPriceCents).toBe('bigint');
    const { rows } = await pool.query('select created_by from facts.batches where id = $1', [batchId]);
    expect(rows[0].created_by).toBe(farm[who].userId);
  });

  it('a retry with the same client request id returns the same batch and writes nothing', async () => {
    const input = daniel();
    const first = await recordBatch(farm.owner.client, input);
    const second = await recordBatch(farm.owner.client, input);
    expect(second).toBe(first);
    expect(await rowCount('select 1 from facts.batches where code = $1', [input.code])).toBe(1);
    await expect(placementByRequest(farm.owner.client, input.clientRequestId)).resolves.toEqual({
      batchId: first,
      code: input.code
    });
    await expect(placementByRequest(farm.owner.client, uuid())).resolves.toBeNull();
  });

  it('lists the farm’s curves for the form', async () => {
    await expect(breedCurves(farm.manager.client)).resolves.toEqual([{ id: farm.curveId, name: expect.any(String) }]);
  });
});

describe('T-SB12 · who may start a batch (D1)', () => {
  it('refuses a WORKER in the database itself', async () => {
    await refused(rpc(farm.worker, 'record_batch', { payload: rawPayload() }), '42501');
  });

  it('refuses a MANAGER naming another farm, or another farm’s curve', async () => {
    await refused(rpc(farm.manager, 'record_batch', { payload: rawPayload({ org_id: other.orgId, breed_curve_id: other.curveId }) }), '42501');
    await refused(rpc(farm.manager, 'record_batch', { payload: rawPayload({ breed_curve_id: other.curveId }) }), '42501');
  });

  it('refuses a WORKER’s correction', async () => {
    const batchId = await recordBatch(farm.owner.client, daniel());
    const [head] = (await farmBatches(farm.owner.client)).filter((b) => b.batchId === batchId);
    await refused(
      rpc(farm.worker, 'record_batch_placement', {
        payload: { ...rawPayload(), batch_id: batchId, supersedes_id: head!.placementVersionId, extra_chick_count: 61 }
      }),
      '42501'
    );
  });
});

describe('T-SB13 · names (D7, D8)', () => {
  it('says a duplicate name in the batch’s words, closed batches included', async () => {
    const input = daniel();
    const batchId = await recordBatch(farm.owner.client, input);
    await rpc(farm.owner, 'record_batch_closure', {
      payload: { batch_id: batchId, closed_on: '2026-10-13', supersedes_id: null, client_request_id: uuid() }
    });
    const error = await recordBatch(farm.manager.client, daniel({ code: input.code })).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Conflict);
    expect((error as Error).message).toBe(`There is already a batch called ${input.code}. Pick another name.`);
  });

  it.each([
    ['blank', ''],
    ['padded', ' B1 '],
    ['25 characters', 'A'.repeat(25)]
  ])('refuses a %s code in the database', async (_label, bad) => {
    await refused(rpc(farm.owner, 'record_batch', { payload: rawPayload({ code: bad }) }), '23514');
  });

  it('accepts 24 characters', async () => {
    await expect(rpc(farm.owner, 'record_batch', { payload: rawPayload({ code: `X${uuid().replaceAll('-', '').slice(0, 23)}` }) })).resolves.toEqual(
      expect.any(String)
    );
  });
});

describe('T-SB14 · no placement after the farm’s today (D7)', () => {
  it('refuses tomorrow in Harare from record_batch, and accepts today', async () => {
    const error = await refused(rpc(farm.owner, 'record_batch', { payload: rawPayload({ placement_date: farmTomorrow }) }), '23514');
    expect(error.message).toContain('after the farm');
    await expect(rpc(farm.owner, 'record_batch', { payload: rawPayload({ placement_date: farmToday }) })).resolves.toEqual(
      expect.any(String)
    );
  });

  it('refuses tomorrow from record_batch_placement', async () => {
    const batchId = await recordBatch(farm.owner.client, daniel());
    const head = (await farmBatches(farm.owner.client)).find((b) => b.batchId === batchId)!;
    await refused(
      rpc(farm.owner, 'record_batch_placement', {
        payload: { ...rawPayload(), batch_id: batchId, supersedes_id: head.placementVersionId, placement_date: farmTomorrow }
      }),
      '23514'
    );
  });
});

describe('T-SB15 · corrections are new versions (D9)', () => {
  it('supersedes the head, keeps the old version in history, and changes the extras', async () => {
    const batchId = await recordBatch(farm.owner.client, daniel());
    const head = (await farmBatches(farm.owner.client)).find((b) => b.batchId === batchId)!;
    const next = await recordBatchPlacement(farm.manager.client, {
      batchId,
      supersedesId: head.placementVersionId,
      placementDate: head.placementDate,
      chickCount: 6000,
      extraChickCount: 61,
      chickPriceCents: 100n as Cents,
      clientRequestId: uuid()
    });
    expect((await farmBatches(farm.owner.client)).find((b) => b.batchId === batchId)).toMatchObject({
      placementVersionId: next,
      extraChickCount: 61
    });
    const { rows } = await pool.query(
      'select id, supersedes_id, extra_chick_count, is_current from public.batches_history where batch_id = $1 order by created_at',
      [batchId]
    );
    expect(rows).toEqual([
      { id: head.placementVersionId, supersedes_id: null, extra_chick_count: 60, is_current: false },
      { id: next, supersedes_id: head.placementVersionId, extra_chick_count: 61, is_current: true }
    ]);
  });

  it('writes nothing for identical values, and refuses a stale head', async () => {
    const batchId = await recordBatch(farm.owner.client, daniel());
    const head = (await farmBatches(farm.owner.client)).find((b) => b.batchId === batchId)!;
    const same = {
      batchId,
      supersedesId: head.placementVersionId,
      placementDate: head.placementDate,
      chickCount: 6000,
      extraChickCount: 60,
      chickPriceCents: 100n as Cents,
      clientRequestId: uuid()
    };
    await expect(recordBatchPlacement(farm.owner.client, same)).resolves.toBe(head.placementVersionId);
    await recordBatchPlacement(farm.owner.client, { ...same, extraChickCount: 62, clientRequestId: uuid() });
    const stale = await recordBatchPlacement(farm.owner.client, { ...same, extraChickCount: 63, clientRequestId: uuid() }).catch(
      (e: unknown) => e
    );
    expect(stale).toBeInstanceOf(StaleCorrection);
    expect((stale as Error).message).toBe('This batch was changed since you opened it. Reload.');
  });

  it('refuses at commit a date past a recorded day, and a flock below the birds removed', async () => {
    const batchId = await recordBatch(farm.owner.client, daniel({ placementDate: '2026-10-01' as IsoDate }));
    await rpc(farm.worker, 'record_daily_records', {
      p_batch_id: batchId,
      p_rows: [day({ record_date: '2026-10-02', mortality_cumulative: 6000, cull_cumulative: 50 })]
    });
    const head = (await farmBatches(farm.owner.client)).find((b) => b.batchId === batchId)!;
    const correction = (over: Record<string, unknown>) => ({
      payload: {
        ...rawPayload(),
        batch_id: batchId,
        supersedes_id: head.placementVersionId,
        placement_date: '2026-10-01',
        ...over
      }
    });
    const late = await refused(rpc(farm.owner, 'record_batch_placement', correction({ placement_date: '2026-10-03' })), '23514');
    expect(late.message).toContain('before placement');
    const small = await refused(rpc(farm.owner, 'record_batch_placement', correction({ extra_chick_count: 49 })), '23514');
    expect(small.message).toContain('removals exceed the flock');
  });
});

describe('T-SB16 · the name and the curve are fixed once the batch starts (D4, D9)', () => {
  it.each([
    ['code', `'renamed'`],
    ['breed_curve_id', 'breed_curve_id']
  ])('refuses an update of %s, even from a superuser connection', async (column, value) => {
    const batchId = await recordBatch(farm.owner.client, daniel());
    await expect(pool.query(`update facts.batches set ${column} = ${value} where id = $1`, [batchId])).rejects.toThrow(
      /append-only/
    );
  });
});

describe('T-SB17 · what a WORKER sees of it', () => {
  it('reads no row of public.batches or public.breed_curves, and sees the batch through capture_batches()', async () => {
    const input = daniel();
    const batchId = await recordBatch(farm.owner.client, input);
    const batches = await farm.worker.client.from('batches').select('id');
    expect(batches.error).toBeNull();
    expect(batches.data).toEqual([]);
    const curves = await farm.worker.client.from('breed_curves').select('id');
    expect(curves.data).toEqual([]);
    expect((await captureBatches(farm.worker.client)).map((b) => b.batchId)).toContain(batchId);
  });
});

describe('T-SB18 · the action’s core, check then save (D12)', () => {
  const form = (over: Record<string, unknown>): StartRequest | CorrectRequest => {
    const parsed = parseStartBatchForm({
      kind: 'start',
      mode: 'check',
      name: code('S'),
      placementDate: '2026-10-12',
      chickCount: '6000',
      extraChickCount: '60',
      chickPrice: '1.00',
      curveId: farm.curveId,
      clientRequestId: uuid(),
      ...over
    });
    if (!parsed.ok) throw new Error(parsed.message);
    return parsed.request;
  };
  const actor = () => ({ orgId: farm.orgId, role: 'MANAGER' as const });

  it('check answers with the confirm lines and writes nothing; save writes once, and a retry is saved', async () => {
    const name = code('S');
    const crid = uuid();
    const before = await rowCount('select 1 from facts.batches where org_id = $1', [farm.orgId]);

    const checked = await submitPlacement(farm.manager.client, actor(), form({ name, clientRequestId: crid }), farmToday);
    expect(checked).toEqual({
      kind: 'confirm',
      confirm: [`Batch name ‘${name}’ can’t be changed later.`, expect.stringMatching(/^Placement date Mon 12 Oct → today is day \d+\.$/)]
    });
    expect(await rowCount('select 1 from facts.batches where org_id = $1', [farm.orgId])).toBe(before);

    const save = form({ name, clientRequestId: crid, mode: 'save' });
    await expect(submitPlacement(farm.manager.client, actor(), save, farmToday)).resolves.toEqual({ kind: 'saved', code: name });
    // The reply was lost and the farmer taps Save again: the same request, not "already a batch called".
    await expect(submitPlacement(farm.manager.client, actor(), save, farmToday)).resolves.toEqual({ kind: 'saved', code: name });
    expect(await rowCount('select 1 from facts.batches where code = $1', [name])).toBe(1);

    // A new request with the same name is the duplicate.
    await expect(submitPlacement(farm.manager.client, actor(), form({ name, mode: 'save' }), farmToday)).resolves.toEqual({
      kind: 'refused',
      message: `There is already a batch called ${name}. Pick another name.`
    });
  });

  it('corrects through the same core, and a WORKER claiming a MANAGER’s role still reads no batch', async () => {
    const name = code('S');
    await submitPlacement(farm.owner.client, { orgId: farm.orgId, role: 'OWNER' }, form({ name, mode: 'save' }), farmToday);
    const batch = (await farmBatches(farm.owner.client)).find((b) => b.code === name)!;
    const correction = (over: Record<string, unknown>) => {
      const parsed = parseStartBatchForm({
        kind: 'correct',
        mode: 'save',
        batchId: batch.batchId,
        supersedesId: batch.placementVersionId,
        placementDate: '2026-10-12',
        chickCount: '6000',
        extraChickCount: '61',
        chickPrice: '1.00',
        clientRequestId: uuid(),
        ...over
      });
      if (!parsed.ok) throw new Error(parsed.message);
      return parsed.request;
    };
    await expect(submitPlacement(farm.manager.client, actor(), correction({}), farmToday)).resolves.toEqual({
      kind: 'saved',
      code: name
    });
    expect((await farmBatches(farm.owner.client)).find((b) => b.code === name)?.extraChickCount).toBe(61);

    await expect(submitPlacement(farm.worker.client, actor(), correction({ extraChickCount: '62' }), farmToday)).resolves.toEqual({
      kind: 'refused',
      message: 'That batch isn’t one you can see.'
    });
  });
});
