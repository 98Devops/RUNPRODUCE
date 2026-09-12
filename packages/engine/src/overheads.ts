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
 *   Labour                 $640
 *                                   ----------------------------
 *                                   $822.00
 *
 * Was $1,222.00 until 2026-09-12, when the client RETIRED the $400
 * "Other/Transport" line — see AD-51 and the removal note below. Every figure
 * here is `confidence: 'measured'` because every figure is his, read out of his
 * own spreadsheet. Nothing in this file is estimated.
 *
 * **The transport gap this file used to describe is closed.** It said transport
 * was charged nowhere; both halves now are. Feed delivery is `delivery_cents`
 * on the draw ($40/tonne, AD-54) and the run to the abattoir is
 * `transport_cents_per_bird` (10c, AD-55). Neither belongs here — they are feed
 * and sales costs respectively, not production overheads, which is why the
 * retired $400 line could not simply be repointed at either.
 *
 * **Each line carries its own `timing`** (AD-56), from the client 2026-09-12:
 * vaccines upfront, labour when the batch is done, electricity as it arises.
 * The amounts are measured; the dates those cadences land on are still ours and
 * still assumed — see OQ-19.
 *
 * **One thing that IS still open, and is not resolved by inventing a number:**
 * the PER_BATCH lines were measured at 3,000 birds. Whether labour and
 * electricity are genuinely flat at 30,000 birds is a client question, not
 * something to model a scaling law for. See OQ-15.
 */
export const SEED_OVERHEADS: OverheadModel = {
  lines: [
    {
      key: 'vaccine',
      label: 'Vaccine',
      // The brief lists medication under VARIABLE costs: it follows the bird.
      basis: 'PER_BIRD',
      // "Vaccines upfront" — the client, 2026-09-12. Day 1, in one payment.
      timing: 'PLACEMENT',
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
      // "We pay as when they arise" — a monthly bill. The measured $140 is what
      // one BATCH cost, so it is SPLIT across the months the batch spans rather
      // than charged again each month (AD-56).
      timing: 'MONTHLY',
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
      // "Labour when the batch is done" — the client, 2026-09-12.
      timing: 'HARVEST_COMPLETE',
      amount_cents: 64000n as Cents,
      measured_at_flock_size: 3000,
      confidence: 'measured',
      source: 'Final Report, 3,000-bird batch placed 2026-02-06'
    },
    /**
     * `transport_other` — the Final Report's $400 — was REMOVED on 2026-09-12.
     *
     * The client retired the line: it is no longer part of his business logic,
     * so charging it would be billing him for a cost he has stopped incurring.
     * He did NOT say what it was composed of, and nothing here should be read
     * as deciding that (OQ-16 is recorded as retired, not answered).
     *
     * TWO CONSEQUENCES, and the second is the uncomfortable one.
     *
     * 1. **A historical discontinuity.** His Final Report totals $12,301.81 of
     *    expenditure INCLUDING this $400, against a net profit of $4,948.19.
     *    Batches costed after this change are not comparable like-for-like with
     *    that one. See AD-51.
     *
     * 2. **Transport is now UNDER-charged, and was already.** He confirmed feed
     *    delivery at $40/tonne on 2026-09-12 (OQ-28), which on this batch's
     *    13,224 kg is $528.96 — and nothing in the engine charges it yet.
     *    Before this change the retired $400 partly offset that, so costs ran
     *    ~$129 light; after it they run ~$529 light. The error direction is
     *    UNDERSTATEMENT, which is the flattering direction this engine is not
     *    allowed to err in, and removing a false line widened it rather than
     *    closing it. That is not a reason to keep false data — it is a reason
     *    OQ-28 is the next overhead work, and nobody should read the improved
     *    margin in the meantime as real.
     */
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
    timing: line.timing,
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
