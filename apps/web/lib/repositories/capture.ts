/**
 * What daily capture reads and writes (U7 chunk 3, D19): three readers and one
 * writer, thin, Zod-parsed and mapped by SQLSTATE (D28, AD-93).
 *
 * - A reader that feeds the engine returns engine types (`curvePoints`, as
 *   `loadEngineInput` does); a reader for the screen returns camelCase
 *   (`captureBatches`, `dailyRecords`, as `myMemberships` does).
 * - Feed stays in integer grams here. Kilograms are the form's boundary (TD-5).
 * - Nothing here derives anything. The day number, the phase and the standard
 *   feed are the engine's (chunk 4); the rules are the database's.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import {
  ENTRY_SOURCES,
  PHASE_SOURCES,
  PHASES,
  type BreedCurvePoint,
  type DayNumber,
  type EntrySource,
  type Grams,
  type IsoDate,
  type Phase,
  type PhaseSource
} from '@runproduce/engine';
import { mapDatabaseError, RepositoryError } from './errors.js';

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .transform((s) => s as IsoDate);
const int = z.number().int();

function parse<T>(schema: z.ZodType<T>, data: unknown, what: string): T {
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new RepositoryError(`${what} returned an unexpected shape: ${parsed.error.message}`);
  return parsed.data;
}

// ─── captureBatches ──────────────────────────────────────────────────────────

/** A batch a member may capture for: open, placed, in their organisation (AD-87). */
export interface CaptureBatch {
  readonly batchId: string;
  readonly code: string;
  readonly placementDate: IsoDate;
  readonly chickCount: number;
  readonly extraChickCount: number;
  /** The curve the batch is pinned to (U6 D11); its points come from `curvePoints`. */
  readonly breedCurveId: string;
}

/**
 * Strict: a column this reader did not ask for is refused. `capture_batches()`
 * is how a WORKER reads money-bearing tables, so a widened function must fail
 * here, loudly, rather than carry data the screen never declared.
 */
const captureBatchRows = z.array(
  z.strictObject({
    batch_id: z.uuid(),
    code: z.string(),
    placement_date: isoDate,
    chick_count: int,
    extra_chick_count: int,
    breed_curve_id: z.uuid()
  })
);

/** Over `public.capture_batches()`: every open batch the caller may capture for. */
export async function captureBatches(client: SupabaseClient): Promise<CaptureBatch[]> {
  const { data, error } = await client.rpc('capture_batches');
  if (error) throw mapDatabaseError(error);
  return parse(captureBatchRows, data ?? [], 'capture_batches').map((row) => ({
    batchId: row.batch_id,
    code: row.code,
    placementDate: row.placement_date,
    chickCount: row.chick_count,
    extraChickCount: row.extra_chick_count,
    breedCurveId: row.breed_curve_id
  }));
}

// ─── dailyRecords ────────────────────────────────────────────────────────────

/** The current version of one day's record, as `public.daily_records` holds it. */
export interface CapturedDay {
  /** The current version's id: a correction sends it as `supersedesId`. */
  readonly id: string;
  readonly recordDate: IsoDate;
  readonly mortalityCumulative: number;
  readonly cullCumulative: number;
  readonly feedStarterG: number;
  readonly feedGrowerG: number;
  readonly feedFinisherG: number;
  readonly avgWeightG: number | null;
  readonly weightSampleSize: number | null;
  readonly notes: string | null;
  /** Who wrote this version; null for seed rows. A WORKER may correct only their own (AD-86). */
  readonly createdBy: string | null;
  readonly feedEntrySource: EntrySource | null;
  readonly feedPhase: Phase | null;
  readonly feedPhaseSource: PhaseSource | null;
}

const DAILY_RECORD_COLUMNS =
  'id, record_date, mortality_cumulative, cull_cumulative, feed_starter_g, feed_grower_g, feed_finisher_g, ' +
  'avg_weight_g, weight_sample_size, notes, created_by, feed_entry_source, feed_phase, feed_phase_source';

const dailyRecordRows = z.array(
  z.object({
    id: z.uuid(),
    record_date: isoDate,
    mortality_cumulative: int,
    cull_cumulative: int,
    feed_starter_g: int,
    feed_grower_g: int,
    feed_finisher_g: int,
    avg_weight_g: int.nullable(),
    weight_sample_size: int.nullable(),
    notes: z.string().nullable(),
    created_by: z.uuid().nullable(),
    feed_entry_source: z.enum(ENTRY_SOURCES).nullable(),
    feed_phase: z.enum(PHASES).nullable(),
    feed_phase_source: z.enum(PHASE_SOURCES).nullable()
  })
);

/** The batch's current records, oldest first: the previous totals, the backfill list, corrections. */
export async function dailyRecords(client: SupabaseClient, batchId: string): Promise<CapturedDay[]> {
  const { data, error } = await client
    .from('daily_records')
    .select(DAILY_RECORD_COLUMNS)
    .eq('batch_id', batchId)
    .order('record_date', { ascending: true });
  if (error) throw mapDatabaseError(error);
  return parse(dailyRecordRows, data ?? [], 'daily_records').map((row) => ({
    id: row.id,
    recordDate: row.record_date,
    mortalityCumulative: row.mortality_cumulative,
    cullCumulative: row.cull_cumulative,
    feedStarterG: row.feed_starter_g,
    feedGrowerG: row.feed_grower_g,
    feedFinisherG: row.feed_finisher_g,
    avgWeightG: row.avg_weight_g,
    weightSampleSize: row.weight_sample_size,
    notes: row.notes,
    createdBy: row.created_by,
    feedEntrySource: row.feed_entry_source,
    feedPhase: row.feed_phase,
    feedPhaseSource: row.feed_phase_source
  }));
}

// ─── curvePoints ─────────────────────────────────────────────────────────────

const curvePointRows = z.array(
  z.object({
    day_number: int.transform((d) => d as DayNumber),
    weight_g: int.transform((g) => g as Grams),
    feed_g: int.transform((g) => g as Grams),
    phase: z.enum(PHASES)
  })
);

/**
 * A curve's points, day 1 first: each day's standard feed per bird and its
 * phase, which is all capture needs from the curve (D18). A WORKER cannot read
 * the phase prices, so this is never a whole `BreedCurve`.
 */
export async function curvePoints(client: SupabaseClient, curveId: string): Promise<BreedCurvePoint[]> {
  const { data, error } = await client
    .from('breed_curve_points')
    .select('day_number, weight_g, feed_g, phase')
    .eq('curve_id', curveId)
    .order('day_number', { ascending: true });
  if (error) throw mapDatabaseError(error);
  const points = parse(curvePointRows, data ?? [], 'breed_curve_points');
  // Never an empty curve passed on as "no standard" (rule 3): a curve without
  // points, or one this reader cannot see, is a failure to report.
  if (points.length === 0) throw new RepositoryError(`Breed curve ${curveId} has no points this reader can see.`);
  return points;
}

// ─── recordDailyRecords ──────────────────────────────────────────────────────

/**
 * One day to write. There is no organisation and no author: the database takes
 * the organisation from the batch and the author from the session (U6 D23).
 */
export interface DailyRecordRow {
  /** From the caller's draft, never generated here: it names one submission (AD-75, U6 D30). */
  readonly clientRequestId: string;
  readonly recordDate: string;
  readonly mortalityCumulative: number;
  readonly cullCumulative: number;
  readonly feedStarterG: number;
  readonly feedGrowerG: number;
  readonly feedFinisherG: number;
  readonly avgWeightG: number | null;
  readonly weightSampleSize: number | null;
  readonly notes: string | null;
  readonly feedEntrySource: EntrySource | null;
  readonly feedPhase: Phase | null;
  readonly feedPhaseSource: PhaseSource | null;
  /** The current version being corrected or voided; null for a first entry. */
  readonly supersedesId: string | null;
  readonly voided: boolean;
}

export interface DailyRecordsWrite {
  readonly batchId: string;
  readonly rows: readonly DailyRecordRow[];
}

/**
 * Shapes only (U6 D30): integers where the database has integers, known enum
 * values, uuids. Every rule (monotonic totals, the phase columns, who may
 * correct what) is the database's, so none is repeated here.
 */
const writeInput = z.object({
  batchId: z.uuid(),
  rows: z
    .array(
      z.object({
        clientRequestId: z.uuid(),
        recordDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        mortalityCumulative: int,
        cullCumulative: int,
        feedStarterG: int,
        feedGrowerG: int,
        feedFinisherG: int,
        avgWeightG: int.nullable(),
        weightSampleSize: int.nullable(),
        notes: z.string().nullable(),
        feedEntrySource: z.enum(ENTRY_SOURCES).nullable(),
        feedPhase: z.enum(PHASES).nullable(),
        feedPhaseSource: z.enum(PHASE_SOURCES).nullable(),
        supersedesId: z.uuid().nullable(),
        voided: z.boolean()
      })
    )
    .min(1)
});

/**
 * Over `record_daily_records`: one or more days, in one transaction. Returns
 * the row ids in input order. A no-op (a retry, or an identical resubmission)
 * returns the existing id, so a retry cannot be told from a first write (AD-75).
 */
export async function recordDailyRecords(client: SupabaseClient, input: DailyRecordsWrite): Promise<string[]> {
  const checked = writeInput.safeParse(input);
  if (!checked.success) throw new RepositoryError(`record_daily_records input is invalid: ${checked.error.message}`);
  const { batchId, rows } = checked.data;

  // Every key on every row, nulls included: the function refuses a missing key.
  const { data, error } = await client.rpc('record_daily_records', {
    p_batch_id: batchId,
    p_rows: rows.map((r) => ({
      client_request_id: r.clientRequestId,
      record_date: r.recordDate,
      mortality_cumulative: r.mortalityCumulative,
      cull_cumulative: r.cullCumulative,
      feed_starter_g: r.feedStarterG,
      feed_grower_g: r.feedGrowerG,
      feed_finisher_g: r.feedFinisherG,
      avg_weight_g: r.avgWeightG,
      weight_sample_size: r.weightSampleSize,
      notes: r.notes,
      feed_entry_source: r.feedEntrySource,
      feed_phase: r.feedPhase,
      feed_phase_source: r.feedPhaseSource,
      supersedes_id: r.supersedesId,
      voided: r.voided
    }))
  });
  if (error) throw mapDatabaseError(error);
  const ids = parse(z.array(z.uuid()), data, 'record_daily_records');
  if (ids.length !== rows.length) {
    throw new RepositoryError(`record_daily_records returned ${ids.length} ids for ${rows.length} rows.`);
  }
  return ids;
}
