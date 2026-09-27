/**
 * `loadEngineInput` against a fake client: the half of D25 to D28 that needs no
 * database. T-RP1 and T-RP2 (packages/db-tests) cover the other half against a
 * real `engine_snapshot`.
 *
 * The fake stands in for the network only. It returns what PostgREST would
 * return for `client.rpc(...)`, a `{ data, error }` pair, and records the call.
 *
 * Assumption this file pins (not in D28's table, which lists SQLSTATEs): a
 * snapshot that fails Zod is a `RepositoryError`. It means our own SQL and our
 * own schema disagree, which is a generic failure to log, not something the
 * screen can explain to Daniel.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { IsoDate } from '@runproduce/engine';
import {
  Conflict,
  Forbidden,
  IntegrityRejected,
  loadEngineInput,
  NoParametersInForce,
  RepositoryError,
  StaleCorrection
} from '../../lib/repositories/index.js';
import { cannedSnapshot, type CannedSnapshot } from './snapshot-fixture.js';

const BATCH_ID = '00000000-0000-4000-8000-0000000000b1';
const AS_OF = '2026-04-01' as IsoDate;

interface Call {
  readonly fn: string;
  readonly args: unknown;
}

function fakeClient(reply: { data?: unknown; error?: { code: string; message: string } }) {
  const calls: Call[] = [];
  const client = {
    rpc: async (fn: string, args: unknown) => {
      calls.push({ fn, args });
      return { data: reply.data ?? null, error: reply.error ?? null };
    }
  } as unknown as SupabaseClient;
  return { client, calls };
}

function load(snapshot: unknown) {
  return loadEngineInput(fakeClient({ data: snapshot }).client, BATCH_ID, AS_OF);
}

function withChange(change: (s: CannedSnapshot) => void): CannedSnapshot {
  const s = cannedSnapshot();
  change(s);
  return s;
}

type Loose = Record<string, unknown>;

describe('loadEngineInput · one engine read is one statement (D25)', () => {
  it('calls engine_snapshot exactly once, with the batch and asOf', async () => {
    const { client, calls } = fakeClient({ data: cannedSnapshot() });
    await loadEngineInput(client, BATCH_ID, AS_OF);
    expect(calls).toEqual([{ fn: 'engine_snapshot', args: { p_batch_id: BATCH_ID, p_as_of: AS_OF } }]);
  });
});

describe('loadEngineInput · the mapping (D27)', () => {
  it('maps the canned snapshot to exactly this EngineInput', async () => {
    const input = await load(cannedSnapshot());
    expect(input).toStrictEqual({
      asOf: '2026-04-01',
      batch: { placement_date: '2026-03-10', chick_count: 1000, extra_chick_count: 20, chick_price_cents: 85n },
      parameters: {
        mortality: { base_rate_bp_daily: 15, preharvest_ramp_start_day: 30, preharvest_ramp_rate_bp_daily: 35 },
        slaughter_target_g: 1770,
        gate_price_cents_per_bird: 425n,
        gate_price_cents_per_kg: null,
        gate_pricing_basis: 'PER_BIRD',
        gate_capacity_per_day: 750,
        abattoir_fee_cents: 10n,
        transport_cents_per_bird: 10n,
        delivery_mode: 'ABATTOIR',
        feed_terms_days: 30,
        reserve_floor_cents: 0n,
        overheads: {
          lines: [
            {
              key: 'vaccine',
              label: 'Vaccine',
              basis: 'PER_BIRD',
              timing: 'PLACEMENT',
              amount_cents: 12n,
              measured_at_flock_size: 3000,
              confidence: 'measured',
              source: 'test'
            },
            {
              key: 'labour',
              label: 'Labour',
              basis: 'PER_BATCH',
              timing: 'MONTHLY',
              amount_cents: 60000n,
              measured_at_flock_size: 3000,
              confidence: 'assumed',
              source: 'test'
            }
          ]
        },
        dressing_yield_pct: 62,
        bulk_bands: [{ dressed_floor_g: 1100, price_cents_per_bird: 370n }],
        delivery_cents_per_tonne: 0n,
        calibration_trailing_days_min: 3,
        placement_step_birds: 1
      },
      // Always passed, never omitted for "seed" (D5, D11); prices from the set (D6, D12).
      curve: {
        source: 'test curve',
        points: [
          { day_number: 1, weight_g: 60, feed_g: 15, phase: 'STARTER' },
          { day_number: 2, weight_g: 80, feed_g: 20, phase: 'GROWER' },
          { day_number: 3, weight_g: 100, feed_g: 25, phase: 'FINISHER' }
        ],
        phases: [
          { phase: 'STARTER', first_day: 1, last_day: 1, price_per_bag_cents: 3060n, bag_kg: 50 },
          { phase: 'GROWER', first_day: 2, last_day: 2, price_per_bag_cents: 2960n, bag_kg: 50 },
          { phase: 'FINISHER', first_day: 3, last_day: 3, price_per_bag_cents: 2860n, bag_kg: 50 }
        ]
      },
      // dayNumberFor(placement, record_date); feed grams / 1000 (TD-5). Nothing else.
      records: [
        {
          day_number: 1,
          mortality_cumulative: 2,
          cull_cumulative: 0,
          feed_starter_kg: 12.5,
          feed_grower_kg: 0,
          feed_finisher_kg: 0,
          avg_weight_g: null,
          weight_sample_size: null
        },
        {
          day_number: 3,
          mortality_cumulative: 3,
          cull_cumulative: 1,
          feed_starter_kg: 0,
          feed_grower_kg: 14.25,
          feed_finisher_kg: 0.007,
          avg_weight_g: 95,
          weight_sample_size: 20
        }
      ],
      draws: [{ collection_date: '2026-03-09', phase: 'STARTER', bags: 2.5, kg: 125, price_per_bag_cents: 3060n, terms_days: 30 }],
      sales: [
        {
          channel: 'GATE',
          order_date: '2026-04-20',
          bird_count: 100,
          avg_live_weight_g: 2100,
          avg_dressed_weight_g: null,
          pricing_basis: 'PER_BIRD',
          price_cents_per_bird: 425n,
          price_cents_per_kg: null,
          // Zero band rows is `null`, the engine's "not supplied".
          bands: null,
          terms_days: 0
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
          bands: [
            { dressed_floor_g: 1100, price_cents_per_bird: 350n },
            { dressed_floor_g: 1300, price_cents_per_bird: 370n }
          ],
          terms_days: 14
        }
      ]
    });
  });

  it('omits max_placement_birds when the set has none, never passing null (D5)', async () => {
    const input = await load(cannedSnapshot());
    expect('max_placement_birds' in input.parameters).toBe(false);
  });

  it('passes max_placement_birds when the set has one', async () => {
    const input = await load(withChange((s) => (s.parameter_set.max_placement_birds = 30000)));
    expect(input.parameters.max_placement_birds).toBe(30000);
  });

  it('gives zero overhead rows as { lines: [] }, "charge none", never omitted', async () => {
    const input = await load(withChange((s) => (s.parameter_set.overhead_lines = [])));
    expect(input.parameters.overheads).toStrictEqual({ lines: [] });
  });

  it('gives zero planning band rows as [], never omitted', async () => {
    const input = await load(withChange((s) => (s.parameter_set.planning_bulk_bands = [])));
    expect(input.parameters.bulk_bands).toStrictEqual([]);
  });

  it('refuses a curve phase the parameter set has no feed price for, rather than inventing one', async () => {
    await expect(load(withChange((s) => s.parameter_set.feed_prices.pop()))).rejects.toBeInstanceOf(RepositoryError);
  });
});

describe('loadEngineInput · money and bags on the wire (D26, T-RP3)', () => {
  it('carries 2^53 + 1 cents exactly', async () => {
    const input = await load(withChange((s) => (s.batch.chick_price_cents = '9007199254740993')));
    expect(input.batch.chick_price_cents).toBe(9007199254740993n);
  });

  it.each<[string, (s: CannedSnapshot) => void]>([
    ['batch.chick_price_cents', (s) => ((s.batch as Loose)['chick_price_cents'] = 85)],
    ['parameter_set.reserve_floor_cents', (s) => ((s.parameter_set as Loose)['reserve_floor_cents'] = 0)],
    ['parameter_set.gate_price_cents_per_bird', (s) => ((s.parameter_set as Loose)['gate_price_cents_per_bird'] = 425)],
    ['overhead_lines[0].amount_cents', (s) => (s.parameter_set.overhead_lines[0]!['amount_cents'] = 12)],
    ['planning_bulk_bands[0].price_cents_per_bird', (s) => (s.parameter_set.planning_bulk_bands[0]!['price_cents_per_bird'] = 370)],
    ['feed_prices[0].price_per_bag_cents', (s) => (s.parameter_set.feed_prices[0]!['price_per_bag_cents'] = 3060)],
    ['feed_draws[0].price_per_bag_cents', (s) => (s.feed_draws[0]!['price_per_bag_cents'] = 3060)],
    ['sales_orders[0].price_cents_per_bird', (s) => (s.sales_orders[0]!['price_cents_per_bird'] = 425)],
    ['sales_orders[1].bands[0].price_cents_per_bird', (s) => ((s.sales_orders[1]!['bands'] as Loose[])[0]!['price_cents_per_bird'] = 350)]
  ])('refuses %s arriving as a JSON number, never coercing it', async (_path, change) => {
    await expect(load(withChange(change))).rejects.toBeInstanceOf(RepositoryError);
  });

  it.each(['85.5', '', '1e3', ' 85'])('refuses money that is not an integer string (%j)', async (value) => {
    await expect(load(withChange((s) => (s.batch.chick_price_cents = value)))).rejects.toBeInstanceOf(RepositoryError);
  });

  it('refuses bags arriving as a JSON number', async () => {
    await expect(load(withChange((s) => (s.feed_draws[0]!['bags'] = 2.5)))).rejects.toBeInstanceOf(RepositoryError);
  });

  it('refuses bags with more than two decimals, never rounding them', async () => {
    await expect(load(withChange((s) => (s.feed_draws[0]!['bags'] = '2.505')))).rejects.toBeInstanceOf(RepositoryError);
  });
});

describe('loadEngineInput · an unrecognised categorical value is refused, never defaulted (AD-73)', () => {
  it.each<[string, (s: CannedSnapshot) => void]>([
    ['feed draw phase', (s) => (s.feed_draws[0]!['phase'] = 'PRESTARTER')],
    ['curve point phase', (s) => (s.curve.points[0]!['phase'] = 'PRESTARTER')],
    ['overhead timing', (s) => (s.parameter_set.overhead_lines[0]!['timing'] = 'WEEKLY')],
    ['overhead basis', (s) => (s.parameter_set.overhead_lines[0]!['basis'] = 'PER_KG')],
    ['overhead key', (s) => (s.parameter_set.overhead_lines[0]!['key'] = 'rent')],
    ['overhead confidence', (s) => (s.parameter_set.overhead_lines[0]!['confidence'] = 'guessed')],
    ['sales channel', (s) => (s.sales_orders[0]!['channel'] = 'MARKET')],
    ['sales pricing basis', (s) => (s.sales_orders[0]!['pricing_basis'] = 'PER_TONNE')],
    ['gate pricing basis', (s) => (s.parameter_set.gate_pricing_basis = 'BANDED')],
    ['delivery mode', (s) => (s.parameter_set.delivery_mode = 'COURIER')]
  ])('%s', async (_what, change) => {
    await expect(load(withChange(change))).rejects.toBeInstanceOf(RepositoryError);
  });
});

describe('loadEngineInput · errors are typed by SQLSTATE (D28)', () => {
  function failing(code: string, message: string) {
    return loadEngineInput(fakeClient({ error: { code, message } }).client, BATCH_ID, AS_OF);
  }

  it('42501 is Forbidden, carrying the database message', async () => {
    const error = await failing('42501', 'not permitted').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Forbidden);
    expect((error as Error).message).toBe('not permitted');
  });

  it('RP002 is NoParametersInForce, naming the date', async () => {
    const error = await failing('RP002', 'no parameter set in force').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NoParametersInForce);
    expect((error as Error).message).toContain('2026-04-01');
  });

  it('23514 is IntegrityRejected, carrying the database message as it stands', async () => {
    const error = await failing('23514', 'Sold more birds than were placed').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(IntegrityRejected);
    expect((error as Error).message).toBe('Sold more birds than were placed');
  });

  it('23505 is Conflict', async () => {
    await expect(failing('23505', 'duplicate key')).rejects.toBeInstanceOf(Conflict);
  });

  it('RP001 is StaleCorrection', async () => {
    await expect(failing('RP001', 'This record changed since you opened it')).rejects.toBeInstanceOf(StaleCorrection);
  });

  it('any other SQLSTATE is RepositoryError', async () => {
    await expect(failing('XX000', 'internal error')).rejects.toBeInstanceOf(RepositoryError);
  });

  it('a Forbidden is not also a RepositoryError, so a catch-all cannot swallow it', async () => {
    const error = await failing('42501', 'not permitted').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Forbidden);
    expect(error).not.toBeInstanceOf(RepositoryError);
  });
});
