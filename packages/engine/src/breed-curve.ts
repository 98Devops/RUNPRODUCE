import seed from '../../../context/breed_curve.json';
import { Money } from './money.js';
import type { BreedCurve, BreedCurvePoint, DayNumber, Grams, Phase, PhasePricing } from './types.js';

const PHASE_NAMES: readonly Phase[] = ['STARTER', 'GROWER', 'FINISHER'];

function isPhase(value: string): value is Phase {
  return (PHASE_NAMES as readonly string[]).includes(value);
}

/**
 * The seed file is external input (code-standards.md), so it is validated
 * structurally at module load rather than trusted. Validation is hand-rolled:
 * the engine carries zero runtime dependencies, so Zod is not available here.
 * A malformed seed throws at import time — loudly, not as a wrong number later.
 */
function requireGrams(value: number, label: string): Grams {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`breed_curve.json: ${label} must be a non-negative integer, got ${value}`);
  }
  return value as Grams;
}

const phases: PhasePricing[] = PHASE_NAMES.map((phase) => {
  const entry = seed.phases[phase];
  const [first, last] = entry.days;
  if (first === undefined || last === undefined) {
    throw new Error(`breed_curve.json: phase ${phase} has no day range`);
  }
  if (first > last) {
    throw new Error(`breed_curve.json: phase ${phase} has an inverted day range ${first}-${last}`);
  }
  return {
    phase,
    first_day: first as DayNumber,
    last_day: last as DayNumber,
    price_per_kg_cents: Money.fromDollars(entry.price_per_kg)
  };
});

const points: BreedCurvePoint[] = seed.curve.map((row, index) => {
  if (!isPhase(row.phase)) {
    throw new Error(`breed_curve.json: day ${row.day} has unknown phase ${row.phase}`);
  }
  if (row.day !== index + 1) {
    throw new Error(
      `breed_curve.json: curve must be contiguous from day 1; found day ${row.day} at position ${index + 1}`
    );
  }
  const phase = phases.find((p) => row.day >= p.first_day && row.day <= p.last_day);
  if (phase === undefined) {
    throw new Error(`breed_curve.json: day ${row.day} falls outside every phase day range`);
  }
  if (phase.phase !== row.phase) {
    throw new Error(
      `breed_curve.json: day ${row.day} is labelled ${row.phase} but falls in ${phase.phase}'s day range`
    );
  }
  return {
    day_number: row.day as DayNumber,
    weight_g: requireGrams(row.weight_g, `day ${row.day} weight_g`),
    feed_g: requireGrams(row.feed_g, `day ${row.day} feed_g`),
    phase: row.phase
  };
});

if (points.length === 0) {
  throw new Error('breed_curve.json: curve is empty');
}

export const SEED_BREED_CURVE: BreedCurve = {
  source: seed.source,
  points,
  phases
};

export function pointForDay(curve: BreedCurve, day: number): BreedCurvePoint {
  const point = curve.points.find((p) => p.day_number === day);
  if (point === undefined) {
    throw new Error(`Breed curve has no point for day ${day}`);
  }
  return point;
}

export function cumulativeFeedG(curve: BreedCurve, throughDay: number): number {
  pointForDay(curve, throughDay);
  return curve.points
    .filter((p) => p.day_number <= throughDay)
    .reduce((total, p) => total + p.feed_g, 0);
}

export function feedGByPhase(curve: BreedCurve, throughDay: number): Record<Phase, number> {
  pointForDay(curve, throughDay);
  const totals: Record<Phase, number> = { STARTER: 0, GROWER: 0, FINISHER: 0 };
  for (const p of curve.points) {
    if (p.day_number <= throughDay) {
      totals[p.phase] += p.feed_g;
    }
  }
  return totals;
}
