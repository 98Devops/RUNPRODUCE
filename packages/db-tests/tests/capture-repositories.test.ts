/**
 * T-C6 to T-C9 · The capture repositories on the local stack (U7 chunk 3,
 * D19), called by real signed-in members. The unit half is T-C1 to T-C4 in
 * `apps/web/tests/repositories/capture.test.ts`.
 *
 * T-C9 is U6's unwritten T-AC1 extension for AD-86 (a WORKER corrects only
 * their own records), written here because it is this function's rule.
 */
import { computeDecision, SEED_BREED_CURVE, type IsoDate } from '@runproduce/engine';
import {
  captureBatches,
  curvePoints,
  dailyRecords,
  Forbidden,
  IntegrityRejected,
  loadEngineInput,
  recordDailyRecords,
  StaleCorrection,
  type DailyRecordRow
} from '../../../apps/web/lib/repositories/index.js';
import { newBatch, newFarm, type Farm } from '../src/payloads.js';
import { newMember, pool, rowCount, uuid, type Member } from '../src/harness.js';

let farm: Farm;

beforeAll(async () => {
  farm = await newFarm('T-C6-9');
});

afterAll(async () => {
  await pool.end();
});

const PLACEMENT = { placement_date: '2026-02-06', chick_count: 100, extra_chick_count: 0, chick_price_cents: '100' };

/** A day as the capture form will send it: feed under the curve's phase, measured. */
function row(recordDate: string, mortality: number, change: Partial<DailyRecordRow> = {}): DailyRecordRow {
  return {
    clientRequestId: uuid(),
    recordDate,
    mortalityCumulative: mortality,
    cullCumulative: 0,
    feedStarterG: 1000,
    feedGrowerG: 0,
    feedFinisherG: 0,
    avgWeightG: null,
    weightSampleSize: null,
    notes: null,
    feedEntrySource: 'MEASURED',
    feedPhase: 'STARTER',
    feedPhaseSource: 'FROM_CURVE',
    supersedesId: null,
    voided: false,
    ...change
  };
}

function write(by: Member, batchId: string, rows: DailyRecordRow[]): Promise<string[]> {
  return recordDailyRecords(by.client, { batchId, rows });
}

async function refusal(call: Promise<unknown>): Promise<unknown> {
  return call.then(
    () => {
      throw new Error('expected a refusal, but the call succeeded');
    },
    (e: unknown) => e
  );
}

const versions = (batchId: string) => rowCount('select 1 from facts.daily_record_versions where batch_id = $1', [batchId]);

describe('T-C6 · the round trip: a WORKER writes and reads back, the OWNER’s engine reads the same records', () => {
  let batchId: string;
  const written = [
    row('2026-02-06', 0, { feedStarterG: 1500, feedEntrySource: 'STANDARD_CONFIRMED' }),
    row('2026-02-07', 1, { feedStarterG: 1820, avgWeightG: 60, weightSampleSize: 10 }),
    row('2026-02-08', 1, { feedStarterG: 700, feedGrowerG: 300, feedEntrySource: null, feedPhase: null, feedPhaseSource: null })
  ];

  beforeAll(async () => {
    batchId = await newBatch(farm, PLACEMENT);
  });

  it('the WORKER finds the batch and its curve, and reads every point of it', async () => {
    const batch = (await captureBatches(farm.worker.client)).find((b) => b.batchId === batchId);
    expect(batch).toMatchObject({ placementDate: '2026-02-06', chickCount: 100, breedCurveId: farm.curveId });
    const points = await curvePoints(farm.worker.client, batch!.breedCurveId);
    expect(points).toEqual(SEED_BREED_CURVE.points);
  });

  it('writes three days in one call and gets three ids back', async () => {
    const ids = await write(farm.worker, batchId, written);
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);
  });

  it('reads them back unchanged, authored by the WORKER', async () => {
    const days = await dailyRecords(farm.worker.client, batchId);
    expect(days.map(({ id: _id, createdBy, ...rest }) => ({ createdBy, ...rest }))).toEqual(
      written.map(({ clientRequestId: _c, supersedesId: _s, voided: _v, ...rest }) => ({ createdBy: farm.worker.userId, ...rest }))
    );
  });

  it('the OWNER’s loadEngineInput carries them to the engine: day numbers, kilograms and provenance', async () => {
    const input = await loadEngineInput(farm.owner.client, batchId, '2026-02-08' as IsoDate);
    expect(input.records).toEqual([
      {
        day_number: 1,
        mortality_cumulative: 0,
        cull_cumulative: 0,
        feed_starter_kg: 1.5,
        feed_grower_kg: 0,
        feed_finisher_kg: 0,
        avg_weight_g: null,
        weight_sample_size: null,
        feed_entry_source: 'STANDARD_CONFIRMED',
        feed_phase: 'STARTER',
        feed_phase_source: 'FROM_CURVE'
      },
      {
        day_number: 2,
        mortality_cumulative: 1,
        cull_cumulative: 0,
        feed_starter_kg: 1.82,
        feed_grower_kg: 0,
        feed_finisher_kg: 0,
        avg_weight_g: 60,
        weight_sample_size: 10,
        feed_entry_source: 'MEASURED',
        feed_phase: 'STARTER',
        feed_phase_source: 'FROM_CURVE'
      },
      {
        day_number: 3,
        mortality_cumulative: 1,
        cull_cumulative: 0,
        feed_starter_kg: 0.7,
        feed_grower_kg: 0.3,
        feed_finisher_kg: 0,
        avg_weight_g: null,
        weight_sample_size: null,
        feed_entry_source: null,
        feed_phase: null,
        feed_phase_source: null
      }
    ]);
    expect(computeDecision(input).kind).toBe('ok');
  });
});

describe('T-C7 · the database’s rules reach a WORKER as IntegrityRejected, through the repository', () => {
  it('removals over the flock (the SECURITY DEFINER trigger, which sees the placement the WORKER cannot)', async () => {
    const batchId = await newBatch(farm, PLACEMENT);
    const error = await refusal(write(farm.worker, batchId, [row('2026-02-06', 101)]));
    expect(error).toBeInstanceOf(IntegrityRejected);
    expect(await versions(batchId)).toBe(0);
  });

  it('a provenance CHECK, naming its constraint', async () => {
    const batchId = await newBatch(farm, PLACEMENT);
    const error = await refusal(write(farm.worker, batchId, [row('2026-02-06', 0, { feedGrowerG: 500 })]));
    expect(error).toBeInstanceOf(IntegrityRejected);
    expect((error as Error).message).toContain('daily_record_versions_feed_under_phase');
    expect(await versions(batchId)).toBe(0);
  });
});

describe('T-C8 · retries and resubmissions', () => {
  it('the same client request id returns the same id and writes once', async () => {
    const batchId = await newBatch(farm, PLACEMENT);
    const day = row('2026-02-06', 0);
    const [first] = await write(farm.worker, batchId, [day]);
    await expect(write(farm.worker, batchId, [day])).resolves.toEqual([first]);
    expect(await versions(batchId)).toBe(1);
  });

  it('identical values under a new request id return the current id and write nothing', async () => {
    const batchId = await newBatch(farm, PLACEMENT);
    const [first] = await write(farm.worker, batchId, [row('2026-02-06', 0)]);
    await expect(write(farm.worker, batchId, [row('2026-02-06', 0)])).resolves.toEqual([first]);
    expect(await versions(batchId)).toBe(1);
  });

  it('a change to provenance alone writes a correction', async () => {
    const batchId = await newBatch(farm, PLACEMENT);
    const [first] = await write(farm.worker, batchId, [row('2026-02-06', 0)]);
    const [second] = await write(farm.worker, batchId, [row('2026-02-06', 0, { feedEntrySource: 'STANDARD_CONFIRMED', supersedesId: first! })]);
    expect(second).not.toBe(first);
    expect(await versions(batchId)).toBe(2);
  });
});

describe('T-C9 · AD-86: a WORKER corrects and voids only their own records; a MANAGER any', () => {
  let otherWorker: Member;

  beforeAll(async () => {
    otherWorker = await newMember(farm.orgId, 'WORKER');
  });

  it('a WORKER corrects their own record', async () => {
    const batchId = await newBatch(farm, PLACEMENT);
    const [id] = await write(farm.worker, batchId, [row('2026-02-06', 0)]);
    await write(farm.worker, batchId, [row('2026-02-06', 2, { supersedesId: id! })]);
    expect((await dailyRecords(farm.worker.client, batchId)).map((d) => d.mortalityCumulative)).toEqual([2]);
  });

  it('a WORKER voids their own record', async () => {
    const batchId = await newBatch(farm, PLACEMENT);
    const [id] = await write(farm.worker, batchId, [row('2026-02-06', 0)]);
    await write(farm.worker, batchId, [row('2026-02-06', 0, { supersedesId: id!, voided: true })]);
    await expect(dailyRecords(farm.worker.client, batchId)).resolves.toEqual([]);
  });

  it('refuses a WORKER correcting another WORKER’s record, naming the day', async () => {
    const batchId = await newBatch(farm, PLACEMENT);
    const [id] = await write(otherWorker, batchId, [row('2026-02-07', 0)]);
    const error = await refusal(write(farm.worker, batchId, [row('2026-02-07', 3, { supersedesId: id! })]));
    expect(error).toBeInstanceOf(Forbidden);
    expect((error as Error).message).toBe('Day 2 was recorded by another user; a manager or owner can correct it');
  });

  it('refuses a WORKER voiding another’s record', async () => {
    const batchId = await newBatch(farm, PLACEMENT);
    const [id] = await write(otherWorker, batchId, [row('2026-02-06', 0)]);
    const error = await refusal(write(farm.worker, batchId, [row('2026-02-06', 0, { supersedesId: id!, voided: true })]));
    expect(error).toBeInstanceOf(Forbidden);
  });

  it('refuses a WORKER correcting their own record after a MANAGER corrected it: it is no longer theirs', async () => {
    const batchId = await newBatch(farm, PLACEMENT);
    const [id] = await write(farm.worker, batchId, [row('2026-02-06', 0)]);
    const [managers] = await write(farm.manager, batchId, [row('2026-02-06', 1, { supersedesId: id! })]);
    const error = await refusal(write(farm.worker, batchId, [row('2026-02-06', 2, { supersedesId: managers! })]));
    expect(error).toBeInstanceOf(Forbidden);
  });

  it('refuses a WORKER correcting a seed row, which is no one’s', async () => {
    const batchId = await newBatch(farm, PLACEMENT);
    const { rows } = await pool.query<{ id: string }>(
      `insert into facts.daily_record_versions (org_id, batch_id, record_date, mortality_cumulative, cull_cumulative,
         feed_starter_g, feed_grower_g, feed_finisher_g, client_request_id)
       values ($1, $2, '2026-02-06', 0, 0, 1000, 0, 0, $3) returning id`,
      [farm.orgId, batchId, uuid()]
    );
    const error = await refusal(write(farm.worker, batchId, [row('2026-02-06', 1, { supersedesId: rows[0]!.id })]));
    expect(error).toBeInstanceOf(Forbidden);
  });

  it('refuses a WORKER’s first entry on a date someone else recorded, which would supersede it', async () => {
    const batchId = await newBatch(farm, PLACEMENT);
    await write(otherWorker, batchId, [row('2026-02-06', 0)]);
    const error = await refusal(write(farm.worker, batchId, [row('2026-02-06', 4)]));
    expect(error).toBeInstanceOf(Forbidden);
  });

  it('writes nothing from a multi-day call that contains one refused row', async () => {
    const batchId = await newBatch(farm, PLACEMENT);
    const [theirs] = await write(otherWorker, batchId, [row('2026-02-06', 0)]);
    const before = await versions(batchId);
    const error = await refusal(
      write(farm.worker, batchId, [row('2026-02-07', 1), row('2026-02-06', 1, { supersedesId: theirs! }), row('2026-02-08', 1)])
    );
    expect(error).toBeInstanceOf(Forbidden);
    expect(await versions(batchId)).toBe(before);
  });

  it('a MANAGER corrects any WORKER’s record', async () => {
    const batchId = await newBatch(farm, PLACEMENT);
    const [id] = await write(farm.worker, batchId, [row('2026-02-06', 0)]);
    await write(farm.manager, batchId, [row('2026-02-06', 5, { supersedesId: id! })]);
    expect((await dailyRecords(farm.owner.client, batchId)).map((d) => [d.mortalityCumulative, d.createdBy])).toEqual([
      [5, farm.manager.userId]
    ]);
  });

  it('a correction of a version that is no longer current is StaleCorrection', async () => {
    const batchId = await newBatch(farm, PLACEMENT);
    const [first] = await write(farm.worker, batchId, [row('2026-02-06', 0)]);
    await write(farm.worker, batchId, [row('2026-02-06', 1, { supersedesId: first! })]);
    const error = await refusal(write(farm.worker, batchId, [row('2026-02-06', 2, { supersedesId: first! })]));
    expect(error).toBeInstanceOf(StaleCorrection);
    expect((error as Error).message).toBe('This record changed since you opened it.');
  });
});
