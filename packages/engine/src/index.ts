import type { DecisionResult, EngineInput, MissingInput } from './types.js';
import { NotImplementedError } from './errors.js';
import { projectProduction } from './production.js';
import { computeCosting } from './costing.js';

export * from './types.js';
export { NotImplementedError, isNotImplemented } from './errors.js';
export { Money } from './money.js';
export { SEED_BREED_CURVE, pointForDay, cumulativeFeedG, feedGByPhase } from './breed-curve.js';
export { dayNumberFor } from './day-number.js';
export { projectProduction } from './production.js';
export { computeCosting } from './costing.js';
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
 * U2 lands production (M1) and costing (M2). Feed liability, the harvest
 * optimiser and the allocation optimiser are not built, and each is exposed as
 * a getter that throws `NotImplementedError` when read.
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

  return {
    kind: 'ok',
    decision: {
      production,
      costing,
      get feed(): never {
        throw new NotImplementedError('feed liability (M3)', 'U3');
      },
      get harvest(): never {
        throw new NotImplementedError('harvest optimiser (M4)', 'U4');
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
