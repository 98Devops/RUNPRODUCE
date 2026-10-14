/**
 * T-T9 · The Today save on the local stack, as a WORKER, through the action's
 * core (U7 chunk 5, D30, D25 amended). The unit half is T-T6 and T-T8 in
 * `apps/web/tests/today/`.
 *
 * `today` is passed in, as the action passes the farm's date, so these dates
 * never drift with the clock.
 */
import { SEED_BREED_CURVE, standardFeedForDay, type IsoDate } from '@runproduce/engine';
import { dailyRecords } from '../../../apps/web/lib/repositories/index.js';
import type { DayEntry } from '../../../apps/web/lib/today/day-row.js';
import { removeDay, saveDay } from '../../../apps/web/lib/today/save.js';
import { newBatch, newFarm, type Farm } from '../src/payloads.js';
import { pool, rowCount, uuid } from '../src/harness.js';

const POINTS = SEED_BREED_CURVE.points;
const FIRST_GROWER_DAY = POINTS.find((p) => p.phase === 'GROWER')!.day_number;
const PLACEMENT = '2026-02-06' as IsoDate;

function dateOfDay(day: number): IsoDate {
  return new Date(Date.UTC(2026, 1, 6) + (day - 1) * 86_400_000).toISOString().slice(0, 10) as IsoDate;
}

const TODAY = dateOfDay(FIRST_GROWER_DAY + 5);

const entry = (day: number, over: Partial<DayEntry> = {}): DayEntry => ({
  recordDate: dateOfDay(day),
  mortalityCumulative: 0,
  cullCumulative: 0,
  feedKg: '10',
  standardConfirmed: false,
  avgWeightG: null,
  weightSampleSize: null,
  notes: null,
  clientRequestId: uuid(),
  supersedesId: null,
  ...over
});

let farm: Farm;
let other: Farm;
let batchId: string;

beforeAll(async () => {
  [farm, other] = await Promise.all([newFarm('T-T9'), newFarm('T-T9-other')]);
  batchId = await newBatch(farm, { placement_date: PLACEMENT, chick_count: 100, extra_chick_count: 0, chick_price_cents: '100' });
});

afterAll(async () => {
  await pool.end();
});

const recordFor = async (day: number) =>
  (await dailyRecords(farm.worker.client, batchId)).find((r) => r.recordDate === dateOfDay(day));

describe('T-T9 · the Today save, as a WORKER', () => {
  it('a confirmed standard stores exactly standardFeedForDay’s grams, STANDARD_CONFIRMED / FROM_CURVE', async () => {
    const result = await saveDay(farm.worker.client, { batchId, entry: entry(1, { standardConfirmed: true, feedKg: '' }) }, TODAY);
    expect(result).toEqual({ kind: 'saved', dayNumber: 1, next: dateOfDay(2) });

    const standard = standardFeedForDay({ points: POINTS, day: 1, chick_count: 100, extra_chick_count: 0, records: [] });
    expect(standard.kind).toBe('standard');
    expect(await recordFor(1)).toMatchObject({
      feedStarterG: standard.kind === 'standard' ? standard.feed_g : NaN,
      feedGrowerG: 0,
      feedFinisherG: 0,
      feedEntrySource: 'STANDARD_CONFIRMED',
      feedPhase: 'STARTER',
      feedPhaseSource: 'FROM_CURVE',
      createdBy: farm.worker.userId
    });
  });

  it('a typed 302.5 stores 302,500 g, MEASURED', async () => {
    const result = await saveDay(farm.worker.client, { batchId, entry: entry(2, { feedKg: '302.5', mortalityCumulative: 1 }) }, TODAY);
    expect(result).toMatchObject({ kind: 'saved', dayNumber: 2 });
    expect(await recordFor(2)).toMatchObject({ feedStarterG: 302_500, feedEntrySource: 'MEASURED', mortalityCumulative: 1 });
  });

  it('a retry with the same client request id writes nothing new', async () => {
    const retry = entry(3, { mortalityCumulative: 1 });
    const count = () => rowCount('select 1 from facts.daily_record_versions where batch_id = $1', [batchId]);
    await saveDay(farm.worker.client, { batchId, entry: retry }, TODAY);
    const before = await count();
    expect(await saveDay(farm.worker.client, { batchId, entry: retry }, TODAY)).toMatchObject({ kind: 'saved', dayNumber: 3 });
    expect(await count()).toBe(before);
  });

  it('a backfilled day is filed under its own day’s phase, not today’s', async () => {
    const grower = FIRST_GROWER_DAY + 1;
    const starter = FIRST_GROWER_DAY - 1;
    await saveDay(farm.worker.client, { batchId, entry: entry(grower, { mortalityCumulative: 2, feedKg: '40' }) }, TODAY);
    const result = await saveDay(farm.worker.client, { batchId, entry: entry(starter, { mortalityCumulative: 2, feedKg: '30' }) }, TODAY);
    // The next day without a record after the backfill is the first grower day.
    expect(result).toEqual({ kind: 'saved', dayNumber: starter, next: dateOfDay(FIRST_GROWER_DAY) });
    expect(await recordFor(grower)).toMatchObject({ feedGrowerG: 40_000, feedStarterG: 0, feedPhase: 'GROWER' });
    expect(await recordFor(starter)).toMatchObject({ feedStarterG: 30_000, feedGrowerG: 0, feedPhase: 'STARTER' });
  });

  it('a correction from a form opened before someone else’s is StaleCorrection', async () => {
    const opened = (await recordFor(2))!;
    await saveDay(farm.owner.client, { batchId, entry: entry(2, { mortalityCumulative: 1, feedKg: '303', supersedesId: opened.id }) }, TODAY);
    const late = await saveDay(
      farm.worker.client,
      { batchId, entry: entry(2, { mortalityCumulative: 1, feedKg: '304', supersedesId: opened.id }) },
      TODAY
    );
    expect(late).toEqual({ kind: 'refused', message: 'This record changed since you opened it.' });
    expect((await recordFor(2))!.feedStarterG).toBe(303_000);
  });

  it('a WORKER cannot correct the OWNER’s record, and is told who can', async () => {
    const head = (await recordFor(2))!;
    expect(head.createdBy).toBe(farm.owner.userId);
    const result = await saveDay(
      farm.worker.client,
      { batchId, entry: entry(2, { mortalityCumulative: 1, feedKg: '305', supersedesId: head.id }) },
      TODAY
    );
    expect(result).toEqual({ kind: 'refused', message: 'Recorded by someone else. A manager or owner can correct it.' });
  });

  it('a blank form for a date saved since it opened is refused, not written over', async () => {
    const result = await saveDay(farm.worker.client, { batchId, entry: entry(1, { feedKg: '1' }) }, TODAY);
    expect(result).toEqual({ kind: 'refused', message: 'Someone saved this date first. Reload.' });
  });

  it('the author removes their own record; it is gone from the day list', async () => {
    const own = (await recordFor(3))!;
    const result = await removeDay(
      farm.worker.client,
      { batchId, recordDate: dateOfDay(3), recordId: own.id, clientRequestId: uuid() },
      farm.worker.userId
    );
    expect(result).toEqual({ kind: 'removed', dayNumber: 3 });
    expect(await recordFor(3)).toBeUndefined();
  });

  it('a batch on another farm is not one the WORKER can record for', async () => {
    const theirs = await newBatch(other, { placement_date: PLACEMENT, chick_count: 50, extra_chick_count: 0, chick_price_cents: '100' });
    expect(await saveDay(farm.worker.client, { batchId: theirs, entry: entry(1) }, TODAY)).toEqual({
      kind: 'refused',
      message: 'That batch isn’t one you can record for.'
    });
  });
});
