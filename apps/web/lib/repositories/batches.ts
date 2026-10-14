/**
 * What Start batch reads and writes (U8 D8): two writers and three readers,
 * thin, Zod-parsed and mapped by SQLSTATE, as `capture.ts` is (AD-93, AD-95).
 *
 * - Money stays bigint cents. It is sent as an integer string (AD-91) and read
 *   back as text (`::text`), so no cents pass through a JSON number.
 * - Nothing here checks a rule. The role, the curve, the name's shape and the
 *   date are the database's (D1, D7); the form's sentences are `lib/start`'s.
 * - Every reader here is OWNER and MANAGER by RLS: a WORKER reads no row.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { Cents, IsoDate } from '@runproduce/engine';
import { mapDatabaseError, RepositoryError } from './errors.js';

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .transform((s) => s as IsoDate);
const int = z.number().int();
const centsText = z
  .string()
  .regex(/^\d+$/)
  .transform((s) => BigInt(s) as Cents);

function parse<T>(schema: z.ZodType<T>, data: unknown, what: string): T {
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new RepositoryError(`${what} returned an unexpected shape: ${parsed.error.message}`);
  return parsed.data;
}

const STALE = 'This batch was changed since you opened it. Reload.';
const duplicate = (code: string) => `There is already a batch called ${code}. Pick another name.`;

// ─── readers ────────────────────────────────────────────────────────────────

/** A batch on the farm, open or closed, with its current placement (`public.batches`). */
export interface FarmBatch {
  readonly batchId: string;
  readonly code: string;
  readonly breedCurveId: string;
  /** The version a correction supersedes (D9). */
  readonly placementVersionId: string;
  readonly placementDate: IsoDate;
  readonly chickCount: number;
  readonly extraChickCount: number;
  readonly chickPriceCents: Cents;
  readonly closedOn: IsoDate | null;
}

const farmBatchRows = z.array(
  z.strictObject({
    id: z.uuid(),
    code: z.string(),
    breed_curve_id: z.uuid(),
    placement_version_id: z.uuid(),
    placement_date: isoDate,
    chick_count: int,
    extra_chick_count: int,
    chick_price_cents: centsText,
    closed_on: isoDate.nullable()
  })
);

/** Every batch the caller may see, closed ones included: names are unique for good. Oldest placement first. */
export async function farmBatches(client: SupabaseClient): Promise<FarmBatch[]> {
  const { data, error } = await client
    .from('batches')
    .select(
      'id, code, breed_curve_id, placement_version_id, placement_date, chick_count, extra_chick_count, chick_price_cents::text, closed_on'
    )
    .order('placement_date', { ascending: true });
  if (error) throw mapDatabaseError(error);
  return parse(farmBatchRows, data ?? [], 'batches').map((r) => ({
    batchId: r.id,
    code: r.code,
    breedCurveId: r.breed_curve_id,
    placementVersionId: r.placement_version_id,
    placementDate: r.placement_date,
    chickCount: r.chick_count,
    extraChickCount: r.extra_chick_count,
    chickPriceCents: r.chick_price_cents,
    closedOn: r.closed_on
  }));
}

export interface BreedCurveChoice {
  readonly id: string;
  readonly name: string;
}

/** The farm's growth curves, oldest first (D4). */
export async function breedCurves(client: SupabaseClient): Promise<BreedCurveChoice[]> {
  const { data, error } = await client.from('breed_curves').select('id, name').order('created_at', { ascending: true });
  if (error) throw mapDatabaseError(error);
  return parse(z.array(z.strictObject({ id: z.uuid(), name: z.string() })), data ?? [], 'breed_curves');
}

/**
 * The batch a request already wrote, if any: a retry after a lost reply is a
 * save, not a duplicate name (AD-75). Reads `batches_history`, which keeps
 * every placement version and its request id.
 */
export async function placementByRequest(
  client: SupabaseClient,
  clientRequestId: string
): Promise<{ readonly batchId: string; readonly code: string } | null> {
  const { data, error } = await client
    .from('batches_history')
    .select('batch_id, code')
    .eq('client_request_id', clientRequestId);
  if (error) throw mapDatabaseError(error);
  const [row] = parse(z.array(z.strictObject({ batch_id: z.uuid(), code: z.string() })), data ?? [], 'batches_history');
  return row === undefined ? null : { batchId: row.batch_id, code: row.code };
}

// ─── writers ────────────────────────────────────────────────────────────────

/** A new batch. The author is the session's (U6 D23); the organisation is the caller's membership. */
export interface BatchInsert {
  readonly orgId: string;
  readonly code: string;
  readonly breedCurveId: string;
  readonly placementDate: IsoDate;
  readonly chickCount: number;
  readonly extraChickCount: number;
  readonly chickPriceCents: Cents;
  /** From the form, never generated here: it names one submission (AD-75). */
  readonly clientRequestId: string;
}

/** A correction: a new placement version superseding the one the form showed (D9). */
export interface PlacementCorrection {
  readonly batchId: string;
  readonly supersedesId: string;
  readonly placementDate: IsoDate;
  readonly chickCount: number;
  readonly extraChickCount: number;
  readonly chickPriceCents: Cents;
  readonly clientRequestId: string;
}

const figures = {
  placementDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  chickCount: int,
  extraChickCount: int,
  chickPriceCents: z.bigint(),
  clientRequestId: z.uuid()
};
const insertInput = z.object({ orgId: z.uuid(), code: z.string(), breedCurveId: z.uuid(), ...figures });
const correctionInput = z.object({ batchId: z.uuid(), supersedesId: z.uuid(), ...figures });

/** Over `record_batch`: the identity and its first placement, one transaction. Returns the batch id; a retry returns the same. */
export async function recordBatch(client: SupabaseClient, input: BatchInsert): Promise<string> {
  const checked = insertInput.safeParse(input);
  if (!checked.success) throw new RepositoryError(`record_batch input is invalid: ${checked.error.message}`);
  const i = checked.data;

  const { data, error } = await client.rpc('record_batch', {
    payload: {
      org_id: i.orgId,
      code: i.code,
      breed_curve_id: i.breedCurveId,
      placement_date: i.placementDate,
      chick_count: i.chickCount,
      extra_chick_count: i.extraChickCount,
      chick_price_cents: i.chickPriceCents.toString(),
      client_request_id: i.clientRequestId
    }
  });
  if (error) throw mapDatabaseError(error, { conflict: duplicate(i.code), stale: STALE });
  return parse(z.uuid(), data, 'record_batch');
}

/** Over `record_batch_placement`. Returns the current version's id; identical values write nothing and return the head. */
export async function recordBatchPlacement(client: SupabaseClient, input: PlacementCorrection): Promise<string> {
  const checked = correctionInput.safeParse(input);
  if (!checked.success) throw new RepositoryError(`record_batch_placement input is invalid: ${checked.error.message}`);
  const i = checked.data;

  const { data, error } = await client.rpc('record_batch_placement', {
    payload: {
      batch_id: i.batchId,
      supersedes_id: i.supersedesId,
      placement_date: i.placementDate,
      chick_count: i.chickCount,
      extra_chick_count: i.extraChickCount,
      chick_price_cents: i.chickPriceCents.toString(),
      client_request_id: i.clientRequestId
    }
  });
  if (error) throw mapDatabaseError(error, { stale: STALE });
  return parse(z.uuid(), data, 'record_batch_placement');
}
