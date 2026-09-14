import type { DecisionResult, EngineInput, HarvestPlan } from './types.js';
import { NotImplementedError } from './errors.js';
import { projectProduction } from './production.js';
import { computeCosting } from './costing.js';
import { computeFeedLiability } from './feed.js';
import { planHarvest } from './harvest.js';
import { missingInputsFor } from './refusals.js';

export * from './types.js';
export { NotImplementedError, isNotImplemented } from './errors.js';
export { Money } from './money.js';
export { SEED_BREED_CURVE, pointForDay, cumulativeFeedG, feedGByPhase } from './breed-curve.js';
export { dayNumberFor, addDays, daysBetween } from './day-number.js';
export { projectProduction, salesMissingInputs } from './production.js';
export { computeCosting } from './costing.js';
export {
  SEED_DELIVERY_CENTS_PER_TONNE,
  computeFeedLiability,
  deliveryCents,
  feedDrawsMissingInputs,
  kgDiscrepancy
} from './feed.js';
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
export {
  SEED_ABATTOIR_COST_CENTS_PER_BIRD,
  SEED_ABATTOIR_FEE_CENTS,
  SEED_TRANSPORT_CENTS_PER_BIRD,
  bulkNetCentsPerBird,
  projectCashCalendar
} from './cash.js';
export {
  DEFAULT_PLACEMENT_STEP_BIRDS,
  candidateInput,
  computeAllocation,
  enumerateCandidates,
  handoffAtPlacement,
  pickWinner,
  placeNothing,
  projectCandidate,
  scoreCandidate
} from './allocation.js';
export { missingInputsFor } from './refusals.js';
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
 * U2 lands production (M1) and costing (M2), U3 feed liability (M3), U4 the
 * harvest optimiser (M4) and U5 the cash calendar (M5a) plus the allocation
 * enumeration (M5b).
 *
 * `allocation` is BUILT — `computeAllocation` is exported above and works — but
 * is still exposed as a getter that throws `NotImplementedError`, because
 * calling it needs an opening cash balance and `EngineInput` carries none
 * (OQ-25). `reserve_floor_cents` is NOT that balance: it is the minimum to
 * keep, not the amount held. Wiring the getter is M5b's Task 9 and waits on U6
 * supplying `cash_accounts.opening_balance_cents`.
 *
 * That is deliberate and load-bearing, not a placeholder: the golden step holds
 * a fixture only when reading the value it asks for throws that exact type. A
 * fixture targeting `decision.feed` therefore stays held, while fixtures
 * targeting production and costing now assert for real. When U3 replaces the
 * getter with a value, its fixtures start gating on the same run, with no list
 * of excuses to remember to update.
 */
export function computeDecision(input: EngineInput): DecisionResult {
  // The one refusal list (refusals.ts), shared with the cash calendar and the
  // allocation so the three cannot drift apart again (TD-4 finding 8).
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
      /**
       * Still held, deliberately — and NOT because the optimiser is unbuilt.
       * `computeAllocation` is built, tested and exported from this module. What
       * is missing is its `openingCents` argument: the cash the business holds
       * on the placement date, which `EngineInput` does not carry (OQ-25).
       *
       * Passing `reserve_floor_cents` instead — as M5b's plan sketched — would
       * substitute the minimum to KEEP for the amount HELD, silently, with
       * every downstream figure wrong by the size of the floor. Passing `0n`
       * asserts the client is broke. Both are invented facts, so neither is
       * better than saying so.
       *
       * `NotImplementedError` specifically, not any other throw: the golden
       * step holds a fixture only on this exact type and fails on every other,
       * so a fixture targeting `decision.allocation` stays held rather than
       * turning red for a reason that is not about the fixture.
       */
      get allocation(): never {
        throw new NotImplementedError('allocation wiring (needs an opening cash balance — OQ-25)', 'U6');
      }
    }
  };
}
