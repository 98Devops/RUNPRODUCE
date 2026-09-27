/**
 * T-DB1 · Raw rows are unreachable, and T-DB3 · Idempotency (U6 chunk 5).
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { day, newBatch, newFarm, type Farm } from '../src/payloads.js';
import { pool, rowCount, rpc, uuid } from '../src/harness.js';

let farm: Farm;

beforeAll(async () => {
  farm = await newFarm('T-DB1-3');
});

afterAll(async () => {
  await pool.end();
});

const placement = { placement_date: '2026-02-06', chick_count: 100, extra_chick_count: 0, chick_price_cents: '100' };

describe('T-DB1 · raw rows are unreachable through the API', () => {
  it.each(['facts', 'private'])('the %s schema is not exposed', async (schema) => {
    const { data, error } = await farm.owner.client.schema(schema).from('daily_record_versions').select('id');
    expect(data).toBeNull();
    expect(error?.message ?? '').toMatch(/schema/i);
  });

  it('the current-row view is reachable', async () => {
    const { error } = await farm.owner.client.from('daily_records').select('id').limit(1);
    expect(error).toBeNull();
  });

  it('no repository source names facts. or _versions', () => {
    const root = fileURLToPath(new URL('../../../apps/web/lib/repositories', import.meta.url));
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\bfacts\.|_versions\b/.test(readFileSync(path, 'utf8'))) offenders.push(path);
      }
    };
    if (existsSync(root)) walk(root);
    expect(offenders).toEqual([]);
  });
});

describe('T-DB3 · idempotency', () => {
  it('the same client_request_id twice gives one row and the same id', async () => {
    const batchId = await newBatch(farm, placement);
    const row = day({ record_date: '2026-02-08', mortality_cumulative: 1, cull_cumulative: 0 });
    const first = await rpc<string[]>(farm.worker, 'record_daily_records', { p_batch_id: batchId, p_rows: [row] });
    const second = await rpc<string[]>(farm.worker, 'record_daily_records', { p_batch_id: batchId, p_rows: [row] });
    expect(second).toEqual(first);
    expect(await rowCount('select 1 from facts.daily_record_versions where batch_id = $1', [batchId])).toBe(1);
  });

  it('an identical resubmission with a new id writes nothing and returns the current id', async () => {
    const batchId = await newBatch(farm, placement);
    const values = { record_date: '2026-02-08', mortality_cumulative: 1, cull_cumulative: 0 };
    const first = await rpc<string[]>(farm.worker, 'record_daily_records', { p_batch_id: batchId, p_rows: [day(values)] });
    const again = await rpc<string[]>(farm.manager, 'record_daily_records', { p_batch_id: batchId, p_rows: [day(values)] });
    expect(again).toEqual(first);
    expect(await rowCount('select 1 from facts.daily_record_versions where batch_id = $1', [batchId])).toBe(1);
  });

  it('record_batch with a repeated client_request_id returns the same batch', async () => {
    const payload = {
      org_id: farm.orgId,
      code: `B-${uuid().slice(0, 8)}`,
      breed_curve_id: farm.curveId,
      client_request_id: uuid(),
      ...placement
    };
    const first = await rpc<string>(farm.owner, 'record_batch', { payload });
    const second = await rpc<string>(farm.owner, 'record_batch', { payload });
    expect(second).toBe(first);
  });
});
