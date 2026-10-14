/**
 * What Today shows for one batch and date (U7 D29), from what the page read.
 * Pure; the page passes the farm's date in. Every figure here is the engine's
 * or the database's: the standard is `standardFeedForDay`'s, rounded for
 * display only, and the form's "Use" sends a flag, never this figure (D25).
 */
import {
  dayNumberFor,
  feedPhaseForDay,
  standardFeedForDay,
  type BreedCurvePoint,
  type IsoDate,
  type Phase
} from '@runproduce/engine';
import { formatKgTenths, formatWeekdayDate } from '../format.js';
import type { CaptureBatch, CapturedDay, Role } from '../repositories/index.js';
import { toDailyRecords } from './records.js';

export interface TodayViewInput {
  readonly batch: CaptureBatch;
  readonly points: readonly BreedCurvePoint[];
  readonly records: readonly CapturedDay[];
  /** The date being viewed, already checked to lie from placement to today. */
  readonly date: IsoDate;
  readonly today: IsoDate;
  readonly role: Role;
  readonly userId: string;
}

export interface TodayView {
  readonly dayNumber: number;
  readonly dayDate: string;
  readonly isToday: boolean;
  /** `behind` counts the unrecorded days between the last record and the farm's today. */
  readonly lastRecorded: { readonly day: number; readonly behind: number } | null;
  readonly previous: { readonly day: number; readonly mortality: number; readonly culls: number } | null;
  readonly feed: { readonly phase: Phase; readonly lastCurveDay: number | null; readonly standardKg: string | null };
  readonly existing: {
    readonly id: string;
    readonly mortality: number;
    readonly culls: number;
    readonly feedKg: string;
    readonly standardConfirmed: boolean;
    readonly avgWeightG: number | null;
    readonly weightSampleSize: number | null;
    readonly notes: string | null;
  } | null;
  /** AD-86: a WORKER corrects their own records; a MANAGER or OWNER corrects any. */
  readonly canEdit: boolean;
  /** D7: only the author removes a record. */
  readonly canRemove: boolean;
}

const FEED_COLUMN = { STARTER: 'feedStarterG', GROWER: 'feedGrowerG', FINISHER: 'feedFinisherG' } as const;

export function buildTodayView(input: TodayViewInput): TodayView {
  const { batch, points, date, today, role, userId } = input;
  const records = input.records.slice().sort((a, b) => (a.recordDate < b.recordDate ? -1 : 1));
  const dayOf = (d: IsoDate) => dayNumberFor(batch.placementDate, d);
  const dayNumber = dayOf(date);

  const last = records.at(-1);
  const before = records.filter((r) => r.recordDate < date).pop();
  const current = records.find((r) => r.recordDate === date);

  const { phase } = feedPhaseForDay(points, dayNumber);
  const standard = standardFeedForDay({
    points,
    day: dayNumber,
    chick_count: batch.chickCount,
    extra_chick_count: batch.extraChickCount,
    records: toDailyRecords(batch.placementDate, records)
  });

  const mine = current !== undefined && current.createdBy === userId;
  return {
    dayNumber,
    dayDate: formatWeekdayDate(date),
    isToday: date === today,
    lastRecorded: last ? { day: dayOf(last.recordDate), behind: Math.max(0, dayOf(today) - dayOf(last.recordDate) - 1) } : null,
    previous: before ? { day: dayOf(before.recordDate), mortality: before.mortalityCumulative, culls: before.cullCumulative } : null,
    feed:
      standard.kind === 'standard'
        ? { phase, lastCurveDay: null, standardKg: formatKgTenths(standard.feed_g) }
        : { phase, lastCurveDay: standard.last_curve_day, standardKg: null },
    existing: current
      ? {
          id: current.id,
          mortality: current.mortalityCumulative,
          culls: current.cullCumulative,
          feedKg: formatKgTenths(
            current.feedPhase
              ? current[FEED_COLUMN[current.feedPhase]]
              : current.feedStarterG + current.feedGrowerG + current.feedFinisherG
          ),
          standardConfirmed: current.feedEntrySource === 'STANDARD_CONFIRMED',
          avgWeightG: current.avgWeightG,
          weightSampleSize: current.weightSampleSize,
          notes: current.notes
        }
      : null,
    canEdit: current === undefined || role !== 'WORKER' || mine,
    canRemove: mine
  };
}
