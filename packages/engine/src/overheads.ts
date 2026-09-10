import type {
  Cents,
  OverheadCharge,
  OverheadKey,
  OverheadLine,
  OverheadModel
} from './types.js';

/**
 * Production overheads, taken from the client's own Final Report for the
 * 3,000-bird batch placed 2026-02-06 — the same batch golden fixtures 1 to 5
 * and 12 are drawn from.
 *
 *   Vaccine                $42      Electricity & heating   $140
 *   Labour                 $640     Other / transport       $400
 *                                   ----------------------------
 *                                   $1,222.00
 *
 * That is 11.0% on top of core credit (chicks $3,000 + feed $8,079.81 =
 * $11,079.81) and 9.9% of his total booked batch cost of $12,301.81. Every
 * figure here is `confidence: 'measured'` because every figure is his, read
 * out of his own spreadsheet. Nothing in this file is estimated, and nothing
 * in it waits on a client answer.
 *
 * Two things that ARE still open, and are not resolved by inventing a number:
 *
 *   1. `transport_other` is the Final Report's "Other/Transport" line for a
 *      batch sold at the gate. It is NOT the run to the abattoir — that is
 *      `Parameters.transport_cents_per_bird`, which stays null until OQ-2 is
 *      answered. The brief says "Do not double-count costs", so the two must
 *      never both be charged for the same bird's journey. See OQ-16.
 *   2. The PER_BATCH lines were measured at 3,000 birds. Whether labour and
 *      electricity are genuinely flat at 30,000 birds is a client question,
 *      not something to model a scaling law for. See OQ-15.
 */
export const SEED_OVERHEADS: OverheadModel = {
  lines: [
    {
      key: 'vaccine',
      label: 'Vaccine',
      // The brief lists medication under VARIABLE costs: it follows the bird.
      basis: 'PER_BIRD',
      amount_cents: 4200n as Cents,
      measured_at_flock_size: 3000,
      confidence: 'measured',
      source: 'Final Report, 3,000-bird batch placed 2026-02-06'
    },
    {
      key: 'electricity_heating',
      label: 'Electricity and heating',
      // The brief lists electricity under FIXED/OVERHEAD costs.
      basis: 'PER_BATCH',
      amount_cents: 14000n as Cents,
      measured_at_flock_size: 3000,
      confidence: 'measured',
      source: 'Final Report, 3,000-bird batch placed 2026-02-06'
    },
    {
      key: 'labour',
      label: 'Labour',
      // The brief lists labour under FIXED/OVERHEAD costs.
      basis: 'PER_BATCH',
      amount_cents: 64000n as Cents,
      measured_at_flock_size: 3000,
      confidence: 'measured',
      source: 'Final Report, 3,000-bird batch placed 2026-02-06'
    },
    {
      key: 'transport_other',
      label: 'Transport and other',
      // The brief lists transport under VARIABLE costs.
      basis: 'PER_BIRD',
      amount_cents: 40000n as Cents,
      measured_at_flock_size: 3000,
      confidence: 'measured',
      source: 'Final Report, 3,000-bird batch placed 2026-02-06'
    }
  ]
};

/**
 * Structural check on an overhead model. The seed is client data transcribed
 * by hand, and a caller-supplied model comes from an editable settings screen,
 * so neither is trusted. Reports every problem rather than the first, the same
 * way `validateFixture` does.
 */
export function validateOverheadModel(model: OverheadModel): string[] {
  const problems: string[] = [];
  const seen = new Set<OverheadKey>();

  for (const line of model.lines) {
    if (seen.has(line.key)) {
      problems.push(`overheads: duplicate line key ${line.key}`);
      continue;
    }
    seen.add(line.key);

    if (line.amount_cents < 0n) {
      problems.push(`overheads: ${line.key} amount_cents must not be negative`);
    }
    if (
      line.basis === 'PER_BIRD' &&
      (!Number.isInteger(line.measured_at_flock_size) || line.measured_at_flock_size <= 0)
    ) {
      problems.push(
        `overheads: ${line.key} is PER_BIRD so measured_at_flock_size must be a positive integer`
      );
    }
  }

  return problems;
}

function requireFlockSize(flock_size: number): void {
  if (!Number.isInteger(flock_size)) {
    throw new Error(`overheads: flock_size ${flock_size} must be an integer`);
  }
  if (flock_size < 0) {
    throw new Error(`overheads: flock_size ${flock_size} must not be negative`);
  }
}

/**
 * What one line costs against an actual flock.
 *
 * A PER_BIRD line is `amount x flock / measured_flock`, in `bigint` so there is
 * no float in a money path. That division is exact at the scale the figure was
 * measured at, and at any multiple of it; elsewhere it rounds **up**, because a
 * cost rounded down flatters a break-even figure and a break-even figure that
 * flatters is the one failure mode this engine must not have. The bias is at
 * most one cent per line.
 */
export function overheadLineCents(line: OverheadLine, flock_size: number): Cents {
  requireFlockSize(flock_size);
  if (line.basis === 'PER_BATCH') return line.amount_cents;

  const reference = BigInt(line.measured_at_flock_size);
  if (reference <= 0n) {
    throw new Error(
      `overheads: ${line.key} is PER_BIRD but was measured at a flock of ${line.measured_at_flock_size}`
    );
  }
  const product = line.amount_cents * BigInt(flock_size);
  const whole = product / reference;
  return ((product % reference === 0n ? whole : whole + 1n) as Cents);
}

/** Each line charged against the flock, carrying its label and confidence for the UI. */
export function overheadBreakdown(
  model: OverheadModel,
  flock_size: number
): readonly OverheadCharge[] {
  return model.lines.map((line) => ({
    key: line.key,
    label: line.label,
    basis: line.basis,
    cents: overheadLineCents(line, flock_size),
    confidence: line.confidence
  }));
}

/** Total production overhead for a flock of this size. */
export function overheadCostCents(model: OverheadModel, flock_size: number): Cents {
  requireFlockSize(flock_size);
  let total = 0n;
  for (const line of model.lines) {
    total += overheadLineCents(line, flock_size);
  }
  return total as Cents;
}

/**
 * The seed is validated at import, not trusted — the same treatment
 * `breed-curve.ts` gives `breed_curve.json`, and for the same reason: a
 * transcription slip in client data should throw loudly at load rather than
 * surface later as a wrong figure on a break-even screen.
 */
const seedProblems = validateOverheadModel(SEED_OVERHEADS);
if (seedProblems.length > 0) {
  throw new Error(`SEED_OVERHEADS is invalid: ${seedProblems.join('; ')}`);
}
