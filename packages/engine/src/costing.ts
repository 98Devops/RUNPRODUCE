import { SEED_BREED_CURVE, pointForDay } from './breed-curve.js';
import { SEED_OVERHEADS, overheadBreakdown, overheadCostCents } from './overheads.js';
import type {
  Cents,
  CostingResult,
  EngineInput,
  Phase,
  PhasePricing,
  ProductionProjection
} from './types.js';

/**
 * M2 — costing.
 *
 * Reproduces the client's own Final Report: $3,000 of chicks and $8,079.81 of
 * feed on his 3,000-bird batch, plus the four measured overhead lines (AD-26).
 *
 * Two rules govern the shape of the output:
 *
 *   - Core credit is chicks + feed and NOTHING else (invariant 15). His brief
 *     asks for the break-evens separately — "These are NOT the same number" —
 *     and a blended figure cannot be un-blended later. Overheads land in
 *     `overhead_cost_cents` and `full_production_cost_cents`, beside it.
 *   - Every figure is `bigint` cents throughout. Feed is priced from integer
 *     GRAMS against a per-kg rate in cents, so no float touches a money path.
 */
export function computeCosting(
  input: EngineInput,
  production: ProductionProjection
): CostingResult {
  const curve = input.curve ?? SEED_BREED_CURVE;

  const chick_cost_cents = (input.batch.chick_price_cents *
    BigInt(production.flock_size)) as Cents;

  /**
   * Feed grams per phase, charged to OPENING birds (AD-7, invariant 10). Read
   * off the projection's own day series so costing and production can never
   * disagree about who ate what.
   */
  const feedGByPhase: Record<Phase, bigint> = { STARTER: 0n, GROWER: 0n, FINISHER: 0n };
  for (const day of production.days) {
    const point = pointForDay(curve, day.day_number);
    feedGByPhase[point.phase] += BigInt(day.opening_birds) * BigInt(point.feed_g);
  }

  let feed_cost_cents = 0n;
  for (const phase of curve.phases) {
    feed_cost_cents += costOfFeed(feedGByPhase[phase.phase], phase);
  }

  const core_credit_cents = (chick_cost_cents + feed_cost_cents) as Cents;

  const overheads = input.parameters.overheads ?? SEED_OVERHEADS;
  const overhead_lines = overheadBreakdown(overheads, production.flock_size);
  const overhead_cost_cents = overheadCostCents(overheads, production.flock_size);

  return {
    chick_cost_cents,
    feed_cost_cents: feed_cost_cents as Cents,
    core_credit_cents,
    overhead_cost_cents,
    overhead_lines,
    full_production_cost_cents: (core_credit_cents + overhead_cost_cents) as Cents
  };
}

/**
 * Grams at a phase's BAG price, in `bigint`, rounding **up**.
 *
 * `grams x bag_cents / (bag_kg x 1000)` — the bag price divided down to the
 * gram in one integer expression, never through an intermediate per-kg rate
 * (AD-52). Daniel's $30.60 over a 50 kg bag is 61.2 cents a kg, and any whole-
 * cent per-kg rate is a different price from the one he pays: 61c under-charges
 * this batch's starter phase by $2.30, 62c over-charges it by $9.19.
 *
 * The division is exact on a whole bag and on many other quantities; elsewhere
 * it rounds UP, because a cost rounded down flatters a break-even, which is the
 * one direction this engine must never err in (AD-26). At most one cent per
 * phase.
 *
 * Exported so `cash.ts` and `harvest.ts` price feed with the identical
 * rounding rule rather than three copies of it — `harvest.ts` carried its own
 * duplicate until AD-52 removed it.
 */
export function costOfFeed(grams: bigint, pricing: PhasePricing): bigint {
  if (!Number.isInteger(pricing.bag_kg) || pricing.bag_kg <= 0) {
    throw new Error(
      `costOfFeed: ${pricing.phase} has a bag size of ${pricing.bag_kg} kg, which cannot price feed`
    );
  }
  const perBagGrams = BigInt(pricing.bag_kg) * 1000n;
  const product = grams * pricing.price_per_bag_cents;
  const whole = product / perBagGrams;
  return product % perBagGrams === 0n ? whole : whole + 1n;
}
