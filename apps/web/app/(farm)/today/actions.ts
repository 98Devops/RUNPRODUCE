'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { IsoDate } from '@runproduce/engine';
import { authEnabled } from '@/lib/auth/config';
import { requestSessionClient } from '@/lib/auth/server';
import { currentUser } from '@/lib/repositories';
import { parseDayForm } from '@/lib/today/day-row';
import { farmToday } from '@/lib/today/farm-date';
import { removeDay, saveDay, type RemoveDayResult, type SaveDayResult } from '@/lib/today/save';

const SIGNED_OUT = 'You’re signed out. Sign in again; your entry is kept on this phone.';
const NOT_SET_UP = 'Sign-in isn’t set up on this deploy.';

/**
 * Saves one day (U7 D30). The authority: it checks the user again (D12), and
 * `saveDay` checks the batch against `capture_batches()` and reads the records
 * and curve itself. Called directly from the form, so a lost connection is an
 * exception the form catches, and the draft stays on the phone (D6).
 */
export async function saveDayAction(raw: unknown): Promise<SaveDayResult> {
  if (!authEnabled()) return { kind: 'refused', message: NOT_SET_UP };
  const client = await requestSessionClient();
  if ((await currentUser(client)) === null) return { kind: 'refused', message: SIGNED_OUT };

  const parsed = parseDayForm(raw);
  if (!parsed.ok) return { kind: 'refused', message: parsed.message };

  // The farm's date, read here and nowhere else (D28).
  const result = await saveDay(client, { batchId: parsed.batchId, entry: parsed.entry }, farmToday(new Date()));
  if (result.kind === 'saved') revalidatePath('/today');
  return result;
}

const removal = z.object({
  batchId: z.uuid(),
  recordDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  recordId: z.uuid(),
  clientRequestId: z.uuid()
});

/** Voids the author's own record for a day (D7). */
export async function removeDayAction(raw: unknown): Promise<RemoveDayResult> {
  if (!authEnabled()) return { kind: 'refused', message: NOT_SET_UP };
  const client = await requestSessionClient();
  const user = await currentUser(client);
  if (user === null) return { kind: 'refused', message: SIGNED_OUT };

  const parsed = removal.safeParse(raw);
  if (!parsed.success) return { kind: 'refused', message: 'Something in this request could not be read. Reload and try again.' };

  const result = await removeDay(client, { ...parsed.data, recordDate: parsed.data.recordDate as IsoDate }, user.userId);
  if (result.kind === 'removed') revalidatePath('/today');
  return result;
}
