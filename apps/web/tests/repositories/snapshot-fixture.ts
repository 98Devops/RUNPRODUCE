/**
 * THE `engine_snapshot` CONTRACT (D25, D26), as a canned document.
 *
 * `public.engine_snapshot(p_batch_id, p_as_of)` returns exactly this shape, and
 * `loadEngineInput` parses exactly this shape. The database half of the test
 * (`packages/db-tests/tests/engine-snapshot.test.ts`) asserts the same top-level
 * sections come back from the real function, so the two cannot drift.
 *
 * - Every `*_cents` field and `bags` is a string (AD-91). Never a JSON number.
 * - Dates are `YYYY-MM-DD` strings, which is how Postgres renders `date` in jsonb.
 * - Lists arrive already ordered: overhead lines by `position`, planning bands by
 *   `dressed_floor_g`, curve points by `day_number`, curve phases by `first_day`,
 *   records by `record_date`, draws and orders by date then `created_at`.
 * - `cash` is D25's AD-67 section. `loadEngineInput` does not map it yet: the
 *   engine has no opening-cash field until AD-67's engine side lands.
 */
export function cannedSnapshot() {
  return {
    batch: {
      id: '00000000-0000-4000-8000-0000000000b1',
      org_id: '00000000-0000-4000-8000-0000000000a1',
      code: 'B-TEST',
      breed_curve_id: '00000000-0000-4000-8000-0000000000c1',
      placement_date: '2026-03-10',
      chick_count: 1000,
      extra_chick_count: 20,
      chick_price_cents: '85',
      closed_on: null as string | null
    },
    parameter_set: {
      id: '00000000-0000-4000-8000-0000000000d1',
      effective_from: '2026-03-01',
      revision: 2,
      mortality_base_rate_bp_daily: 15,
      mortality_ramp_start_day: 30,
      mortality_ramp_rate_bp_daily: 35,
      slaughter_target_g: 1770,
      gate_pricing_basis: 'PER_BIRD',
      gate_price_cents_per_bird: '425' as string | null,
      gate_price_cents_per_kg: null as string | null,
      gate_capacity_per_day: 750,
      abattoir_fee_cents: '10' as string | null,
      transport_cents_per_bird: '10' as string | null,
      delivery_mode: 'ABATTOIR',
      feed_terms_days: 30,
      delivery_cents_per_tonne: '0',
      reserve_floor_cents: '0',
      dressing_yield_pct: 62,
      calibration_trailing_days_min: 3,
      placement_step_birds: 1,
      max_placement_birds: null as number | null,
      overhead_lines: [
        {
          key: 'vaccine',
          label: 'Vaccine',
          basis: 'PER_BIRD',
          timing: 'PLACEMENT',
          amount_cents: '12',
          measured_at_flock_size: 3000,
          confidence: 'measured',
          source: 'test'
        },
        {
          key: 'labour',
          label: 'Labour',
          basis: 'PER_BATCH',
          timing: 'MONTHLY',
          amount_cents: '60000',
          measured_at_flock_size: 3000,
          confidence: 'assumed',
          source: 'test'
        }
      ] as Array<Record<string, unknown>>,
      planning_bulk_bands: [{ dressed_floor_g: 1100, price_cents_per_bird: '370' }] as Array<Record<string, unknown>>,
      feed_prices: [
        { phase: 'STARTER', price_per_bag_cents: '3060', bag_kg: 50 },
        { phase: 'GROWER', price_per_bag_cents: '2960', bag_kg: 50 },
        { phase: 'FINISHER', price_per_bag_cents: '2860', bag_kg: 50 }
      ] as Array<Record<string, unknown>>
    },
    curve: {
      id: '00000000-0000-4000-8000-0000000000c1',
      source: 'test curve',
      points: [
        { day_number: 1, weight_g: 60, feed_g: 15, phase: 'STARTER' },
        { day_number: 2, weight_g: 80, feed_g: 20, phase: 'GROWER' },
        { day_number: 3, weight_g: 100, feed_g: 25, phase: 'FINISHER' }
      ] as Array<Record<string, unknown>>,
      phases: [
        { phase: 'STARTER', first_day: 1, last_day: 1 },
        { phase: 'GROWER', first_day: 2, last_day: 2 },
        { phase: 'FINISHER', first_day: 3, last_day: 3 }
      ] as Array<Record<string, unknown>>
    },
    daily_records: [
      {
        record_date: '2026-03-10',
        mortality_cumulative: 2,
        cull_cumulative: 0,
        feed_starter_g: 12500,
        feed_grower_g: 0,
        feed_finisher_g: 0,
        avg_weight_g: null,
        weight_sample_size: null
      },
      {
        record_date: '2026-03-12',
        mortality_cumulative: 3,
        cull_cumulative: 1,
        feed_starter_g: 0,
        feed_grower_g: 14250,
        feed_finisher_g: 7,
        avg_weight_g: 95,
        weight_sample_size: 20
      }
    ] as Array<Record<string, unknown>>,
    feed_draws: [
      {
        collection_date: '2026-03-09',
        phase: 'STARTER',
        bags: '2.5',
        feed_g: 125000,
        price_per_bag_cents: '3060',
        terms_days: 30
      }
    ] as Array<Record<string, unknown>>,
    sales_orders: [
      {
        channel: 'GATE',
        order_date: '2026-04-20',
        bird_count: 100,
        avg_live_weight_g: 2100,
        avg_dressed_weight_g: null,
        pricing_basis: 'PER_BIRD',
        price_cents_per_bird: '425',
        price_cents_per_kg: null,
        terms_days: 0,
        bands: [] as Array<Record<string, unknown>>
      },
      {
        channel: 'BULK',
        order_date: '2026-04-25',
        bird_count: 200,
        avg_live_weight_g: 2000,
        avg_dressed_weight_g: 1250,
        pricing_basis: 'BANDED',
        price_cents_per_bird: null,
        price_cents_per_kg: null,
        terms_days: 14,
        bands: [
          { dressed_floor_g: 1100, price_cents_per_bird: '350' },
          { dressed_floor_g: 1300, price_cents_per_bird: '370' }
        ] as Array<Record<string, unknown>>
      }
    ] as Array<Record<string, unknown>>,
    cash: {
      accounts: [{ id: '00000000-0000-4000-8000-0000000000e1', opening_date: '2026-03-01', opening_balance_cents: '500000' }],
      transactions: [
        {
          id: '00000000-0000-4000-8000-0000000000f1',
          account_id: '00000000-0000-4000-8000-0000000000e1',
          txn_date: '2026-03-05',
          direction: 'OUT',
          amount_cents: '20000',
          category: 'chicks',
          batch_id: null
        }
      ]
    }
  };
}

export type CannedSnapshot = ReturnType<typeof cannedSnapshot>;

/** The top-level sections, in one place, for the database half to check against. */
export const SNAPSHOT_SECTIONS = ['batch', 'parameter_set', 'curve', 'daily_records', 'feed_draws', 'sales_orders', 'cash'] as const;
