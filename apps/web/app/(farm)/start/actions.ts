'use server';

import { revalidatePath } from 'next/cache';
import { authEnabled } from '@/lib/auth/config';
import { requestSessionClient } from '@/lib/auth/server';
import { currentUser, myMemberships } from '@/lib/repositories';
import { parseStartBatchForm } from '@/lib/start/placement';
import { submitPlacement, type PlacementResult } from '@/lib/start/save';
import { farmToday } from '@/lib/today/farm-date';

const SIGNED_OUT = 'You’re signed out. Sign in again, then start the batch.';
const NOT_SET_UP = 'Sign-in isn’t set up on this deploy.';

/**
 * Checks or saves a batch (U8 D1, D12). The authority: it is its own request,
 * so it reads the user and the membership again, and `submitPlacement` checks
 * the role before it reads anything. `record_batch` checks it a third time.
 */
export async function submitPlacementAction(raw: unknown): Promise<PlacementResult> {
  if (!authEnabled()) return { kind: 'refused', message: NOT_SET_UP };
  const client = await requestSessionClient();
  if ((await currentUser(client)) === null) return { kind: 'refused', message: SIGNED_OUT };
  // One farm per member, as the layout reads it (U7 D27).
  const [membership] = await myMemberships(client);
  if (membership === undefined) return { kind: 'refused', message: 'Only the owner or a manager can start a batch.' };

  const parsed = parseStartBatchForm(raw);
  if (!parsed.ok) return { kind: 'refused', message: parsed.message };

  // The farm's date, read here and nowhere else (U7 D28).
  const result = await submitPlacement(client, membership, parsed.request, farmToday(new Date()));
  if (result.kind === 'saved') {
    revalidatePath('/start');
    revalidatePath('/today');
  }
  return result;
}
