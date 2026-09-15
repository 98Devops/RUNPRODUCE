/**
 * T-DB2 · Integrity from both sides (U6 chunk 5, AD-76), extended by chunk 6
 * (AD-87): every integrity case runs as a WORKER as well as an OWNER, because the
 * deferred checks fire at commit as the caller and RLS hides the placement row
 * from a WORKER. The trigger functions are SECURITY DEFINER so they still see it.
 */
import { newBatch, newFarm, day, type Farm } from '../src/payloads.js';
import { openAs, pool, refused, rpc, rowCount, uuid, type Member } from '../src/harness.js';

let farm: Farm;

beforeAll(async () => {
  farm = await newFarm('T-DB2');
});

afterAll(async () => {
  await pool.end();
});

const placement = { placement_date: '2026-02-06', chick_count: 100, extra_chick_count: 0, chick_price_cents: '100' };

async function currentDays(batchId: string): Promise<number> {
  return rowCount('select 1 from public.daily_records where batch_id = $1', [batchId]);
}

describe.each(['owner', 'worker'] as const)('T-DB2 as %s', (who) => {
  const as = (): Member => farm[who];

  it('rejects a day whose cumulative mortality is below the previous day', async () => {
    const batchId = await newBatch(farm, placement);
    await rpc(as(), 'record_daily_records', {
      p_batch_id: batchId,
      p_rows: [day({ record_date: '2026-02-10', mortality_cumulative: 10, cull_cumulative: 0 })]
    });

    const error = await refused(
      rpc(as(), 'record_daily_records', {
        p_batch_id: batchId,
        p_rows: [day({ record_date: '2026-02-11', mortality_cumulative: 8, cull_cumulative: 0 })]
      }),
      '23514'
    );
    expect(error.message).toContain('Day 6: mortality_cumulative must be monotonic');
    expect(await currentDays(batchId)).toBe(1);
  });

  it('accepts correcting day 5 and day 6 together in one call, and rejects day 5 alone', async () => {
    const batchId = await newBatch(farm, placement);
    await rpc(as(), 'record_daily_records', {
      p_batch_id: batchId,
      p_rows: [
        day({ record_date: '2026-02-10', mortality_cumulative: 10, cull_cumulative: 0 }),
        day({ record_date: '2026-02-11', mortality_cumulative: 12, cull_cumulative: 0 })
      ]
    });

    await refused(
      rpc(as(), 'record_daily_records', {
        p_batch_id: batchId,
        p_rows: [day({ record_date: '2026-02-10', mortality_cumulative: 14, cull_cumulative: 0 })]
      }),
      '23514'
    );

    await rpc(as(), 'record_daily_records', {
      p_batch_id: batchId,
      p_rows: [
        day({ record_date: '2026-02-10', mortality_cumulative: 14, cull_cumulative: 0 }),
        day({ record_date: '2026-02-11', mortality_cumulative: 15, cull_cumulative: 0 })
      ]
    });
    const { rows } = await pool.query<{ record_date: string; mortality_cumulative: number }>(
      `select to_char(record_date, 'YYYY-MM-DD') as record_date, mortality_cumulative
         from public.daily_records where batch_id = $1 order by record_date`,
      [batchId]
    );
    expect(rows).toEqual([
      { record_date: '2026-02-10', mortality_cumulative: 14 },
      { record_date: '2026-02-11', mortality_cumulative: 15 }
    ]);
  });

  it('rejects removals over the flock, naming the day and the numbers', async () => {
    const batchId = await newBatch(farm, placement);
    const error = await refused(
      rpc(as(), 'record_daily_records', {
        p_batch_id: batchId,
        p_rows: [day({ record_date: '2026-02-17', mortality_cumulative: 90, cull_cumulative: 11 })]
      }),
      '23514'
    );
    expect(error.message).toContain('Day 12: removals exceed the flock — 90 dead + 11 culled = 101 from 100 birds');
    expect(await currentDays(batchId)).toBe(0);
  });

  it('rejects a record dated before placement', async () => {
    const batchId = await newBatch(farm, placement);
    await refused(
      rpc(as(), 'record_daily_records', {
        p_batch_id: batchId,
        p_rows: [day({ record_date: '2026-02-05', mortality_cumulative: 0, cull_cumulative: 0 })]
      }),
      '23514'
    );
  });
});

describe('T-DB2 · the other side of each bound', () => {
  it('rejects a placement correction that lowers the flock below recorded removals', async () => {
    const batchId = await newBatch(farm, placement);
    await rpc(farm.worker, 'record_daily_records', {
      p_batch_id: batchId,
      p_rows: [day({ record_date: '2026-02-10', mortality_cumulative: 60, cull_cumulative: 10 })]
    });
    const { rows } = await pool.query<{ placement_version_id: string }>(
      'select placement_version_id from public.batches where id = $1',
      [batchId]
    );

    const error = await refused(
      rpc(farm.owner, 'record_batch_placement', {
        payload: {
          batch_id: batchId,
          supersedes_id: rows[0]!.placement_version_id,
          client_request_id: uuid(),
          ...placement,
          chick_count: 50
        }
      }),
      '23514'
    );
    expect(error.message).toContain('removals exceed the flock');
  });

  it('rejects a placement correction that moves placement after a recorded day', async () => {
    const batchId = await newBatch(farm, placement);
    await rpc(farm.worker, 'record_daily_records', {
      p_batch_id: batchId,
      p_rows: [day({ record_date: '2026-02-08', mortality_cumulative: 1, cull_cumulative: 0 })]
    });
    const { rows } = await pool.query<{ placement_version_id: string }>(
      'select placement_version_id from public.batches where id = $1',
      [batchId]
    );
    await refused(
      rpc(farm.owner, 'record_batch_placement', {
        payload: { batch_id: batchId, supersedes_id: rows[0]!.placement_version_id, client_request_id: uuid(), ...placement, placement_date: '2026-02-09' }
      }),
      '23514'
    );
  });

  it('rejects sales orders whose total exceeds the flock', async () => {
    const batchId = await newBatch(farm, placement);
    await refused(rpc(farm.owner, 'record_sales_order', { payload: order(batchId, 101) }), '23514');
  });

  it('lets exactly one of two concurrent orders commit when together they exceed the flock', async () => {
    const batchId = await newBatch(farm, placement);
    const first = await openAs(farm.owner.userId);
    const second = await openAs(farm.manager.userId);
    try {
      await first.query('select public.record_sales_order($1::jsonb)', [JSON.stringify(order(batchId, 60))]);
      await second.query('select public.record_sales_order($1::jsonb)', [JSON.stringify(order(batchId, 60))]);

      const outcomes = await Promise.allSettled([first.query('commit'), second.query('commit')]);
      const committed = outcomes.filter((o) => o.status === 'fulfilled');
      const rejected = outcomes.filter((o): o is PromiseRejectedResult => o.status === 'rejected');
      expect(committed).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect((rejected[0]!.reason as { code?: string }).code).toBe('23514');
    } finally {
      first.release();
      second.release();
    }
    expect(await rowCount('select 1 from public.sales_orders where batch_id = $1', [batchId])).toBe(1);
  });
});

function order(batchId: string, birds: number): Record<string, unknown> {
  return {
    batch_id: batchId,
    client_request_id: uuid(),
    channel: 'GATE',
    order_date: '2026-03-10',
    bird_count: birds,
    avg_live_weight_g: 1800,
    avg_dressed_weight_g: null,
    pricing_basis: 'PER_BIRD',
    price_cents_per_bird: '425',
    price_cents_per_kg: null,
    terms_days: 0,
    bands: []
  };
}
