import type { DecisionResult, EngineInput } from './types.js';
import { NotImplementedError } from './errors.js';

export * from './types.js';
export { NotImplementedError, isNotImplemented } from './errors.js';
export { Money } from './money.js';
export { SEED_BREED_CURVE, pointForDay, cumulativeFeedG, feedGByPhase } from './breed-curve.js';
export { dayNumberFor } from './day-number.js';
export { projectProduction } from './production.js';
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
 * Stubbed in U1 — the 13 golden fixtures are red by design and are the
 * executable spec for U2 through U5.
 *
 * The throw is typed: `NotImplementedError` is what tells the golden fixture
 * CI step that a fixture is waiting on an unbuilt module rather than failing.
 * Replacing this stub is therefore what puts those fixtures back under the
 * gate — nothing else needs changing.
 */
export function computeDecision(_input: EngineInput): DecisionResult {
  throw new NotImplementedError('computeDecision', 'U2');
}
