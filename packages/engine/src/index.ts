import type { DecisionResult, EngineInput } from './types.js';

export * from './types.js';
export { Money } from './money.js';
export { SEED_BREED_CURVE, pointForDay, cumulativeFeedG, feedGByPhase } from './breed-curve.js';

/**
 * The only public entry point to the engine.
 *
 * Stubbed in U1 — the 13 golden fixtures are red by design and are the
 * executable spec for U2 through U5.
 */
export function computeDecision(_input: EngineInput): DecisionResult {
  throw new Error('computeDecision not implemented — U2');
}
