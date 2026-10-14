/**
 * The save and remove actions' cores (U7 D30, D7, D8): everything but the
 * session. Each checks the batch against the caller's `capture_batches()`,
 * which is the WORKER's access list, reads the records and curve again itself,
 * and writes through `recordDailyRecords`. RLS and the write function still
 * have the last word.
 *
 * Relative imports only: `packages/db-tests` runs this module directly (T-T9).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { dayNumberFor, type IsoDate } from '@runproduce/engine';
import {
  captureBatches,
  Conflict,
  curvePoints,
  dailyRecords,
  Forbidden,
  IntegrityRejected,
  recordDailyRecords,
  StaleCorrection,
  type CaptureBatch,
  type CapturedDay
} from '../repositories/index.js';
import { buildDayRow, type DayEntry } from './day-row.js';

export type SaveDayResult =
  | { readonly kind: 'saved'; readonly dayNumber: number; readonly next: IsoDate }
  | { readonly kind: 'refused'; readonly message: string };

export type RemoveDayResult =
  | { readonly kind: 'removed'; readonly dayNumber: number }
  | { readonly kind: 'refused'; readonly message: string };

export interface DayRemoval {
  readonly batchId: string;
  readonly recordDate: IsoDate;
  /** The record the form showed, so a removal of a changed record is stale. */
  readonly recordId: string;
  readonly clientRequestId: string;
}

const NOT_YOURS = 'That batch isn’t one you can record for.';
const refused = (message: string) => ({ kind: 'refused', message }) as const;

/** D8's sentences. Anything untyped says only that the save failed: no detail reaches the screen. */
export function saveErrorMessage(error: unknown): string {
  if (error instanceof IntegrityRejected) return error.message;
  if (error instanceof Forbidden) return 'Recorded by someone else. A manager or owner can correct it.';
  if (error instanceof Conflict || error instanceof StaleCorrection) return error.message;
  return 'Couldn’t save. Your entry is kept on this phone. Try again.';
}

async function captureBatch(client: SupabaseClient, batchId: string): Promise<CaptureBatch | undefined> {
  return (await captureBatches(client)).find((b) => b.batchId === batchId);
}

export async function saveDay(
  client: SupabaseClient,
  input: { readonly batchId: string; readonly entry: DayEntry },
  today: IsoDate
): Promise<SaveDayResult> {
  try {
    const batch = await captureBatch(client, input.batchId);
    if (batch === undefined) return refused(NOT_YOURS);
    const [records, points] = await Promise.all([
      dailyRecords(client, batch.batchId),
      curvePoints(client, batch.breedCurveId)
    ]);
    const built = buildDayRow(input.entry, {
      placementDate: batch.placementDate,
      chickCount: batch.chickCount,
      extraChickCount: batch.extraChickCount,
      points,
      records,
      today
    });
    if (built.kind === 'refused') return built;
    await recordDailyRecords(client, { batchId: batch.batchId, rows: [built.row] });
    return { kind: 'saved', dayNumber: built.dayNumber, next: nextUnrecorded(records, input.entry.recordDate, today) };
  } catch (error) {
    if (!(error instanceof IntegrityRejected || error instanceof Forbidden || error instanceof Conflict || error instanceof StaleCorrection)) {
      console.error('saveDay failed', error);
    }
    return refused(saveErrorMessage(error));
  }
}

/** The first day after the one just saved that still has no record, up to today; today if none. */
export function nextUnrecorded(records: readonly CapturedDay[], saved: IsoDate, today: IsoDate): IsoDate {
  const recorded = new Set(records.map((r) => r.recordDate));
  for (let date = addDay(saved); date <= today; date = addDay(date)) {
    if (!recorded.has(date)) return date;
  }
  return today;
}

function addDay(date: IsoDate): IsoDate {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, (d ?? 1) + 1)).toISOString().slice(0, 10) as IsoDate;
}

/**
 * Voids the author's own record for a day (D7). Only the author may: a
 * MANAGER or OWNER corrects someone else's record but does not remove it from
 * this screen. The void carries the record's own values; the write function
 * copies the head's regardless.
 */
export async function removeDay(client: SupabaseClient, removal: DayRemoval, userId: string): Promise<RemoveDayResult> {
  try {
    const batch = await captureBatch(client, removal.batchId);
    if (batch === undefined) return refused(NOT_YOURS);
    const current = (await dailyRecords(client, batch.batchId)).find((r) => r.recordDate === removal.recordDate);
    if (current === undefined) return refused('There is no record for this day to remove. Reload.');
    if (current.id !== removal.recordId) return refused('This record changed since you opened it.');
    if (current.createdBy !== userId) return refused('Only the person who recorded this day can remove it.');

    await recordDailyRecords(client, {
      batchId: batch.batchId,
      rows: [
        {
          clientRequestId: removal.clientRequestId,
          recordDate: current.recordDate,
          mortalityCumulative: current.mortalityCumulative,
          cullCumulative: current.cullCumulative,
          feedStarterG: current.feedStarterG,
          feedGrowerG: current.feedGrowerG,
          feedFinisherG: current.feedFinisherG,
          avgWeightG: current.avgWeightG,
          weightSampleSize: current.weightSampleSize,
          notes: current.notes,
          feedEntrySource: current.feedEntrySource,
          feedPhase: current.feedPhase,
          feedPhaseSource: current.feedPhaseSource,
          supersedesId: current.id,
          voided: true
        }
      ]
    });
    return { kind: 'removed', dayNumber: dayNumberFor(batch.placementDate, current.recordDate) };
  } catch (error) {
    if (!(error instanceof IntegrityRejected || error instanceof Forbidden || error instanceof StaleCorrection)) {
      console.error('removeDay failed', error);
    }
    return refused(saveErrorMessage(error));
  }
}
