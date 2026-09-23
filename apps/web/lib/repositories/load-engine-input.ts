/**
 * `loadEngineInput` (D25, D27, AD-90, AD-92): one call to
 * `public.engine_snapshot(p_batch_id, p_as_of)`, validated with Zod, mapped to
 * `EngineInput`. The only arithmetic allowed is `dayNumberFor` and grams/1000.
 *
 * RED PHASE STUB (chunk 7): signature only. The snapshot contract it will
 * parse is pinned in `tests/repositories/snapshot-fixture.ts`.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { EngineInput, IsoDate } from '@runproduce/engine';

export async function loadEngineInput(_client: SupabaseClient, _batchId: string, _asOf: IsoDate): Promise<EngineInput> {
  throw new Error('loadEngineInput: not implemented (U6 chunk 7, red phase)');
}
