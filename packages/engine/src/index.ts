import type { DecisionResult, EngineInput, HarvestPlan, MissingInput } from './types.js';
import { NotImplementedError } from './errors.js';
import { projectProduction } from './production.js';
import { computeCosting } from './costing.js';
import { computeFeedLiability } from './feed.js';
import { planHarvest } from './harvest.js';

export * from './types.js';
export { NotImplementedError, isNotImplemented } from './errors.js';
export { Money } from './money.js';
export { SEED_BREED_CURVE, pointForDay, cumulativeFeedG, feedGByPhase } from './breed-curve.js';
export { dayNumberFor, addDays, daysBetween } from './day-number.js';
export { projectProduction } from './production.js';
export { computeCosting } from './costing.js';
export { computeFeedLiability } from './feed.js';
export {
  SEED_BULK_BANDS,
  SEED_DRESSING_YIELD_PCT,
  DEFAULT_CALIBRATION_TRAILING_DAYS_MIN,
  bandForDressedG,
  calibrateMortalityRate,
  dailyMortalityRateBp,
  preharvestUpliftBp,
  planHarvest
} from './harvest.js';
export { projectCashCalendar, cashFlowsMissingInputs } from './cash.js';
export {
  SEED_OVERHEADS,
  overheadBreakdown,
  overheadCostCents,
  overheadLineCents,
  validateOverheadModel
} from './overheads.js';

/**
 * The only public entry point to the engine.
 *
 * U2 lands production (M1) and costing (M2), U3 feed liability (M3) and U4 the
 * harvest optimiser (M4). The allocation optimiser is not built, and is exposed
 * as a getter that throws `NotImplementedError` when read.
 *
 * That is deliberate and load-bearing, not a placeholder: the golden step holds
 * a fixture only when reading the value it asks for throws that exact type. A
 * fixture targeting `decision.feed` therefore stays held, while fixtures
 * targeting production and costing now assert for real. When U3 replaces the
 * getter with a value, its fixtures start gating on the same run, with no list
 * of excuses to remember to update.
 */
export function computeDecision(input: EngineInput): DecisionResult {
  const missing = missingInputsFor(input);
  if (missing.length > 0) {
    return { kind: 'missing_input', missing };
  }

  const production = projectProduction(input);
  const costing = computeCosting(input, production);
  const feed = computeFeedLiability(input, production);

  // Memoised so repeated reads return the same object rather than recomputing.
  // The engine is pure, so a second call would give an equal plan — but not an
  // identical one, and a consumer is entitled to expect `d.harvest === d.harvest`.
  let harvestPlan: HarvestPlan | undefined;

  return {
    kind: 'ok',
    decision: {
      production,
      costing,
      feed,
      /**
       * Lazy, like `allocation` and for the same blast-radius reason. M4 built
       * this eagerly, so a breed curve that never reaches `slaughter_target_g`
       * threw out of `computeDecision` and took production, costing and feed
       * down with it — three sound results lost to a fourth that could not be
       * built. A fixture targeting `decision.production` now survives an
       * unbuildable harvest, which is the whole point of the getter pattern
       * described above.
       */
      get harvest(): HarvestPlan {
        harvestPlan ??= planHarvest(input, production);
        return harvestPlan;
      },
      get allocation(): never {
        throw new NotImplementedError('allocation optimiser (M5)', 'U5');
      }
    }
  };
}

/**
 * Invariant 5: what the engine refuses to guess.
 *
 * A bulk sale cannot be priced without the abattoir fee and the run to the
 * abattoir, and neither has been supplied (OQ-2). We say which is missing
 * rather than substituting a plausible number — a blank the client can fill is
 * always better than a confident wrong figure he cannot audit.
 */
function missingInputsFor(input: EngineInput): MissingInput[] {
  const missing: MissingInput[] = [];

  /**
   * The gate price is needed by every batch, bulk sales or not — the harvest
   * plan's gate window and hold cost both read it. It is checked BEFORE the
   * bulk early-return for that reason: the original structure returned early
   * for a gate-only batch, so this could never have fired even if it had been
   * written.
   *
   * `'gate_price'` has been a declared `MissingInputKey` since U1 and was
   * emitted nowhere; `planHarvest` priced a null gate price at `0n` instead,
   * valuing a bird at nothing. This is the refusal that slot was for.
   */
  const basis = input.parameters.gate_pricing_basis;
  const gateRate =
    basis === 'PER_KG'
      ? input.parameters.gate_price_cents_per_kg
      : input.parameters.gate_price_cents_per_bird;
  if (gateRate === null) {
    missing.push({
      key: 'gate_price',
      why: `Client has not provided a ${basis} gate price`
    });
  }

  const sellsBulk = input.sales.some((sale) => sale.channel === 'BULK');
  if (!sellsBulk) return missing;

  if (
    input.parameters.delivery_mode === 'ABATTOIR' &&
    input.parameters.abattoir_fee_cents === null
  ) {
    missing.push({
      key: 'abattoir_fee',
      why: 'Client has not provided the abattoir fee per bird (OQ-2)'
    });
  }
  if (input.parameters.transport_cents_per_bird === null) {
    missing.push({
      key: 'transport_cents_per_bird',
      why: 'Client has not provided transport cost per bird (OQ-2)'
    });
  }
  return missing;
}
