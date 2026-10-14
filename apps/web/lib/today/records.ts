/**
 * The screen's records to the engine's (U7 chunk 5, finding 2), as
 * `loadEngineInput` maps them: the day number is the engine's `dayNumberFor`,
 * and grams become kg. Nothing else is derived here.
 */
import { dayNumberFor, type DailyRecord, type DayNumber, type IsoDate } from '@runproduce/engine';
import type { CapturedDay } from '@/lib/repositories';

export function toDailyRecords(placementDate: IsoDate, days: readonly CapturedDay[]): DailyRecord[] {
  return days.map((d) => ({
    day_number: dayNumberFor(placementDate, d.recordDate) as DayNumber,
    mortality_cumulative: d.mortalityCumulative,
    cull_cumulative: d.cullCumulative,
    feed_starter_kg: d.feedStarterG / 1000,
    feed_grower_kg: d.feedGrowerG / 1000,
    feed_finisher_kg: d.feedFinisherG / 1000,
    avg_weight_g: d.avgWeightG as DailyRecord['avg_weight_g'],
    weight_sample_size: d.weightSampleSize,
    feed_entry_source: d.feedEntrySource,
    feed_phase: d.feedPhase,
    feed_phase_source: d.feedPhaseSource
  }));
}
