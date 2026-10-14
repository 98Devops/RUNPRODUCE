/**
 * T-T5 · The screen's records to the engine's (U7 chunk 5, finding 2).
 * `dailyRecords` returns dates and grams; `standardFeedForDay` takes day
 * numbers and kg. The day number is the engine's `dayNumberFor`, as
 * `loadEngineInput` does, and nothing else is derived.
 */
import type { IsoDate } from '@runproduce/engine';
import type { CapturedDay } from '../../lib/repositories/index.js';
import { toDailyRecords } from '../../lib/today/records.js';

const day = (over: Partial<CapturedDay>): CapturedDay => ({
  id: '00000000-0000-4000-8000-000000000001',
  recordDate: '2026-10-06' as IsoDate,
  mortalityCumulative: 0,
  cullCumulative: 0,
  feedStarterG: 0,
  feedGrowerG: 0,
  feedFinisherG: 0,
  avgWeightG: null,
  weightSampleSize: null,
  notes: null,
  createdBy: null,
  feedEntrySource: null,
  feedPhase: null,
  feedPhaseSource: null,
  ...over
});

describe('T-T5 · toDailyRecords', () => {
  it('numbers the placement date day 1', () => {
    const [record] = toDailyRecords('2026-10-06' as IsoDate, [day({ recordDate: '2026-10-06' as IsoDate })]);
    expect(record?.day_number).toBe(1);
  });

  it('numbers across a month end from the placement date', () => {
    const records = toDailyRecords('2026-09-25' as IsoDate, [
      day({ recordDate: '2026-09-30' as IsoDate }),
      day({ recordDate: '2026-10-06' as IsoDate })
    ]);
    expect(records.map((r) => r.day_number)).toEqual([6, 12]);
  });

  it('carries the totals, weights and provenance through unchanged, and grams become kg', () => {
    const [record] = toDailyRecords('2026-10-06' as IsoDate, [
      day({
        recordDate: '2026-10-17' as IsoDate,
        mortalityCumulative: 14,
        cullCumulative: 3,
        feedStarterG: 302_500,
        avgWeightG: 410,
        weightSampleSize: 50,
        feedEntrySource: 'MEASURED',
        feedPhase: 'STARTER',
        feedPhaseSource: 'FROM_CURVE'
      })
    ]);
    expect(record).toEqual({
      day_number: 12,
      mortality_cumulative: 14,
      cull_cumulative: 3,
      feed_starter_kg: 302.5,
      feed_grower_kg: 0,
      feed_finisher_kg: 0,
      avg_weight_g: 410,
      weight_sample_size: 50,
      feed_entry_source: 'MEASURED',
      feed_phase: 'STARTER',
      feed_phase_source: 'FROM_CURVE'
    });
  });

  it('keeps a null provenance null: a row from before the form says nothing', () => {
    const [record] = toDailyRecords('2026-10-06' as IsoDate, [day({})]);
    expect([record?.feed_entry_source, record?.feed_phase, record?.feed_phase_source]).toEqual([null, null, null]);
  });

  it('keeps the order it was given', () => {
    const records = toDailyRecords('2026-10-06' as IsoDate, [
      day({ recordDate: '2026-10-08' as IsoDate }),
      day({ recordDate: '2026-10-07' as IsoDate })
    ]);
    expect(records.map((r) => r.day_number)).toEqual([3, 2]);
  });
});
