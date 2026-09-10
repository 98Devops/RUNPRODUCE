import { SEED_BREED_CURVE, pointForDay } from './breed-curve.js';
import { SEED_OVERHEADS, overheadBreakdown, overheadCostCents } from './overheads.js';
import type {
  Cents,
  CostingResult,
  EngineInput,
  Phase,
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
    feed_cost_cents += costOfFeed(feedGByPhase[phase.phase], phase.price_per_kg_cents);
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
 * Grams at a per-kg rate, in `bigint`, rounding **up**. The division is exact
 * on whole kilograms; elsewhere a cost rounded down would flatter a break-even,
 * which is the one direction this engine must never err in (AD-26). At most one
 * cent per phase.
 */
function costOfFeed(grams: bigint, price_per_kg_cents: Cents): bigint {
  const product = grams * price_per_kg_cents;
  const whole = product / 1000n;
  return product % 1000n === 0n ? whole : whole + 1n;
}
