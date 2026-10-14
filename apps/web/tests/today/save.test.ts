/**
 * T-T8 · What the save says when it fails (U7 D8, D30). Each typed repository
 * error gives one sentence; a batch outside the caller's `capture_batches()`
 * is refused before anything is read or written.
 *
 * The round trip on a real database, as a WORKER, is T-T9 in
 * `packages/db-tests/tests/today-save.test.ts`.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  Conflict,
  Forbidden,
  IntegrityRejected,
  NoParametersInForce,
  RepositoryError,
  StaleCorrection
} from '../../lib/repositories/index.js';
import { removeDay, saveDay, saveErrorMessage } from '../../lib/today/save.js';
import type { DayEntry } from '../../lib/today/day-row.js';

describe('T-T8 · saveErrorMessage', () => {
  it('shows the database’s own sentence for an integrity refusal', () => {
    expect(saveErrorMessage(new IntegrityRejected('Daily record dated 2026-10-01 is before placement on 2026-10-06'))).toBe(
      'Daily record dated 2026-10-01 is before placement on 2026-10-06'
    );
  });

  it('says whose record it is for Forbidden', () => {
    expect(saveErrorMessage(new Forbidden('Day 12 was recorded by another user'))).toBe(
      'Recorded by someone else. A manager or owner can correct it.'
    );
  });

  it('says someone saved first for Conflict', () => {
    expect(saveErrorMessage(new Conflict('Someone saved this date first. Reload.'))).toBe('Someone saved this date first. Reload.');
  });

  it('says the record changed for StaleCorrection', () => {
    expect(saveErrorMessage(new StaleCorrection('This record changed since you opened it.'))).toBe(
      'This record changed since you opened it.'
    );
  });

  it.each([
    ['a repository error', new RepositoryError('PGRST000: boom')],
    ['a missing parameter set', new NoParametersInForce('No parameter set')],
    ['anything else', new TypeError('x is undefined')]
  ])('never shows the detail of %s', (_label, error) => {
    expect(saveErrorMessage(error)).toBe('Couldn’t save. Your entry is kept on this phone. Try again.');
  });
});

/** A client whose `capture_batches()` returns no batch, and which records every call. */
function clientWithNoBatches() {
  const calls: string[] = [];
  const client = {
    rpc: async (name: string) => {
      calls.push(`rpc:${name}`);
      return { data: [], error: null };
    },
    from: (name: string) => {
      calls.push(`from:${name}`);
      throw new Error('nothing should be read for a batch the caller cannot capture for');
    }
  };
  return { client: client as unknown as SupabaseClient, calls };
}

const BATCH = '00000000-0000-4000-8000-0000000000b1';
const ENTRY: DayEntry = {
  recordDate: '2026-10-17' as DayEntry['recordDate'],
  mortalityCumulative: 14,
  cullCumulative: 3,
  feedKg: '302.5',
  standardConfirmed: false,
  avgWeightG: null,
  weightSampleSize: null,
  notes: null,
  clientRequestId: '00000000-0000-4000-8000-00000000c001',
  supersedesId: null
};

describe('T-T8 · a batch outside capture_batches() is Forbidden', () => {
  const NOT_YOURS = 'That batch isn’t one you can record for.';

  it('refuses a save, reading nothing past the batch list and writing nothing', async () => {
    const { client, calls } = clientWithNoBatches();
    expect(await saveDay(client, { batchId: BATCH, entry: ENTRY }, '2026-10-17' as DayEntry['recordDate'])).toEqual({
      kind: 'refused',
      message: NOT_YOURS
    });
    expect(calls).toEqual(['rpc:capture_batches']);
  });

  it('refuses a removal the same way', async () => {
    const { client, calls } = clientWithNoBatches();
    const removal = {
      batchId: BATCH,
      recordDate: ENTRY.recordDate,
      recordId: '00000000-0000-4000-8000-00000000d001',
      clientRequestId: ENTRY.clientRequestId
    };
    expect(await removeDay(client, removal, 'user-1')).toEqual({ kind: 'refused', message: NOT_YOURS });
    expect(calls).toEqual(['rpc:capture_batches']);
  });
});
