/**
 * `loadEngineInput` (D25, D27, AD-90, AD-92): one call to
 * `public.engine_snapshot(p_batch_id, p_as_of)`, validated with Zod, mapped to
 * `EngineInput`. The only arithmetic allowed is `dayNumberFor` and grams/1000.
 *
 * The snapshot contract it parses is pinned in
 * `tests/repositories/snapshot-fixture.ts`. The `cash` section is validated as
 * present but not mapped: the engine has no opening-cash field until AD-67's
 * engine side lands (OQ-25).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import {
  CHANNELS,
  CONFIDENCES,
  DELIVERY_MODES,
  ENTRY_SOURCES,
  Money,
  OVERHEAD_BASES,
  OVERHEAD_KEYS,
  OVERHEAD_TIMINGS,
  PHASE_SOURCES,
  PHASES,
  PRICING_BASES,
  SALE_PRICING_BASES,
  dayNumberFor,
  type BasisPoints,
  type BreedCurve,
  type DayNumber,
  type EngineInput,
  type Grams,
  type IsoDate,
  type Parameters,
  type PhasePricing
} from '@runproduce/engine';
import { mapDatabaseError, RepositoryError } from './errors.js';

// AD-91: money is an integer string, never a JSON number, and never coerced.
const cents = z
  .string()
  .regex(/^-?\d+$/, 'money must be an integer string')
  .transform((s) => Money.fromCents(BigInt(s)));
const nullableCents = cents.nullable();
// Bags: a decimal string of at most two places, which the engine takes as a number.
const bags = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/, 'bags must be a decimal string with at most two places')
  .transform(Number);
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .transform((s) => s as IsoDate);
const int = z.number().int();
const grams = int.transform((g) => g as Grams);

const overheadLine = z.object({
  key: z.enum(OVERHEAD_KEYS),
  label: z.string(),
  basis: z.enum(OVERHEAD_BASES),
  timing: z.enum(OVERHEAD_TIMINGS),
  amount_cents: cents,
  measured_at_flock_size: int,
  confidence: z.enum(CONFIDENCES),
  source: z.string()
});

const band = z.object({ dressed_floor_g: grams, price_cents_per_bird: cents });

const snapshotSchema = z.object({
  batch: z.object({
    placement_date: isoDate,
    chick_count: int,
    extra_chick_count: int,
    chick_price_cents: cents
  }),
  parameter_set: z.object({
    mortality_base_rate_bp_daily: int,
    mortality_ramp_start_day: int,
    mortality_ramp_rate_bp_daily: int,
    slaughter_target_g: grams,
    gate_pricing_basis: z.enum(PRICING_BASES),
    gate_price_cents_per_bird: nullableCents,
    gate_price_cents_per_kg: nullableCents,
    gate_capacity_per_day: int,
    abattoir_fee_cents: nullableCents,
    transport_cents_per_bird: nullableCents,
    delivery_mode: z.enum(DELIVERY_MODES),
    feed_terms_days: int,
    delivery_cents_per_tonne: cents,
    reserve_floor_cents: cents,
    dressing_yield_pct: int,
    calibration_trailing_days_min: int,
    placement_step_birds: int,
    max_placement_birds: int.nullable(),
    overhead_lines: z.array(overheadLine),
    planning_bulk_bands: z.array(band),
    feed_prices: z.array(z.object({ phase: z.enum(PHASES), price_per_bag_cents: cents, bag_kg: int }))
  }),
  curve: z.object({
    source: z.string(),
    points: z.array(
      z.object({ day_number: int, weight_g: grams, feed_g: grams, phase: z.enum(PHASES) })
    ),
    phases: z.array(z.object({ phase: z.enum(PHASES), first_day: int, last_day: int }))
  }),
  daily_records: z.array(
    z.object({
      record_date: isoDate,
      mortality_cumulative: int,
      cull_cumulative: int,
      feed_starter_g: int,
      feed_grower_g: int,
      feed_finisher_g: int,
      avg_weight_g: grams.nullable(),
      weight_sample_size: int.nullable(),
      // Present even when null (U7 D20): null is "not recorded", never a default.
      feed_entry_source: z.enum(ENTRY_SOURCES).nullable(),
      feed_phase: z.enum(PHASES).nullable(),
      feed_phase_source: z.enum(PHASE_SOURCES).nullable()
    })
  ),
  feed_draws: z.array(
    z.object({
      collection_date: isoDate,
      phase: z.enum(PHASES),
      bags,
      feed_g: int,
      price_per_bag_cents: cents,
      terms_days: int
    })
  ),
  sales_orders: z.array(
    z.object({
      channel: z.enum(CHANNELS),
      order_date: isoDate,
      bird_count: int,
      avg_live_weight_g: grams,
      avg_dressed_weight_g: grams.nullable(),
      pricing_basis: z.enum(SALE_PRICING_BASES),
      price_cents_per_bird: nullableCents,
      price_cents_per_kg: nullableCents,
      terms_days: int,
      bands: z.array(band)
    })
  ),
  // Validated as present, mapped by nobody yet (AD-67's engine side, OQ-25).
  cash: z.object({ accounts: z.array(z.unknown()), transactions: z.array(z.unknown()) })
});

type Snapshot = z.infer<typeof snapshotSchema>;

export async function loadEngineInput(client: SupabaseClient, batchId: string, asOf: IsoDate): Promise<EngineInput> {
  const { data, error } = await client.rpc('engine_snapshot', { p_batch_id: batchId, p_as_of: asOf });
  // Mapped before anything is parsed, so a Forbidden never reaches Zod (T-AC4).
  if (error) throw mapDatabaseError(error, { asOf });

  const parsed = snapshotSchema.safeParse(data);
  // Our own SQL and our own schema disagree: a generic failure to log (AD-93 amendment).
  if (!parsed.success) {
    throw new RepositoryError(`engine_snapshot did not match its contract: ${z.prettifyError(parsed.error)}`);
  }
  return toEngineInput(parsed.data, asOf);
}

function toEngineInput(s: Snapshot, asOf: IsoDate): EngineInput {
  const placement = s.batch.placement_date;
  const set = s.parameter_set;

  const parameters: Parameters = {
    mortality: {
      base_rate_bp_daily: set.mortality_base_rate_bp_daily as BasisPoints,
      preharvest_ramp_start_day: set.mortality_ramp_start_day as DayNumber,
      preharvest_ramp_rate_bp_daily: set.mortality_ramp_rate_bp_daily as BasisPoints
    },
    slaughter_target_g: set.slaughter_target_g,
    gate_price_cents_per_bird: set.gate_price_cents_per_bird,
    gate_price_cents_per_kg: set.gate_price_cents_per_kg,
    gate_pricing_basis: set.gate_pricing_basis,
    gate_capacity_per_day: set.gate_capacity_per_day,
    abattoir_fee_cents: set.abattoir_fee_cents,
    transport_cents_per_bird: set.transport_cents_per_bird,
    delivery_mode: set.delivery_mode,
    feed_terms_days: set.feed_terms_days,
    reserve_floor_cents: set.reserve_floor_cents,
    // Always explicit (D5): zero rows is "charge none", never the seed.
    overheads: { lines: set.overhead_lines },
    dressing_yield_pct: set.dressing_yield_pct,
    bulk_bands: set.planning_bulk_bands,
    delivery_cents_per_tonne: set.delivery_cents_per_tonne,
    calibration_trailing_days_min: set.calibration_trailing_days_min,
    placement_step_birds: set.placement_step_birds,
    // Null is omitted, never passed as null (D5's note).
    ...(set.max_placement_birds === null ? {} : { max_placement_birds: set.max_placement_birds })
  };

  return {
    asOf,
    batch: {
      placement_date: placement,
      chick_count: s.batch.chick_count,
      extra_chick_count: s.batch.extra_chick_count,
      chick_price_cents: s.batch.chick_price_cents
    },
    parameters,
    curve: toCurve(s),
    records: s.daily_records.map((r) => ({
      day_number: dayNumberFor(placement, r.record_date) as DayNumber,
      mortality_cumulative: r.mortality_cumulative,
      cull_cumulative: r.cull_cumulative,
      feed_starter_kg: r.feed_starter_g / 1000,
      feed_grower_kg: r.feed_grower_g / 1000,
      feed_finisher_kg: r.feed_finisher_g / 1000,
      avg_weight_g: r.avg_weight_g,
      weight_sample_size: r.weight_sample_size,
      feed_entry_source: r.feed_entry_source,
      feed_phase: r.feed_phase,
      feed_phase_source: r.feed_phase_source
    })),
    draws: s.feed_draws.map((d) => ({
      collection_date: d.collection_date,
      phase: d.phase,
      bags: d.bags,
      kg: d.feed_g / 1000,
      price_per_bag_cents: d.price_per_bag_cents,
      terms_days: d.terms_days
    })),
    sales: s.sales_orders.map((o) => ({
      channel: o.channel,
      order_date: o.order_date,
      bird_count: o.bird_count,
      avg_live_weight_g: o.avg_live_weight_g,
      avg_dressed_weight_g: o.avg_dressed_weight_g,
      pricing_basis: o.pricing_basis,
      price_cents_per_bird: o.price_cents_per_bird,
      price_cents_per_kg: o.price_cents_per_kg,
      // Zero band rows is the engine's "not supplied", which it refuses on a BANDED order.
      bands: o.bands.length === 0 ? null : o.bands,
      terms_days: o.terms_days
    }))
  };
}

/** The pinned curve, priced from the set in force (D6, D12). Always passed (D11). */
function toCurve(s: Snapshot): BreedCurve {
  const prices = new Map(s.parameter_set.feed_prices.map((p) => [p.phase, p]));
  const phases: PhasePricing[] = s.curve.phases.map((ph) => {
    const price = prices.get(ph.phase);
    if (price === undefined) {
      // Never invent a feed price (rule 3): the set is incomplete for this curve.
      throw new RepositoryError(`The parameter set in force has no feed price for ${ph.phase}.`);
    }
    return {
      phase: ph.phase,
      first_day: ph.first_day as DayNumber,
      last_day: ph.last_day as DayNumber,
      price_per_bag_cents: price.price_per_bag_cents,
      bag_kg: price.bag_kg
    };
  });
  return {
    source: s.curve.source,
    points: s.curve.points.map((p) => ({ ...p, day_number: p.day_number as DayNumber })),
    phases
  };
}
