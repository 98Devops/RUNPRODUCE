/**
 * T-SB9 · The Start batch action's core refuses before it reads (u8-start-batch.md
 * D1, D12). The database half, as OWNER and MANAGER, is T-SB18 in
 * `packages/db-tests/tests/start-batch.test.ts`.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { IsoDate } from '@runproduce/engine';
import { parseStartBatchForm, type CorrectRequest, type StartRequest } from '../../lib/start/placement.js';
import { placementErrorMessage, submitPlacement } from '../../lib/start/save.js';
import { Conflict, Forbidden, IntegrityRejected, RepositoryError, StaleCorrection } from '../../lib/repositories/index.js';

const ORG = '00000000-0000-4000-8000-0000000000a0';
const TODAY = '2026-10-14' as IsoDate;

/** A client that records any use at all. */
function spyClient() {
  const used: string[] = [];
  const client = new Proxy(
    {},
    {
      get: (_t, prop) => {
        used.push(String(prop));
        throw new Error(`the client was used: ${String(prop)}`);
      }
    }
  ) as SupabaseClient;
  return { client, used };
}

function request(raw: Record<string, unknown>): StartRequest | CorrectRequest {
  const parsed = parseStartBatchForm(raw);
  if (!parsed.ok) throw new Error(parsed.message);
  return parsed.request;
}

const start = request({
  kind: 'start',
  mode: 'save',
  name: 'B1',
  placementDate: '2026-10-12',
  chickCount: '6000',
  extraChickCount: '60',
  chickPrice: '1.00',
  curveId: '00000000-0000-4000-8000-0000000000c1',
  clientRequestId: '00000000-0000-4000-8000-0000000000f1'
});

const correct = request({
  kind: 'correct',
  mode: 'save',
  batchId: '00000000-0000-4000-8000-0000000000b1',
  supersedesId: '00000000-0000-4000-8000-0000000000a1',
  placementDate: '2026-10-12',
  chickCount: '6000',
  extraChickCount: '61',
  chickPrice: '1.00',
  clientRequestId: '00000000-0000-4000-8000-0000000000f2'
});

describe('T-SB9 · submitPlacement refuses a WORKER before touching the database', () => {
  it.each([
    ['a start', start],
    ['a correction', correct]
  ])('refuses %s from a WORKER, and the client is never used', async (_label, req) => {
    const { client, used } = spyClient();
    await expect(submitPlacement(client, { orgId: ORG, role: 'WORKER' }, req, TODAY)).resolves.toEqual({
      kind: 'refused',
      message: 'Only the owner or a manager can start a batch.'
    });
    expect(used).toEqual([]);
  });
});

describe('T-SB9 · placementErrorMessage, what reaches the screen', () => {
  it('passes the typed sentences through', () => {
    expect(placementErrorMessage(new Conflict('There is already a batch called B1. Pick another name.'), 'start')).toBe(
      'There is already a batch called B1. Pick another name.'
    );
    expect(placementErrorMessage(new StaleCorrection('This batch was changed since you opened it. Reload.'), 'correct')).toBe(
      'This batch was changed since you opened it. Reload.'
    );
    expect(placementErrorMessage(new Forbidden('not permitted'), 'start')).toBe('Only the owner or a manager can start a batch.');
  });

  it('never shows the database’s own words for an integrity refusal', () => {
    const raw = new IntegrityRejected('Day 2: removals exceed the flock — 6000 dead + 50 culled = 6050 from 6049 birds');
    expect(placementErrorMessage(raw, 'correct')).toBe('This change conflicts with records saved since you opened it. Reload.');
    expect(placementErrorMessage(new IntegrityRejected('Placement date 2026-10-15 is after the farm’s today'), 'start')).toBe(
      'The chicks can’t arrive after today. Check the date.'
    );
  });

  it('says only that the save failed for anything untyped', () => {
    expect(placementErrorMessage(new RepositoryError('22P02: invalid input syntax'), 'start')).toBe('Couldn’t save. Try again.');
    expect(placementErrorMessage(new Error('fetch failed'), 'correct')).toBe('Couldn’t save. Try again.');
  });
});
