/**
 * What Today shows for one batch and date (U7 D29), worked out on the server
 * from what it read: the day line, the totals either side, the standard, and
 * who may correct or remove the day's record.
 */
import { SEED_BREED_CURVE, type IsoDate } from '@runproduce/engine';
import type { CapturedDay, CaptureBatch } from '../../lib/repositories/index.js';
import { buildTodayView, type TodayViewInput } from '../../lib/today/view.js';

const POINTS = SEED_BREED_CURVE.points;
const LAST_CURVE_DAY = Math.max(...POINTS.map((p) => p.day_number));
const ME = 'user-me';

function dateOfDay(day: number): IsoDate {
  return new Date(Date.UTC(2026, 9, 6) + (day - 1) * 86_400_000).toISOString().slice(0, 10) as IsoDate;
}

const BATCH: CaptureBatch = {
  batchId: '00000000-0000-4000-8000-0000000000b1',
  code: 'B1',
  placementDate: dateOfDay(1),
  chickCount: 6000,
  extraChickCount: 60,
  breedCurveId: '00000000-0000-4000-8000-0000000000c1'
};

const recorded = (day: number, mortality: number, culls: number, over: Partial<CapturedDay> = {}): CapturedDay => ({
  id: `00000000-0000-4000-8000-${String(day).padStart(12, '0')}`,
  recordDate: dateOfDay(day),
  mortalityCumulative: mortality,
  cullCumulative: culls,
  feedStarterG: 300_000,
  feedGrowerG: 0,
  feedFinisherG: 0,
  avgWeightG: null,
  weightSampleSize: null,
  notes: null,
  createdBy: ME,
  feedEntrySource: 'MEASURED',
  feedPhase: 'STARTER',
  feedPhaseSource: 'FROM_CURVE',
  ...over
});

const input = (over: Partial<TodayViewInput> = {}): TodayViewInput => ({
  batch: BATCH,
  points: POINTS,
  records: [],
  date: dateOfDay(12),
  today: dateOfDay(12),
  role: 'WORKER',
  userId: ME,
  ...over
});

describe('buildTodayView · the day line', () => {
  it('names the day and date', () => {
    expect(buildTodayView(input())).toMatchObject({ dayNumber: 12, dayDate: 'Sat 17 Oct', isToday: true });
  });

  it('says nothing is recorded yet on a new batch', () => {
    expect(buildTodayView(input()).lastRecorded).toBeNull();
  });

  it('gives the last recorded day', () => {
    expect(buildTodayView(input({ records: [recorded(8, 9, 1)] })).lastRecorded).toEqual({ day: 8 });
  });
});

/** Records for each day listed, with totals that only ever rise. */
const recordedDays = (days: readonly number[]) => days.map((d) => recorded(d, d, 0));
const daysExcept = (last: number, skip: readonly number[]) =>
  Array.from({ length: last }, (_, i) => i + 1).filter((d) => !skip.includes(d));

describe('buildTodayView · missing days (TD-14): every day from placement to yesterday with no record', () => {
  it('finds a gap before the latest record: days 10 and 11 missing, day 12 recorded', () => {
    const view = buildTodayView(input({ records: recordedDays(daysExcept(12, [10, 11])) }));
    expect(view.lastRecorded).toEqual({ day: 12 });
    expect(view.missing).toEqual({ count: 2, firstDay: 10, firstDate: dateOfDay(10) });
  });

  it('counts gaps on both sides of the latest record, and points at the earliest', () => {
    // Recorded 1 to 7 and 9; missing 8, 10 and 11. Today, day 12, is not yet missing.
    const view = buildTodayView(input({ records: recordedDays(daysExcept(9, [8])) }));
    expect(view.missing).toEqual({ count: 3, firstDay: 8, firstDate: dateOfDay(8) });
  });

  it('counts every day of a batch with nothing recorded yet, from day 1', () => {
    expect(buildTodayView(input()).missing).toEqual({ count: 11, firstDay: 1, firstDate: dateOfDay(1) });
  });

  it('says nothing is missing when every day to yesterday is recorded, with today still open', () => {
    expect(buildTodayView(input({ records: recordedDays(daysExcept(11, [])) })).missing).toBeNull();
  });

  it('says nothing is missing on placement day itself', () => {
    expect(buildTodayView(input({ date: dateOfDay(1), today: dateOfDay(1) })).missing).toBeNull();
  });

  it('counts from the farm’s today, not the date being viewed', () => {
    const view = buildTodayView(input({ records: recordedDays(daysExcept(12, [10, 11])), date: dateOfDay(3) }));
    expect(view.missing).toEqual({ count: 2, firstDay: 10, firstDate: dateOfDay(10) });
  });
});

describe('buildTodayView · the totals and the standard', () => {
  it('gives the latest earlier record’s totals for "was N on day X" and the carried culls', () => {
    const view = buildTodayView(input({ records: [recorded(9, 10, 2), recorded(11, 14, 3)] }));
    expect(view.previous).toEqual({ day: 11, mortality: 14, culls: 3 });
  });

  it('has no previous on the first record of a batch', () => {
    expect(buildTodayView(input({ date: dateOfDay(1) })).previous).toBeNull();
  });

  it('gives the standard for the flock left after the latest earlier record, rounded for display only', () => {
    const perBird = POINTS.find((p) => p.day_number === 12)!.feed_g;
    const view = buildTodayView(input({ records: [recorded(11, 14, 3)] }));
    expect(view.feed).toEqual({
      phase: 'STARTER',
      lastCurveDay: null,
      standardKg: ((Math.floor((perBird * 6043 + 50) / 100)) / 10).toFixed(1)
    });
  });

  it('has no standard past the curve, and names its last day', () => {
    const day = LAST_CURVE_DAY + 2;
    const view = buildTodayView(input({ date: dateOfDay(day), today: dateOfDay(day) }));
    expect(view.feed).toEqual({ phase: 'FINISHER', lastCurveDay: LAST_CURVE_DAY, standardKg: null });
  });
});

describe('buildTodayView · a day already recorded', () => {
  it('opens with its stored values, the feed from its own phase column', () => {
    const view = buildTodayView(input({ records: [recorded(12, 14, 3, { feedStarterG: 302_500, avgWeightG: 410, weightSampleSize: 50 })] }));
    expect(view.existing).toEqual({
      id: '00000000-0000-4000-8000-000000000012',
      mortality: 14,
      culls: 3,
      feedKg: '302.5',
      standardConfirmed: false,
      avgWeightG: 410,
      weightSampleSize: 50,
      notes: null
    });
  });

  it('reads a row from before the form, with no phase, as the sum of its feed columns', () => {
    const view = buildTodayView(
      input({ records: [recorded(12, 14, 3, { feedStarterG: 200_000, feedGrowerG: 100_000, feedPhase: null, feedPhaseSource: null, feedEntrySource: null })] })
    );
    expect(view.existing?.feedKg).toBe('300.0');
  });

  it('keeps the flag on a confirmed standard', () => {
    const view = buildTodayView(input({ records: [recorded(12, 14, 3, { feedEntrySource: 'STANDARD_CONFIRMED' })] }));
    expect(view.existing?.standardConfirmed).toBe(true);
  });

  it.each([
    ['WORKER', ME, true, true],
    ['WORKER', 'someone-else', false, false],
    ['MANAGER', 'someone-else', true, false],
    ['OWNER', 'someone-else', true, false],
    ['OWNER', ME, true, true]
  ] as const)('a %s on a record by %s: correct %s, remove %s', (role, author, canEdit, canRemove) => {
    const view = buildTodayView(input({ role, records: [recorded(12, 14, 3, { createdBy: author })] }));
    expect([view.canEdit, view.canRemove]).toEqual([canEdit, canRemove]);
  });

  it('lets anyone enter a day with no record, and remove nothing', () => {
    expect([buildTodayView(input()).canEdit, buildTodayView(input()).canRemove]).toEqual([true, false]);
  });
});
