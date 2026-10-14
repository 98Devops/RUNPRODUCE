/**
 * The Start batch action's core (u8-start-batch.md D1, D8, D9, D12):
 * everything but the session. It checks the role before it reads anything,
 * reads the farm's batches, curves and records itself, and writes through the
 * batch repositories. RLS and the write functions still have the last word.
 *
 * Two modes (D12): `check` runs every check and answers with the confirm lines,
 * writing nothing; `save` runs every check again and writes. The confirm step
 * is never trusted as proof of anything.
 *
 * Relative imports only: `packages/db-tests` runs this module directly (T-SB18).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { IsoDate } from '@runproduce/engine';
import { canStartBatch } from '../nav/tabs.js';
import {
  breedCurves,
  Conflict,
  dailyRecords,
  farmBatches,
  Forbidden,
  IntegrityRejected,
  placementByRequest,
  recordBatch,
  recordBatchPlacement,
  StaleCorrection,
  type Role
} from '../repositories/index.js';
import { buildCorrection, buildStart, type CorrectRequest, type StartRequest } from './placement.js';

export type PlacementResult =
  | { readonly kind: 'confirm'; readonly confirm: readonly string[] }
  | { readonly kind: 'saved'; readonly code: string }
  | { readonly kind: 'refused'; readonly message: string };

export interface Actor {
  readonly orgId: string;
  readonly role: Role;
}

const NOT_ALLOWED = 'Only the owner or a manager can start a batch.';
const NOT_YOURS = 'That batch isn’t one you can see.';
const refused = (message: string) => ({ kind: 'refused', message }) as const;

/** D5's last rows. The database's own words never reach the screen. */
export function placementErrorMessage(error: unknown, kind: 'start' | 'correct'): string {
  if (error instanceof Conflict || error instanceof StaleCorrection) return error.message;
  if (error instanceof Forbidden) return NOT_ALLOWED;
  if (error instanceof IntegrityRejected) {
    // A race: the checks passed, then something changed before the write.
    return kind === 'start'
      ? 'The chicks can’t arrive after today. Check the date.'
      : 'This change conflicts with records saved since you opened it. Reload.';
  }
  return 'Couldn’t save. Try again.';
}

export async function submitPlacement(
  client: SupabaseClient,
  actor: Actor,
  request: StartRequest | CorrectRequest,
  today: IsoDate
): Promise<PlacementResult> {
  if (!canStartBatch(actor.role)) return refused(NOT_ALLOWED);
  try {
    // A retry after a lost reply is a save, not a duplicate name (AD-75).
    if (request.mode === 'save') {
      const done = await placementByRequest(client, request.clientRequestId);
      if (done !== null) return { kind: 'saved', code: done.code };
    }
    return request.kind === 'start'
      ? await start(client, actor, request, today)
      : await correct(client, request, today);
  } catch (error) {
    if (!(error instanceof Conflict || error instanceof StaleCorrection || error instanceof Forbidden || error instanceof IntegrityRejected)) {
      console.error('submitPlacement failed', error);
    }
    return refused(placementErrorMessage(error, request.kind));
  }
}

async function start(client: SupabaseClient, actor: Actor, request: StartRequest, today: IsoDate): Promise<PlacementResult> {
  const [batches, curves] = await Promise.all([farmBatches(client), breedCurves(client)]);
  const built = buildStart(request, { today, batchCodes: batches.map((b) => b.code), curves });
  if (built.kind === 'refused') return built;
  if (built.kind !== 'start') throw new Error('buildStart built a correction');
  if (request.mode === 'check') return { kind: 'confirm', confirm: built.confirm };
  await recordBatch(client, { orgId: actor.orgId, ...built.write });
  return { kind: 'saved', code: built.write.code };
}

async function correct(client: SupabaseClient, request: CorrectRequest, today: IsoDate): Promise<PlacementResult> {
  const batch = (await farmBatches(client)).find((b) => b.batchId === request.batchId && b.closedOn === null);
  if (batch === undefined) return refused(NOT_YOURS);
  const records = await dailyRecords(client, batch.batchId);
  const built = buildCorrection(request, { today, batch, records });
  if (built.kind === 'refused') return built;
  if (built.kind !== 'correct') throw new Error('buildCorrection built a start');
  if (request.mode === 'check') return { kind: 'confirm', confirm: built.confirm };
  await recordBatchPlacement(client, built.write);
  return { kind: 'saved', code: batch.code };
}
