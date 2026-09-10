# U2 — M1 Production + M2 Costing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `production.ts` (M1 flock projection) and `costing.ts` (M2 cost engine) so golden fixtures 1, 2, 3, 4 and 12 assert real values and pass.

**Architecture:** Two pure modules behind the single `computeDecision()` entry point. M1 projects the flock from placement to `asOf` — flock size, birds alive, cumulative feed, FCR — reading the breed curve for per-bird expectations and this batch's own `records` for actuals. M2 turns M1's quantities into money: chick cost and phase-priced feed cost, in `bigint` cents. `computeDecision()` composes them and returns `{ kind: 'ok', decision }` with `production` and `costing` populated; `feed`, `harvest` and `allocation` stay `null` until U3–U5.

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess`), Vitest, zero runtime dependencies.

**Spec:** `context/ai-workflow-rules.md` (build order, U2 row: "Fixtures 1–4, 12 green"), `context/architecture.md` (invariants), `context/CONTEXT.md` (glossary), `context/progress-tracker.md` (AD-1…AD-25).

## Global Constraints

Copied from the context files. Every task's requirements implicitly include this section.

- **The engine is pure.** No I/O, no database, no `Date.now()`, no `Math.random()`, no environment variables. `asOf` is always an explicit parameter. (CLAUDE.md rule 1, invariant 1.)
- **Zero runtime dependencies** in `packages/engine`. No Zod. JSON compiled into the engine is validated by hand at import.
- **Money is `bigint` cents. Weights are integer grams.** Never a float on money. Convert to display units only at the presentation boundary. (CLAUDE.md rule 2, invariant 2.)
- **When money is split, the split must sum exactly to the original** — use `Money.split()`, largest-remainder, ties break by lowest index. Never `Math.round(total * ratio)`.
- **Never invent a number the client has not given us.** Unknown value ⇒ typed `MissingInput`, never a silent default. (CLAUDE.md rule 3, invariant 5.)
- **Derived values are never stored.** Birds alive, cumulative feed and FCR are computed on read. (Invariant 3.)
- **Feed consumed is based on OPENING birds, not closing birds.** Birds that die during the day still ate that day. The client's spreadsheet gets this wrong — do not copy the bug. (AD-7, invariant 10.)
- **Batch size is never hardcoded.** Every quantity scales from `chick_count + extra_chick_count`. (Invariant 9.)
- **No lookahead.** A computation with `asOf = T` must never read a record dated after `T`. (Invariant 7.)
- **Mortality and culls are entered CUMULATIVELY** and are monotonic; daily deltas are derived. Joint bound: `mortality_cumulative[d] + cull_cumulative[d] <= chick_count + extra_chick_count`. (AD-24, AD-25, invariant 13.)
- **There is no standard mortality curve.** `MortalityModel` is a FALLBACK only. Fallback-derived output carries `confidence: 'assumed'`; calibrated output carries `'calibrated'`. (AD-24, invariant 14, OQ-1.)
- **Every engine output carries provenance** — wrapped as `Explained<T>` with formula, inputs and confidence. (Invariant 6. See Task 6 — this is deliberately deferred to a point where a real answer exists.)
- **Glossary terms are mandatory in identifiers.** `flock_size`, `opening_birds`, `closing_birds`, `cumulative_feed_kg_per_bird`, `fcr`. Never abbreviate: `mortality` not `mort`. A day number is `day_number`, never `day`. (AD-13, `CONTEXT.md`.)
- **Golden fixtures are the contract.** When a fixture fails, the implementation is wrong — not the fixture. A fixture changes only if the client's business logic changes, recorded as an AD.

**Existing API you build on** (do not re-derive):

- `Money` (`money.ts`) — `bigint` cents value object with `split()`.
- `SEED_BREED_CURVE`, `pointForDay(curve, day)`, `cumulativeFeedG(curve, throughDay)`, `feedGByPhase(curve, throughDay)` (`breed-curve.ts`).
- `NotImplementedError`, `isNotImplemented` (`errors.ts`).
- `EngineInput`, `Decision`, `DecisionResult`, `Explained<T>` (`types.ts`).
- `EngineInput.curve` is optional; absent means `SEED_BREED_CURVE` (AD-23). Every fixture omits it.

**The five target fixtures** (all placement `2026-02-06`, chick price `100` cents, `records: []`):

| Fixture | `asOf` | Day | Flock | Asserted path | Value |
|---|---|---|---|---|---|
| 01 | 2026-03-18 | 41 | 3,000 | `decision.costing.feed_cost_cents` | `"807981"` |
| 02 | 2026-03-18 | 41 | 3,000 | `decision.production.total_feed_kg` | `13224` |
| 03 | 2026-03-18 | 41 | 3,000 | `decision.production.fcr` | `1.53` |
| 04 | 2026-03-07 | 30 | 3,000 | `decision.production.cumulative_feed_kg_per_bird` | `2.337` |
| 12 | 2026-03-18 | 41 | 3,100 | `decision.production.flock_size` | `3100` |

All five carry `records: []` and zeroed mortality parameters, so **no U2 fixture exercises mortality at all.** Mortality logic is still written and unit-tested in Task 3, but nothing gates it until U4. Write it correctly anyway — M4 depends on it, and a wrong cumulative/delta reading is invisible until it is expensive.

---

## File Structure

- **Create `packages/engine/src/day-number.ts`** — `dayNumberFor(placement_date, asOf)`. Placement day is day 1. Split out because M1, M3 and M4 all need it, and it is the single easiest thing to get off by one.
- **Create `packages/engine/src/production.ts`** — M1. Flock size, day number, opening/closing birds, cumulative feed, total feed, FCR.
- **Create `packages/engine/src/costing.ts`** — M2. Chick cost and phase-priced feed cost in cents.
- **Create `packages/engine/tests/_fixtures.ts`** — shared `inputAt` / `record` test builders.
- **Modify `packages/engine/src/types.ts`** — replace `Decision.production` / `Decision.costing` `unknown` with real interfaces.
- **Modify `packages/engine/src/index.ts`** — `computeDecision()` composes M1 + M2 instead of throwing.

The golden fixtures already exist and are already wired to the runner. They need no edits — they simply stop being held.

---

### Task 1: Day number arithmetic

**Files:**
- Create: `packages/engine/src/day-number.ts`
- Test: `packages/engine/tests/day-number.test.ts`

**Interfaces:**
- Consumes: `IsoDate` from `types.ts`.
- Produces: `export function dayNumberFor(placement_date: IsoDate, asOf: IsoDate): number` — 1 on placement day, +1 per calendar day, **throws** if `asOf` precedes `placement_date`.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from 'vitest';
import { dayNumberFor } from '../src/day-number.js';
import type { IsoDate } from '../src/types.js';

const iso = (s: string): IsoDate => s as IsoDate;

describe('dayNumberFor', () => {
  it('returns 1 on placement day', () => {
    expect(dayNumberFor(iso('2026-02-06'), iso('2026-02-06'))).toBe(1);
  });

  it('returns 41 for the fixture 1 window', () => {
    expect(dayNumberFor(iso('2026-02-06'), iso('2026-03-18'))).toBe(41);
  });

  it('returns 30 for the fixture 4 window', () => {
    expect(dayNumberFor(iso('2026-02-06'), iso('2026-03-07'))).toBe(30);
  });

  it('crosses a month boundary without drift', () => {
    expect(dayNumberFor(iso('2026-02-06'), iso('2026-03-01'))).toBe(24);
  });

  it('throws when asOf precedes placement', () => {
    expect(() => dayNumberFor(iso('2026-02-06'), iso('2026-02-05'))).toThrow(
      /before placement/i,
    );
  });
});
```

The 41 and 30 values are the fixtures' own windows, counted by hand at U1 task 5 (2026 is not a leap year). Do not adjust them to match output.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace @runproduce/engine -- day-number`
Expected: FAIL — cannot resolve `../src/day-number.js`.

- [ ] **Step 3: Write minimal implementation**

```typescript
import type { IsoDate } from './types.js';

const MS_PER_DAY = 86_400_000;

/** Days since the Unix epoch for a 'YYYY-MM-DD' string. UTC, so DST cannot shift it. */
function epochDay(date: IsoDate): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (match === null) throw new Error(`Not an ISO date: ${date}`);
  const [, y, m, d] = match;
  return Date.UTC(Number(y), Number(m) - 1, Number(d)) / MS_PER_DAY;
}

/**
 * Day number for a batch. Placement day is day 1, per CONTEXT.md.
 * Pure: Date.UTC is arithmetic on its arguments, never a read of the clock.
 */
export function dayNumberFor(placement_date: IsoDate, asOf: IsoDate): number {
  const elapsed = epochDay(asOf) - epochDay(placement_date);
  if (elapsed < 0) {
    throw new Error(`asOf ${asOf} is before placement ${placement_date}`);
  }
  return elapsed + 1;
}
```

`Date.UTC` is a pure function of its arguments and does not read the clock, so invariant 1 holds. If ESLint's `no-restricted-globals` rejects `Date` outright in `src/`, add a narrowly scoped disable on that line with the comment `// Date.UTC is pure arithmetic, not a clock read — invariant 1 intact.` and say so in the commit body.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test --workspace @runproduce/engine -- day-number`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/day-number.ts packages/engine/tests/day-number.test.ts
git commit -m "feat(engine): add dayNumberFor, placement day is day 1"
```

---

### Task 2: Production and costing types — DONE 2026-09-10 (`03feb91`)

> **Landed wider than planned, deliberately.** `CostingResult` also
> carries `overhead_cost_cents`, `overhead_lines` and
> `full_production_cost_cents`, and `Parameters` gained an optional
> `overheads` model — AD-26, from the client's own Final Report figures.
> `src/types.ts` on disk is the current contract. **Do not re-apply the
> code block below over it**; it predates the overhead work and would
> drop three fields. Task 4's step 3 has been updated to match.

**Files:**
- Modify: `packages/engine/src/types.ts` (the `Decision` interface)

**Interfaces:**
- Produces: `ProductionProjection`, `CostingResult`, and a `Decision` whose `production` and `costing` are those types instead of `unknown`.

- [ ] **Step 1: Replace the `Decision` envelope**

Replace the existing `Decision` interface with:

```typescript
export interface ProductionProjection {
  /** chick_count + extra_chick_count. Invariant 9 — nothing is hardcoded off this. */
  readonly flock_size: number;
  readonly day_number: number;
  /** Birds alive at the start of asOf's day. */
  readonly opening_birds: number;
  /** opening_birds minus that day's derived mortality and culls. */
  readonly closing_birds: number;
  /** Per-bird cumulative feed through asOf, in kg. Fixture 4 asserts 2.337 at day 30. */
  readonly cumulative_feed_kg_per_bird: number;
  /** Whole-flock cumulative feed through asOf, in kg. Fixture 2 asserts 13224 at day 41. */
  readonly total_feed_kg: number;
  /** kg feed / kg live weight produced, 2dp. Fixture 3 asserts 1.53 at day 41. */
  readonly fcr: number;
  readonly live_weight_kg: number;
}

export interface CostingResult {
  readonly chick_cost_cents: Cents;
  /** Phase-priced feed cost. Fixture 1 asserts 807981 at day 41, 3000 birds. */
  readonly feed_cost_cents: Cents;
  readonly core_credit_cents: Cents;
}

/** Filled in progressively across U2-U5. U2 lands production and costing. */
export interface Decision {
  readonly production: ProductionProjection;
  readonly costing: CostingResult;
  readonly feed: unknown;
  readonly harvest: unknown;
  readonly allocation: unknown;
}
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS. Nothing constructs a `Decision` yet — `computeDecision()` still throws.

- [ ] **Step 3: Commit**

```bash
git add packages/engine/src/types.ts
git commit -m "feat(engine): type the production and costing halves of Decision"
```

---

### Task 3: M1 production projection

**Files:**
- Create: `packages/engine/src/production.ts`
- Create: `packages/engine/tests/_fixtures.ts`
- Test: `packages/engine/tests/production.test.ts`

**Interfaces:**
- Consumes: `dayNumberFor` (Task 1); `ProductionProjection` (Task 2); `SEED_BREED_CURVE`, `pointForDay`, `cumulativeFeedG` from `breed-curve.js`.
- Produces: `export function projectProduction(input: EngineInput): ProductionProjection`.

**Rules this task encodes, and why:**
- Flock is `chick_count + extra_chick_count` — extra chicks count toward the flock (`CONTEXT.md`, fixture 12).
- Feed is consumed by **opening** birds (AD-7). With `records: []` and mortality zeroed, opening birds equal flock size every day, which is what makes 13,224 kg fall out.
- Mortality and culls come from **cumulative** columns; the day's delta is `cumulative[d] - cumulative[d-1]`, with `cumulative[0] = 0` (AD-24, AD-25). Records after `asOf` are ignored (invariant 7).
- `total_feed_kg` is the sum over days 1..N of `feed_g(day) × opening_birds(day) / 1000`.
- `fcr` is `cumulative_feed_g_per_bird / live_weight_g`, 2dp. At day 41: `4408 / 2875 = 1.5332` → `1.53`. FCR is a ratio of masses, not money — float is correct here. Money never is.

- [ ] **Step 1: Write the shared test builders**

Create `packages/engine/tests/_fixtures.ts`:

```typescript
import type { DailyRecord, EngineInput, Grams, IsoDate } from '../src/types.js';

export const iso = (s: string): IsoDate => s as IsoDate;

export function inputAt(asOf: string, overrides: Partial<EngineInput> = {}): EngineInput {
  return {
    asOf: iso(asOf),
    batch: {
      placement_date: iso('2026-02-06'),
      chick_count: 3000,
      extra_chick_count: 0,
      chick_price_cents: 100n as never,
    },
    parameters: {
      mortality: {
        base_rate_bp_daily: 0 as never,
        preharvest_ramp_start_day: 30 as never,
        preharvest_ramp_rate_bp_daily: 0 as never,
      },
      slaughter_target_g: 1770 as Grams,
      gate_price_cents_per_bird: 430n as never,
      gate_price_cents_per_kg: null,
      gate_pricing_basis: 'PER_BIRD',
      gate_capacity_per_day: 500,
      bulk_price_cents_per_bird: null,
      abattoir_fee_cents: null,
      transport_cents_per_bird: null,
      delivery_mode: 'ABATTOIR',
      feed_terms_days: 30,
      reserve_floor_cents: 0n as never,
    },
    records: [],
    draws: [],
    sales: [],
    ...overrides,
  } as EngineInput;
}

export function withFlock(asOf: string, chick_count: number, extra_chick_count: number): EngineInput {
  return inputAt(asOf, {
    batch: {
      placement_date: iso('2026-02-06'),
      chick_count,
      extra_chick_count,
      chick_price_cents: 100n as never,
    },
  });
}

/** A daily record. mortality and culls are CUMULATIVE totals (AD-24, AD-25). */
export function record(day_number: number, mortality: number, culls: number): DailyRecord {
  return {
    day_number: day_number as never,
    mortality_cumulative: mortality,
    cull_cumulative: culls,
    feed_starter_kg: 0,
    feed_grower_kg: 0,
    feed_finisher_kg: 0,
    avg_weight_g: null,
    weight_sample_size: null,
  };
}
```

- [ ] **Step 2: Write the failing test**

Create `packages/engine/tests/production.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { projectProduction } from '../src/production.js';
import { inputAt, record, withFlock } from './_fixtures.js';

describe('projectProduction', () => {
  it('counts extra chicks toward the flock (fixture 12)', () => {
    expect(projectProduction(withFlock('2026-03-18', 3000, 100)).flock_size).toBe(3100);
  });

  it('gives 13,224 kg total feed at day 41 for 3,000 birds (fixture 2)', () => {
    expect(projectProduction(inputAt('2026-03-18')).total_feed_kg).toBe(13224);
  });

  it('gives 2.337 kg per bird cumulative feed at day 30 (fixture 4)', () => {
    expect(projectProduction(inputAt('2026-03-07')).cumulative_feed_kg_per_bird).toBe(2.337);
  });

  it('gives FCR 1.53 at day 41 (fixture 3)', () => {
    expect(projectProduction(inputAt('2026-03-18')).fcr).toBe(1.53);
  });

  it('derives the daily mortality delta from cumulative entries', () => {
    const result = projectProduction(
      inputAt('2026-02-09', {
        records: [record(1, 0, 0), record(2, 10, 0), record(3, 25, 0), record(4, 30, 0)],
      }),
    );
    // Day 4 opening excludes only removals through day 3: 3000 - 25 = 2975.
    // The day-4 delta is 30 - 25 = 5, so closing is 2970.
    expect(result.opening_birds).toBe(2975);
    expect(result.closing_birds).toBe(2970);
  });

  it('treats culls as cumulative too, alongside mortality', () => {
    const result = projectProduction(
      inputAt('2026-02-08', { records: [record(1, 0, 0), record(2, 10, 4), record(3, 10, 9)] }),
    );
    expect(result.opening_birds).toBe(3000 - 10 - 4);
    expect(result.closing_birds).toBe(3000 - 10 - 9);
  });

  it('ignores records dated after asOf (invariant 7)', () => {
    const result = projectProduction(
      inputAt('2026-02-08', { records: [record(3, 10, 0), record(9, 900, 0)] }),
    );
    expect(result.opening_birds).toBe(3000);
    expect(result.closing_birds).toBe(2990);
  });

  it('throws when cumulative mortality goes backwards', () => {
    expect(() =>
      projectProduction(inputAt('2026-02-09', { records: [record(2, 30, 0), record(3, 10, 0)] })),
    ).toThrow(/monotonic|decrease/i);
  });

  it('throws when removals exceed the flock (joint bound, invariant 13)', () => {
    expect(() =>
      projectProduction(inputAt('2026-02-09', { records: [record(2, 2000, 1500)] })),
    ).toThrow(/exceed|flock/i);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test --workspace @runproduce/engine -- production`
Expected: FAIL — cannot resolve `../src/production.js`.

**Before writing the implementation, verify the three curve-derived expectations by hand against `context/breed_curve.json`** — the same discipline U1 task 5 used. `13,224 kg` is `4,408 g × 3,000 ÷ 1000`. `2.337` is the day-30 cumulative `2,337 g`. `1.53` is `4,408 ÷ 2,875` to 2dp. If any disagrees with the seed, **stop and raise it** rather than fitting code to the number.

- [ ] **Step 4: Write the implementation**

```typescript
import { SEED_BREED_CURVE, cumulativeFeedG, pointForDay } from './breed-curve.js';
import { dayNumberFor } from './day-number.js';
import type { BreedCurve, DailyRecord, EngineInput, ProductionProjection } from './types.js';

interface Removals {
  readonly mortality: number;
  readonly culls: number;
}

/**
 * Cumulative removals as of a day, from this batch's own entered records.
 * Entries are cumulative running totals (AD-24, AD-25); the daily delta is
 * derived. Records after the given day are not read (invariant 7).
 */
function removalsThrough(
  records: readonly DailyRecord[],
  throughDay: number,
  flock_size: number,
): Removals {
  const visible = records
    .filter((r) => r.day_number <= throughDay)
    .slice()
    .sort((a, b) => a.day_number - b.day_number);

  let mortality = 0;
  let culls = 0;
  for (const entry of visible) {
    if (entry.mortality_cumulative < mortality || entry.cull_cumulative < culls) {
      throw new Error(`Cumulative removals must be monotonic; day ${entry.day_number} decreases`);
    }
    if (entry.mortality_cumulative + entry.cull_cumulative > flock_size) {
      throw new Error(`Removals on day ${entry.day_number} exceed the flock of ${flock_size}`);
    }
    mortality = entry.mortality_cumulative;
    culls = entry.cull_cumulative;
  }
  return { mortality, culls };
}

export function projectProduction(input: EngineInput): ProductionProjection {
  const curve: BreedCurve = input.curve ?? SEED_BREED_CURVE;
  const flock_size = input.batch.chick_count + input.batch.extra_chick_count;
  const day_number = dayNumberFor(input.batch.placement_date, input.asOf);

  const through = removalsThrough(input.records, day_number, flock_size);
  const prior = removalsThrough(input.records, day_number - 1, flock_size);

  // Opening birds are alive at the START of the day, so they exclude only
  // removals recorded up to the PREVIOUS day.
  const opening_birds = flock_size - prior.mortality - prior.culls;
  const closing_birds = flock_size - through.mortality - through.culls;

  // Feed is consumed by OPENING birds — birds that die during a day still ate
  // that day (AD-7, invariant 10). The client's spreadsheet gets this wrong.
  let total_feed_g = 0;
  for (let day = 1; day <= day_number; day += 1) {
    const priorForDay = removalsThrough(input.records, day - 1, flock_size);
    const openingThatDay = flock_size - priorForDay.mortality - priorForDay.culls;
    total_feed_g += pointForDay(curve, day).feed_g * openingThatDay;
  }

  const cumulative_feed_g_per_bird = cumulativeFeedG(curve, day_number);
  const live_weight_g = pointForDay(curve, day_number).weight_g;

  return {
    flock_size,
    day_number,
    opening_birds,
    closing_birds,
    cumulative_feed_kg_per_bird: cumulative_feed_g_per_bird / 1000,
    total_feed_kg: total_feed_g / 1000,
    // FCR is a ratio of masses, not money — float is correct here.
    fcr: Math.round((cumulative_feed_g_per_bird / live_weight_g) * 100) / 100,
    live_weight_kg: live_weight_g / 1000,
  };
}
```

`removalsThrough` is called inside the feed loop for clarity over speed; the horizon is 41 days and the record list is at most 41 long, so this is trivially fast. Do not optimise it into something harder to read.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test --workspace @runproduce/engine -- production`
Expected: PASS, 9 tests.

If `total_feed_kg` is not `13224`, **do not adjust the test.** Likely causes in order: `pointForDay` asked for day 0 or day 42 (off by one against "placement is day 1"), or `feed_g` summed via `cumulativeFeedG` as well as per-day. Fix the implementation.

- [ ] **Step 6: Commit**

```bash
git add packages/engine/src/production.ts packages/engine/tests/production.test.ts packages/engine/tests/_fixtures.ts
git commit -m "feat(engine): add M1 production projection with cumulative removals"
```

---

### Task 4: M2 costing

**Files:**
- Create: `packages/engine/src/costing.ts`
- Test: `packages/engine/tests/costing.test.ts`

**Interfaces:**
- Consumes: `ProductionProjection` (Task 2), `projectProduction` (Task 3), `feedGByPhase` from `breed-curve.js`, `inputAt` / `withFlock` from `tests/_fixtures.js`.
- Produces: `export function computeCosting(input: EngineInput, production: ProductionProjection): CostingResult`.

**Overheads (AD-26) are part of this task.** `overheads.ts` already
exists, is unit-tested and is exported — this task only calls it. Add to
`computeCosting`:

```typescript
const overheadModel = input.parameters.overheads ?? SEED_OVERHEADS;
const overhead_lines = overheadBreakdown(overheadModel, production.flock_size);
const overhead_cost_cents = overheadCostCents(overheadModel, production.flock_size);
```

and return `core_credit_cents` as chick + feed **only**, with
`full_production_cost_cents = core_credit_cents + overhead_cost_cents`.
Invariant 15: never blend the two. Tests to add alongside the four below:
overheads total `122200n` on the 3,000-bird batch; `core_credit_cents`
is unchanged by them; `full_production_cost_cents` is their sum;
`overhead_lines` sums to `overhead_cost_cents`; an explicit
`{ lines: [] }` charges nothing while *absent* charges the seed.

**The number this must reproduce**, verified by hand at U1 task 3 and recorded in the tracker:
`383 g × $0.65 + 1,466 g × $0.62 + 2,559 g × $0.60 = $2.693270/bird`, `× 3,000 = $8,079.81` = `807981` cents. Per-phase grams come from `feedGByPhase`; per-phase prices from `curve.phases[].price_per_kg_cents`.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from 'vitest';
import { computeCosting } from '../src/costing.js';
import { projectProduction } from '../src/production.js';
import { inputAt, withFlock } from './_fixtures.js';

describe('computeCosting', () => {
  it('gives 807,981 cents feed cost at day 41 for 3,000 birds (fixture 1)', () => {
    const input = inputAt('2026-03-18');
    expect(computeCosting(input, projectProduction(input)).feed_cost_cents).toBe(807981n);
  });

  it('scales feed cost with the flock, extra chicks included', () => {
    const input = withFlock('2026-03-18', 3000, 100);
    const production = projectProduction(input);
    expect(production.flock_size).toBe(3100);
    expect(computeCosting(input, production).feed_cost_cents).toBeGreaterThan(807981n);
  });

  it('charges chick cost on the whole flock including extras', () => {
    const input = withFlock('2026-03-18', 3000, 100);
    expect(computeCosting(input, projectProduction(input)).chick_cost_cents).toBe(310000n);
  });

  it('core credit is chick cost plus feed cost', () => {
    const input = inputAt('2026-03-18');
    const result = computeCosting(input, projectProduction(input));
    expect(result.core_credit_cents).toBe(result.chick_cost_cents + result.feed_cost_cents);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace @runproduce/engine -- costing`
Expected: FAIL — cannot resolve `../src/costing.js`.

- [ ] **Step 3: Write the implementation**

```typescript
import { SEED_BREED_CURVE, feedGByPhase } from './breed-curve.js';
import type {
  BreedCurve,
  Cents,
  CostingResult,
  EngineInput,
  Phase,
  ProductionProjection,
} from './types.js';

/**
 * Feed cost for the whole flock through the projection's day, priced per phase.
 * Grams and cents are integers throughout; the only division is the final
 * g -> kg, done last so no intermediate is a float. Verified against fixture 1:
 * 383x0.65 + 1466x0.62 + 2559x0.60 = $2.69327/bird x 3000 = 807981 cents.
 */
function feedCostCents(curve: BreedCurve, throughDay: number, flock_size: number): Cents {
  const gramsByPhase = feedGByPhase(curve, throughDay);
  let gramCents = 0n;
  for (const phase of curve.phases) {
    const grams = gramsByPhase[phase.phase as Phase] ?? 0;
    gramCents += BigInt(grams) * BigInt(flock_size) * (phase.price_per_kg_cents as bigint);
  }
  return (gramCents / 1000n) as Cents;
}

export function computeCosting(
  input: EngineInput,
  production: ProductionProjection,
): CostingResult {
  const curve: BreedCurve = input.curve ?? SEED_BREED_CURVE;
  const chick_cost_cents = (BigInt(production.flock_size) *
    (input.batch.chick_price_cents as bigint)) as Cents;
  const feed_cost_cents = feedCostCents(curve, production.day_number, production.flock_size);
  const overheadModel = input.parameters.overheads ?? SEED_OVERHEADS;
  const overhead_cost_cents = overheadCostCents(overheadModel, production.flock_size);
  const core_credit_cents = (chick_cost_cents + feed_cost_cents) as Cents;
  return {
    chick_cost_cents,
    feed_cost_cents,
    core_credit_cents,
    overhead_cost_cents,
    overhead_lines: overheadBreakdown(overheadModel, production.flock_size),
    full_production_cost_cents: (core_credit_cents + overhead_cost_cents) as Cents,
  };
}
```

The `/ 1000n` truncates. Verify against fixture 1 before accepting: the exact product is `807,981.0` cents, so truncation does no work here. **If a later fixture lands on a fraction, do not silently truncate** — raise it. Which way that rounds is a client question, not an implementation detail.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test --workspace @runproduce/engine -- costing`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/costing.ts packages/engine/tests/costing.test.ts
git commit -m "feat(engine): add M2 costing, feed priced per phase in bigint cents"
```

---

### Task 5: Compose in `computeDecision()` and turn the fixtures green

**Files:**
- Modify: `packages/engine/src/index.ts`

**Interfaces:**
- Consumes: `projectProduction` (Task 3), `computeCosting` (Task 4).
- Produces: `computeDecision(input): DecisionResult` returning `{ kind: 'ok', decision }` with `production` and `costing` populated.

- [ ] **Step 1: Record the starting state**

Run: `npm run test:golden --workspace @runproduce/engine`
Expected: 9 held on `computeDecision not implemented — U2`. Note the count; it must fall to 4 by Step 4.

- [ ] **Step 2: Rewrite `computeDecision`**

Keep the existing `export *` / `export {}` lines and add `projectProduction` and `computeCosting` to them. Replace the throwing body with:

```typescript
import { computeCosting } from './costing.js';
import { projectProduction } from './production.js';
import type { DecisionResult, EngineInput } from './types.js';

export function computeDecision(input: EngineInput): DecisionResult {
  const production = projectProduction(input);
  const costing = computeCosting(input, production);
  return {
    kind: 'ok',
    decision: {
      production,
      costing,
      // U3, U4, U5 respectively. Not yet computed, and not faked.
      feed: null,
      harvest: null,
      allocation: null,
    },
  };
}
```

**Do not add a `missing_input` branch in this task.** AD-22 fixes the rule — `missing_input` is raised by what the input *asks for*, not by any null in the parameter block — and fixture 13 exercises it through a BULK sales order that nothing in U2 reads. Fixture 13 stays held until U5. A premature null check here would flip fixtures 1–5 to `missing_input` and break the contract.

- [ ] **Step 3: Run the full suite**

Run: `npm test && npm run test:golden --workspace @runproduce/engine`
Expected: unit suites green; golden step shows **fixtures 1, 2, 3, 4 and 12 passing**, 4 still held (5, 9, 10, 13) on paths U2 does not populate.

If fixture 5, 9 or 10 now *fails* rather than holds, that is the runner reporting that `decision.feed` / `decision.harvest` is `null` where a dotted path expects a value. Check `resolvePath`'s contract from U1 task 4: a missing leaf resolves to `undefined`, traversing into a non-object throws — and `null` is a non-object. If that makes it throw rather than hold, **that is a real finding: raise it.** Do not paper over it by faking a value into `harvest`.

- [ ] **Step 4: Verify the held count fell**

Run: `npm run test:golden --workspace @runproduce/engine`
Expected: held count is 4, down from 9. Confirm by reading the printed list, not by assuming.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/index.ts
git commit -m "feat(engine): compose M1 and M2 in computeDecision, fixtures 1-4 and 12 green"
```

---

### Task 6: Provenance, then context sync

**Files:**
- Modify: `packages/engine/src/production.ts`, `packages/engine/src/costing.ts`
- Modify: `context/progress-tracker.md`

**Interfaces:**
- Produces: no signature change decided in advance. Invariant 6 requires outputs carry `Explained<T>`; this task settles how, at the point where a real answer exists rather than up front.

- [ ] **Step 1: Settle the provenance shape — this is a decision, not a detail**

Invariant 6 says every engine output is wrapped as `Explained<T>` with formula, inputs and confidence. But fixtures assert raw values at paths like `decision.production.fcr`, so wrapping every field moves those paths to `decision.production.fcr.value`.

Two options, and they are not equivalent:

1. **Fixture paths gain `.value`.** Five committed fixture files change. Fixtures are the contract and are protected once committed, so this is a contract change requiring an AD and an explicit note that no expected *value* moved, only its path.
2. **`Explained<T>` lives in a parallel `explain` map** beside the raw fields — `decision.production.explain.fcr`. Paths unchanged, no fixture edits, at the cost of two places to keep in step.

**Stop and raise this with both options and the fixture-diff count in hand.** Do not pick silently. Record the outcome as **AD-26** — first grep `context/progress-tracker.md` for `**AD-` to confirm 26 is still free. Never infer the next AD number from memory or from an earlier chat message; that is how the list drifted twice already.

- [ ] **Step 2: Implement the chosen shape and re-run everything**

Run: `npm test && npm run test:golden --workspace @runproduce/engine && npm run lint && npm run typecheck && npm run build`
Expected: all green; golden held count still 4.

- [ ] **Step 3: Update the tracker**

Add a U2 task log under Session Notes in the same style as U1's: what landed, what was verified before it was written, what was deliberately not done and why. Move U2 from "In Progress" to "Completed", set Current Phase to U3, and record AD-26.

- [ ] **Step 4: Commit**

```bash
git add packages/engine/src context/progress-tracker.md
git commit -m "feat(engine): carry provenance on production and costing outputs"
```

---

## Notes for the executor

- **Fixtures are the contract.** If one disagrees with your implementation, the implementation is wrong. The exception is a fixture whose value was never client data — OQ-9 and OQ-11 document two of those, and both are unwritten. None of U2's five is in that category; all five were verified against `context/breed_curve.json` before being written.
- **Do not write fixtures 6, 7, 8 or 11.** They are blocked on OQ-2, OQ-4, OQ-7 and OQ-8; 7 and 11 additionally need regenerating from the model once OQ-1's calibration lands in U4.
- **`asOf` is the only clock.** If you find yourself wanting the current date, you have misread invariant 1.
- **Before assigning any AD number, grep `context/progress-tracker.md`.**
