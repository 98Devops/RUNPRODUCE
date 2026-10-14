/**
 * T-C1 to T-C4 · The capture repositories against a fake client (U7 chunk 3,
 * D19). The database half, as a WORKER on the local stack, is T-C6 to T-C9 in
 * `packages/db-tests/tests/capture-repositories.test.ts`.
 *
 * The fake stands in for the network only: `rpc` and a `from(...)` query
 * builder that records what was asked and returns a `{ data, error }` pair, as
 * PostgREST would.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  captureBatches,
  Conflict,
  curvePoints,
  dailyRecords,
  Forbidden,
  IntegrityRejected,
  recordDailyRecords,
  RepositoryError,
  StaleCorrection,
  type DailyRecordRow
} from '../../lib/repositories/index.js';

interface Reply {
  readonly data?: unknown;
  readonly error?: { code: string; message: string };
}

interface Call {
  readonly kind: 'rpc' | 'from';
  readonly name: string;
  readonly args?: unknown;
  readonly steps: Array<[string, ...unknown[]]>;
}

function fakeClient(reply: Reply) {
  const calls: Call[] = [];
  const result = { data: reply.data ?? null, error: reply.error ?? null };
  const client = {
    rpc: async (name: string, args: unknown) => {
      calls.push({ kind: 'rpc', name, args, steps: [] });
      return result;
    },
    from: (name: string) => {
      const call: Call = { kind: 'from', name, steps: [] };
      calls.push(call);
      const builder = {
        select: (...a: unknown[]) => (call.steps.push(['select', ...a]), builder),
        eq: (...a: unknown[]) => (call.steps.push(['eq', ...a]), builder),
        order: (...a: unknown[]) => (call.steps.push(['order', ...a]), builder),
        then: (resolve: (r: typeof result) => unknown, reject?: (e: unknown) => unknown) =>
          Promise.resolve(result).then(resolve, reject)
      };
      return builder;
    }
  };
  return { client: client as unknown as SupabaseClient, calls };
}

const BATCH = '00000000-0000-4000-8000-0000000000b1';
const CURVE = '00000000-0000-4000-8000-0000000000c1';
const USER = '00000000-0000-4000-8000-0000000000d1';
const RECORD = '00000000-0000-4000-8000-0000000000e1';
const REQUEST = '00000000-0000-4000-8000-0000000000f1';

const dbError = (code: string, message = `raw ${code}`) => ({ error: { code, message } });

describe('T-C1 · captureBatches', () => {
  const row = {
    batch_id: BATCH,
    code: 'B-1',
    placement_date: '2026-02-06',
    chick_count: 3000,
    extra_chick_count: 30,
    breed_curve_id: CURVE
  };

  it('calls capture_batches() and maps each row', async () => {
    const { client, calls } = fakeClient({ data: [row] });
    await expect(captureBatches(client)).resolves.toEqual([
      { batchId: BATCH, code: 'B-1', placementDate: '2026-02-06', chickCount: 3000, extraChickCount: 30, breedCurveId: CURVE }
    ]);
    expect(calls).toEqual([{ kind: 'rpc', name: 'capture_batches', args: undefined, steps: [] }]);
  });

  it('refuses a column it did not ask for, so a widened function cannot carry money to a WORKER unnoticed', async () => {
    const { client } = fakeClient({ data: [{ ...row, chick_price_cents: '100' }] });
    await expect(captureBatches(client)).rejects.toBeInstanceOf(RepositoryError);
  });

  it('refuses a row missing the curve id', async () => {
    const { breed_curve_id: _omitted, ...without } = row;
    const { client } = fakeClient({ data: [without] });
    await expect(captureBatches(client)).rejects.toBeInstanceOf(RepositoryError);
  });

  it('maps a database error by SQLSTATE', async () => {
    const { client } = fakeClient(dbError('42501', 'not permitted'));
    await expect(captureBatches(client)).rejects.toBeInstanceOf(Forbidden);
  });
});

describe('T-C2 · dailyRecords', () => {
  const row = {
    id: RECORD,
    record_date: '2026-02-06',
    mortality_cumulative: 2,
    cull_cumulative: 0,
    feed_starter_g: 12500,
    feed_grower_g: 0,
    feed_finisher_g: 0,
    avg_weight_g: null,
    weight_sample_size: null,
    notes: null,
    created_by: USER,
    feed_entry_source: 'STANDARD_CONFIRMED',
    feed_phase: 'STARTER',
    feed_phase_source: 'FROM_CURVE'
  };
  const seedRow = {
    ...row,
    record_date: '2026-02-07',
    avg_weight_g: 95,
    weight_sample_size: 20,
    notes: 'seed',
    created_by: null,
    feed_entry_source: null,
    feed_phase: null,
    feed_phase_source: null
  };

  it('reads the current records of one batch, in date order, from public.daily_records', async () => {
    const { client, calls } = fakeClient({ data: [] });
    await dailyRecords(client, BATCH);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.name).toBe('daily_records');
    const steps = Object.fromEntries(calls[0]!.steps.map(([step, ...args]) => [step, args]));
    expect(steps['eq']).toEqual(['batch_id', BATCH]);
    expect(steps['order']).toEqual(['record_date', { ascending: true }]);
    for (const column of ['id', 'created_by', 'feed_entry_source', 'feed_phase', 'feed_phase_source']) {
      expect(String(steps['select']![0])).toContain(column);
    }
  });

  it('maps rows, grams staying grams, provenance set and unrecorded', async () => {
    const { client } = fakeClient({ data: [row, seedRow] });
    await expect(dailyRecords(client, BATCH)).resolves.toEqual([
      {
        id: RECORD,
        recordDate: '2026-02-06',
        mortalityCumulative: 2,
        cullCumulative: 0,
        feedStarterG: 12500,
        feedGrowerG: 0,
        feedFinisherG: 0,
        avgWeightG: null,
        weightSampleSize: null,
        notes: null,
        createdBy: USER,
        feedEntrySource: 'STANDARD_CONFIRMED',
        feedPhase: 'STARTER',
        feedPhaseSource: 'FROM_CURVE'
      },
      {
        id: RECORD,
        recordDate: '2026-02-07',
        mortalityCumulative: 2,
        cullCumulative: 0,
        feedStarterG: 12500,
        feedGrowerG: 0,
        feedFinisherG: 0,
        avgWeightG: 95,
        weightSampleSize: 20,
        notes: 'seed',
        createdBy: null,
        feedEntrySource: null,
        feedPhase: null,
        feedPhaseSource: null
      }
    ]);
  });

  it.each<[string, Record<string, unknown>]>([
    ['an unknown entry source', { feed_entry_source: 'GUESSED' }],
    ['an unknown phase', { feed_phase: 'PRESTARTER' }],
    ['an unknown phase source', { feed_phase_source: 'ASSUMED' }],
    ['feed arriving as kilograms', { feed_starter_g: 12.5 }]
  ])('refuses %s, never passing it on', async (_what, change) => {
    const { client } = fakeClient({ data: [{ ...row, ...change }] });
    await expect(dailyRecords(client, BATCH)).rejects.toBeInstanceOf(RepositoryError);
  });

  it('maps a database error by SQLSTATE', async () => {
    const { client } = fakeClient(dbError('42501', 'not permitted'));
    await expect(dailyRecords(client, BATCH)).rejects.toBeInstanceOf(Forbidden);
  });
});

describe('T-C3 · curvePoints', () => {
  const points = [
    { day_number: 1, weight_g: 60, feed_g: 15, phase: 'STARTER' },
    { day_number: 2, weight_g: 80, feed_g: 20, phase: 'STARTER' }
  ];

  it('reads one curve’s points in day order, as the engine’s BreedCurvePoint', async () => {
    const { client, calls } = fakeClient({ data: points });
    await expect(curvePoints(client, CURVE)).resolves.toEqual(points);
    expect(calls[0]!.name).toBe('breed_curve_points');
    const steps = Object.fromEntries(calls[0]!.steps.map(([step, ...args]) => [step, args]));
    expect(steps['eq']).toEqual(['curve_id', CURVE]);
    expect(steps['order']).toEqual(['day_number', { ascending: true }]);
  });

  it('refuses a curve with no points, rather than passing on an empty curve as "no standard"', async () => {
    const { client } = fakeClient({ data: [] });
    await expect(curvePoints(client, CURVE)).rejects.toThrow(/no points/);
  });

  it('refuses an unknown phase', async () => {
    const { client } = fakeClient({ data: [{ ...points[0], phase: 'PRESTARTER' }] });
    await expect(curvePoints(client, CURVE)).rejects.toBeInstanceOf(RepositoryError);
  });
});

describe('T-C4 · recordDailyRecords', () => {
  const standard: DailyRecordRow = {
    clientRequestId: REQUEST,
    recordDate: '2026-02-06',
    mortalityCumulative: 2,
    cullCumulative: 0,
    feedStarterG: 12500,
    feedGrowerG: 0,
    feedFinisherG: 0,
    avgWeightG: null,
    weightSampleSize: null,
    notes: null,
    feedEntrySource: 'STANDARD_CONFIRMED',
    feedPhase: 'STARTER',
    feedPhaseSource: 'FROM_CURVE',
    supersedesId: null,
    voided: false
  };

  const WIRE_KEYS = [
    'client_request_id',
    'record_date',
    'mortality_cumulative',
    'cull_cumulative',
    'feed_starter_g',
    'feed_grower_g',
    'feed_finisher_g',
    'avg_weight_g',
    'weight_sample_size',
    'notes',
    'feed_entry_source',
    'feed_phase',
    'feed_phase_source',
    'supersedes_id',
    'voided'
  ];

  it('sends every key on every row, nulls included, and nothing about who or where (U6 D23)', async () => {
    const { client, calls } = fakeClient({ data: [RECORD] });
    await recordDailyRecords(client, { batchId: BATCH, rows: [{ ...standard, feedEntrySource: null, feedPhase: null, feedPhaseSource: null }] });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.name).toBe('record_daily_records');
    const args = calls[0]!.args as { p_batch_id: string; p_rows: Array<Record<string, unknown>> };
    expect(Object.keys(args).sort()).toEqual(['p_batch_id', 'p_rows']);
    expect(args.p_batch_id).toBe(BATCH);
    expect(Object.keys(args.p_rows[0]!).sort()).toEqual([...WIRE_KEYS].sort());
    expect(args.p_rows[0]).toMatchObject({ feed_entry_source: null, feed_phase: null, feed_phase_source: null });
  });

  it('maps each field to its column', async () => {
    const { client, calls } = fakeClient({ data: [RECORD] });
    await recordDailyRecords(client, { batchId: BATCH, rows: [{ ...standard, supersedesId: RECORD, avgWeightG: 95, weightSampleSize: 20 }] });
    expect((calls[0]!.args as { p_rows: unknown[] }).p_rows[0]).toEqual({
      client_request_id: REQUEST,
      record_date: '2026-02-06',
      mortality_cumulative: 2,
      cull_cumulative: 0,
      feed_starter_g: 12500,
      feed_grower_g: 0,
      feed_finisher_g: 0,
      avg_weight_g: 95,
      weight_sample_size: 20,
      notes: null,
      feed_entry_source: 'STANDARD_CONFIRMED',
      feed_phase: 'STARTER',
      feed_phase_source: 'FROM_CURVE',
      supersedes_id: RECORD,
      voided: false
    });
  });

  it('returns the row ids in input order', async () => {
    const ids = [RECORD, '00000000-0000-4000-8000-0000000000e2'];
    const { client } = fakeClient({ data: ids });
    const rows = [standard, { ...standard, clientRequestId: '00000000-0000-4000-8000-0000000000f2', recordDate: '2026-02-07' }];
    await expect(recordDailyRecords(client, { batchId: BATCH, rows })).resolves.toEqual(ids);
  });

  it('refuses a reply whose id count does not match the rows sent', async () => {
    const { client } = fakeClient({ data: [] });
    await expect(recordDailyRecords(client, { batchId: BATCH, rows: [standard] })).rejects.toBeInstanceOf(RepositoryError);
  });

  it.each<[string, () => Parameters<typeof recordDailyRecords>[1]]>([
    ['feed in kilograms, not integer grams', () => ({ batchId: BATCH, rows: [{ ...standard, feedStarterG: 12.5 }] })],
    ['no client request id', () => ({ batchId: BATCH, rows: [{ ...standard, clientRequestId: '' }] })],
    ['a client request id that is not a uuid', () => ({ batchId: BATCH, rows: [{ ...standard, clientRequestId: 'draft-1' }] })],
    ['a batch id that is not a uuid', () => ({ batchId: 'B-1', rows: [standard] })],
    ['a date that is not YYYY-MM-DD', () => ({ batchId: BATCH, rows: [{ ...standard, recordDate: '6/2/2026' }] })],
    ['an unknown entry source', () => ({ batchId: BATCH, rows: [{ ...standard, feedEntrySource: 'GUESSED' as never }] })],
    ['no rows at all', () => ({ batchId: BATCH, rows: [] })]
  ])('refuses %s before any call', async (_what, input) => {
    const { client, calls } = fakeClient({ data: [RECORD] });
    await expect(recordDailyRecords(client, input())).rejects.toBeInstanceOf(RepositoryError);
    expect(calls).toEqual([]);
  });

  it('has no field for the organisation or the author: the type cannot carry them', () => {
    // @ts-expect-error org_id is taken from the batch by the database, never sent (U6 D23)
    const withOrg: DailyRecordRow = { ...standard, orgId: BATCH };
    // @ts-expect-error created_by is auth.uid(), set by the database (U6 D23)
    const withAuthor: DailyRecordRow = { ...standard, createdBy: USER };
    expect([withOrg, withAuthor]).toHaveLength(2);
  });

  it.each<[string, string, new (...args: never[]) => Error, string | null]>([
    ['42501', 'Day 3 was recorded by another user; a manager or owner can correct it', Forbidden, 'Day 3 was recorded by another user; a manager or owner can correct it'],
    ['23514', 'Day 6: mortality_cumulative must be monotonic', IntegrityRejected, 'Day 6: mortality_cumulative must be monotonic'],
    ['23505', 'duplicate key', Conflict, 'Someone saved this date first. Reload.'],
    ['RP001', 'stale', StaleCorrection, 'This record changed since you opened it.']
  ])('maps SQLSTATE %s to its typed error and sentence', async (code, message, type, shown) => {
    const { client } = fakeClient(dbError(code, message));
    const error = await recordDailyRecords(client, { batchId: BATCH, rows: [standard] }).then(
      () => null,
      (e: unknown) => e
    );
    expect(error).toBeInstanceOf(type);
    expect((error as Error).message).toBe(shown);
  });
});
