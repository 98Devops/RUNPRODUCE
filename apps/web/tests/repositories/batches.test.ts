/**
 * T-SB10 · The batch repositories against a fake client (u8-start-batch.md D8).
 * The database half, on the local stack, is T-SB11 to T-SB17 in
 * `packages/db-tests/tests/start-batch.test.ts`.
 *
 * The fake stands in for the network only, as in T-C1 to T-C4.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Cents, IsoDate } from '@runproduce/engine';
import {
  breedCurves,
  Conflict,
  farmBatches,
  Forbidden,
  IntegrityRejected,
  mapDatabaseError,
  placementByRequest,
  recordBatch,
  recordBatchPlacement,
  RepositoryError,
  StaleCorrection,
  type BatchInsert
} from '../../lib/repositories/index.js';

interface Reply {
  readonly data?: unknown;
  readonly error?: { code: string; message: string };
}

interface Call {
  readonly kind: 'rpc' | 'from';
  readonly name: string;
  readonly args?: unknown;
  readonly steps: Array<[string, ...unknown[]]>;
}

function fakeClient(reply: Reply) {
  const calls: Call[] = [];
  const result = { data: reply.data ?? null, error: reply.error ?? null };
  const client = {
    rpc: async (name: string, args: unknown) => {
      calls.push({ kind: 'rpc', name, args, steps: [] });
      return result;
    },
    from: (name: string) => {
      const call: Call = { kind: 'from', name, steps: [] };
      calls.push(call);
      const builder = {
        select: (...a: unknown[]) => (call.steps.push(['select', ...a]), builder),
        eq: (...a: unknown[]) => (call.steps.push(['eq', ...a]), builder),
        order: (...a: unknown[]) => (call.steps.push(['order', ...a]), builder),
        then: (resolve: (r: typeof result) => unknown, reject?: (e: unknown) => unknown) =>
          Promise.resolve(result).then(resolve, reject)
      };
      return builder;
    }
  };
  return { client: client as unknown as SupabaseClient, calls };
}

const ORG = '00000000-0000-4000-8000-0000000000a0';
const BATCH = '00000000-0000-4000-8000-0000000000b1';
const CURVE = '00000000-0000-4000-8000-0000000000c1';
const HEAD = '00000000-0000-4000-8000-0000000000a1';
const REQUEST = '00000000-0000-4000-8000-0000000000f1';
const dbError = (code: string, message = `raw ${code}`) => ({ error: { code, message } });

const daniel: BatchInsert = {
  orgId: ORG,
  code: 'B1',
  breedCurveId: CURVE,
  placementDate: '2026-10-12' as IsoDate,
  chickCount: 6000,
  extraChickCount: 60,
  chickPriceCents: 100n as Cents,
  clientRequestId: REQUEST
};

describe('T-SB10 · recordBatch', () => {
  it('sends every key record_batch reads, with money as an integer string (AD-91)', async () => {
    const { client, calls } = fakeClient({ data: BATCH });
    await expect(recordBatch(client, daniel)).resolves.toBe(BATCH);
    expect(calls).toEqual([
      {
        kind: 'rpc',
        name: 'record_batch',
        args: {
          payload: {
            org_id: ORG,
            code: 'B1',
            breed_curve_id: CURVE,
            placement_date: '2026-10-12',
            chick_count: 6000,
            extra_chick_count: 60,
            chick_price_cents: '100',
            client_request_id: REQUEST
          }
        },
        steps: []
      }
    ]);
  });

  it('says a duplicate name in the batch’s words, not Today’s', async () => {
    const { client } = fakeClient(dbError('23505', 'duplicate key value violates unique constraint "batches_org_id_code_key"'));
    const error = await recordBatch(client, daniel).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Conflict);
    expect((error as Error).message).toBe('There is already a batch called B1. Pick another name.');
  });

  it.each<[string, new (...args: never[]) => Error]>([
    ['42501', Forbidden],
    ['23514', IntegrityRejected],
    ['22023', RepositoryError]
  ])('maps SQLSTATE %s to its typed error', async (code, type) => {
    const { client } = fakeClient(dbError(code));
    await expect(recordBatch(client, daniel)).rejects.toBeInstanceOf(type);
  });

  it('refuses a malformed input before any call', async () => {
    const { client, calls } = fakeClient({ data: BATCH });
    await expect(recordBatch(client, { ...daniel, chickCount: 6000.5 })).rejects.toBeInstanceOf(RepositoryError);
    await expect(recordBatch(client, { ...daniel, orgId: 'x' })).rejects.toBeInstanceOf(RepositoryError);
    expect(calls).toEqual([]);
  });
});

describe('T-SB10 · recordBatchPlacement', () => {
  const correction = {
    batchId: BATCH,
    supersedesId: HEAD,
    placementDate: '2026-10-12' as IsoDate,
    chickCount: 6000,
    extraChickCount: 61,
    chickPriceCents: 100n as Cents,
    clientRequestId: REQUEST
  };

  it('sends the head it corrects', async () => {
    const { client, calls } = fakeClient({ data: HEAD });
    await recordBatchPlacement(client, correction);
    expect(calls[0]?.args).toEqual({
      payload: {
        batch_id: BATCH,
        supersedes_id: HEAD,
        placement_date: '2026-10-12',
        chick_count: 6000,
        extra_chick_count: 61,
        chick_price_cents: '100',
        client_request_id: REQUEST
      }
    });
  });

  it('maps RP001 to StaleCorrection with the batch’s sentence', async () => {
    const { client } = fakeClient(dbError('RP001'));
    const error = await recordBatchPlacement(client, correction).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(StaleCorrection);
    expect((error as Error).message).toBe('This batch was changed since you opened it. Reload.');
  });
});

describe('T-SB10 · mapDatabaseError keeps Today’s sentences when no batch wording is given', () => {
  it('still says Today’s conflict and staleness sentences by default', () => {
    expect(mapDatabaseError({ code: '23505', message: 'x' }).message).toBe('Someone saved this date first. Reload.');
    expect(mapDatabaseError({ code: 'RP001', message: 'x' }).message).toBe('This record changed since you opened it.');
  });
});

describe('T-SB10 · farmBatches', () => {
  const row = {
    id: BATCH,
    code: 'B1',
    breed_curve_id: CURVE,
    placement_version_id: HEAD,
    placement_date: '2026-10-12',
    chick_count: 6000,
    extra_chick_count: 60,
    chick_price_cents: '100',
    closed_on: null
  };

  it('reads public.batches, with the price as text so no cents pass through a float', async () => {
    const { client, calls } = fakeClient({ data: [row] });
    await expect(farmBatches(client)).resolves.toEqual([
      {
        batchId: BATCH,
        code: 'B1',
        breedCurveId: CURVE,
        placementVersionId: HEAD,
        placementDate: '2026-10-12',
        chickCount: 6000,
        extraChickCount: 60,
        chickPriceCents: 100n,
        closedOn: null
      }
    ]);
    expect(calls[0]?.name).toBe('batches');
    expect(String(calls[0]?.steps[0]?.[1])).toContain('chick_price_cents::text');
  });

  it('refuses a price that arrives as a number, or a column it did not ask for', async () => {
    await expect(farmBatches(fakeClient({ data: [{ ...row, chick_price_cents: 100 }] }).client)).rejects.toBeInstanceOf(
      RepositoryError
    );
    await expect(farmBatches(fakeClient({ data: [{ ...row, org_id: ORG }] }).client)).rejects.toBeInstanceOf(RepositoryError);
  });
});

describe('T-SB10 · breedCurves and placementByRequest', () => {
  it('lists the farm’s curves, oldest first', async () => {
    const { client, calls } = fakeClient({ data: [{ id: CURVE, name: 'Ross 308, Daniel' }] });
    await expect(breedCurves(client)).resolves.toEqual([{ id: CURVE, name: 'Ross 308, Daniel' }]);
    expect(calls[0]).toMatchObject({ name: 'breed_curves', steps: [['select', 'id, name'], ['order', 'created_at', { ascending: true }]] });
  });

  it('finds the batch a request already wrote, for a retry after a lost reply', async () => {
    const found = fakeClient({ data: [{ batch_id: BATCH, code: 'B1' }] });
    await expect(placementByRequest(found.client, REQUEST)).resolves.toEqual({ batchId: BATCH, code: 'B1' });
    expect(found.calls[0]).toMatchObject({ name: 'batches_history', steps: [['select', 'batch_id, code'], ['eq', 'client_request_id', REQUEST]] });
    await expect(placementByRequest(fakeClient({ data: [] }).client, REQUEST)).resolves.toBeNull();
  });
});
