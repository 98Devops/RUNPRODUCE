/**
 * T-RT2 · Sales round trip, and T-RT3 · Correction round trip (U6 chunk 5).
 */
import {
  SEED_BREED_CURVE,
  computeFeedLiability,
  projectCashCalendar,
  projectProduction,
  type Cents,
  type DailyRecord,
  type EngineInput,
  type IsoDate,
  type SalesOrder
} from '@runproduce/engine';
import { BASE_PARAMETERS, newBatch, newFarm, type Farm } from '../src/payloads.js';
import { pool, refused, rpc, uuid } from '../src/harness.js';
import { loadEngineInput } from '../../../apps/web/lib/repositories/index.js';

let farm: Farm;

beforeAll(async () => {
  farm = await newFarm('T-RT');
});

afterAll(async () => {
  await pool.end();
});

const placement = { placement_date: '2026-02-06', chick_count: 3000, extra_chick_count: 0, chick_price_cents: '100' };

function bulkOrder(batchId: string, channel: 'BULK' | 'GATE'): Record<string, unknown> {
  return {
    batch_id: batchId,
    client_request_id: uuid(),
    channel,
    order_date: '2026-03-08',
    bird_count: 1200,
    avg_live_weight_g: 1843,
    avg_dressed_weight_g: 1150,
    pricing_basis: 'BANDED',
    price_cents_per_bird: null,
    price_cents_per_kg: null,
    terms_days: 30,
    bands: [
      { dressed_floor_g: 1300, price_cents_per_bird: '370' },
      { dressed_floor_g: 1100, price_cents_per_bird: '390' },
      { dressed_floor_g: 1200, price_cents_per_bird: '380' }
    ]
  };
}

describe('T-RT2 · a BANDED BULK order round-trips to the cash calendar', () => {
  it('equals the in-memory calendar', async () => {
    const batchId = await newBatch(farm, placement);
    await rpc(farm.owner, 'record_sales_order', { payload: bulkOrder(batchId, 'BULK') });

    const asOf = '2026-03-18' as IsoDate;
    const loaded = await loadEngineInput(farm.owner.client, batchId, asOf);

    const order: SalesOrder = {
      channel: 'BULK',
      order_date: '2026-03-08' as IsoDate,
      bird_count: 1200,
      avg_live_weight_g: 1843 as SalesOrder['avg_live_weight_g'],
      avg_dressed_weight_g: 1150 as NonNullable<SalesOrder['avg_dressed_weight_g']>,
      pricing_basis: 'BANDED',
      price_cents_per_bird: null,
      price_cents_per_kg: null,
      bands: [
        { dressed_floor_g: 1100, price_cents_per_bird: 390n },
        { dressed_floor_g: 1200, price_cents_per_bird: 380n },
        { dressed_floor_g: 1300, price_cents_per_bird: 370n }
      ] as unknown as SalesOrder['bands'],
      terms_days: 30
    };
    const inMemory: EngineInput = {
      asOf,
      batch: { placement_date: '2026-02-06' as IsoDate, chick_count: 3000, extra_chick_count: 0, chick_price_cents: 100n as Cents },
      parameters: BASE_PARAMETERS,
      records: [],
      draws: [],
      sales: [order]
    };

    expect(loaded.sales).toEqual(inMemory.sales);
    const calendar = (input: EngineInput) =>
      projectCashCalendar(input, 90, 0n as Cents, computeFeedLiability(input, projectProduction(input)));
    expect(calendar(loaded)).toEqual(calendar(inMemory));
  });

  it('rejects a BANDED GATE order on sales_order_versions_banded_is_bulk', async () => {
    const batchId = await newBatch(farm, placement);
    const error = await refused(rpc(farm.owner, 'record_sales_order', { payload: bulkOrder(batchId, 'GATE') }), '23514');
    expect(error.message).toContain('sales_order_versions_banded_is_bulk');
  });
});

describe('T-RT3 · corrections and voids round-trip to production', () => {
  it('returns days 1, 2, 3 (corrected) and 5, and carries day 4 forward', async () => {
    const batchId = await newBatch(farm, placement);
    const row = (date: string, mortality: number): Record<string, unknown> => ({
      client_request_id: uuid(),
      record_date: date,
      mortality_cumulative: mortality,
      cull_cumulative: 0,
      feed_starter_g: 30000,
      feed_grower_g: 0,
      feed_finisher_g: 0,
      avg_weight_g: null,
      weight_sample_size: null,
      notes: null
    });
    await rpc(farm.worker, 'record_daily_records', {
      p_batch_id: batchId,
      p_rows: [row('2026-02-06', 2), row('2026-02-07', 4), row('2026-02-08', 6), row('2026-02-09', 8), row('2026-02-10', 10)]
    });

    const { rows: day3 } = await pool.query<{ id: string }>(
      `select id from public.daily_records where batch_id = $1 and record_date = '2026-02-08'`,
      [batchId]
    );
    await rpc(farm.worker, 'record_daily_records', {
      p_batch_id: batchId,
      p_rows: [{ ...row('2026-02-08', 5), supersedes_id: day3[0]!.id }, { ...row('2026-02-09', 0), voided: true }]
    });

    const { rows } = await pool.query<{ record_date: string; mortality_cumulative: number }>(
      `select to_char(record_date, 'YYYY-MM-DD') as record_date, mortality_cumulative
         from public.daily_records where batch_id = $1 order by record_date`,
      [batchId]
    );
    expect(rows).toEqual([
      { record_date: '2026-02-06', mortality_cumulative: 2 },
      { record_date: '2026-02-07', mortality_cumulative: 4 },
      { record_date: '2026-02-08', mortality_cumulative: 5 },
      { record_date: '2026-02-10', mortality_cumulative: 10 }
    ]);

    const asOf = '2026-02-10' as IsoDate;
    const loaded = await loadEngineInput(farm.owner.client, batchId, asOf);
    const record = (day: number, mortality: number): DailyRecord =>
      ({
        day_number: day,
        mortality_cumulative: mortality,
        cull_cumulative: 0,
        feed_starter_kg: 30,
        feed_grower_kg: 0,
        feed_finisher_kg: 0,
        avg_weight_g: null,
        weight_sample_size: null
      }) as unknown as DailyRecord;
    const inMemory: EngineInput = {
      asOf,
      batch: { placement_date: '2026-02-06' as IsoDate, chick_count: 3000, extra_chick_count: 0, chick_price_cents: 100n as Cents },
      parameters: BASE_PARAMETERS,
      curve: SEED_BREED_CURVE,
      records: [record(1, 2), record(2, 4), record(3, 5), record(5, 10)],
      draws: [],
      sales: []
    };

    const production = projectProduction(loaded);
    expect(production).toEqual(projectProduction(inMemory));
    expect(production.days.find((d) => d.day_number === 4)?.carried_forward).toBe(true);
  });
});
