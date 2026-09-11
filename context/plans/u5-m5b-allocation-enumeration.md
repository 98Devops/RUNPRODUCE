# U5 · M5b Allocation Enumeration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` (recommended) or
> `superpowers:executing-plans` to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enumerate size × date candidates for the next placement, score each
against one cash calendar projection, and return the winner for each of the
three modes plus `place_nothing` — refusing, with a typed `missing_input`, any
candidate whose score would need a bulk net nobody has supplied.

**Architecture:** A new `packages/engine/src/allocation.ts`. Each candidate is
turned into a **synthetic `EngineInput`** describing that hypothetical batch,
projected exactly once through `projectCashCalendar`, and ranked by three
integer scalars. The running batch's obligations ride along as a new
`carriedFlows` argument rather than being folded into the opening balance,
because the reserve-floor filter depends on the day-by-day trough and a lump at
day 1 would misstate it.

**Tech Stack:** TypeScript, vitest, zero runtime dependencies. Pure engine —
no I/O, no `Date.now()`, no `Math.random()`.

**Spec:** [`context/plans/u5-allocation-optimiser.md`](u5-allocation-optimiser.md)
— complete, approved, and unchanged by this plan. Read it first; this plan
argues from it and does not restate its decisions.

---

## Global Constraints

- **Invariant 1.** No I/O, no `Date.now()`, no `Math.random()`. `asOf` is
  always an explicit parameter.
- **Invariant 2.** Money is `bigint` cents. Weights are integer grams. No
  float touches a money or ranking path.
- **Invariant 5.** Never invent a number the client has not given us. A value
  that is unknown produces a typed `MissingInput`, never a default.
- **Invariant 16 / AD-31.** No candidate is **generated** earlier than
  `harvest_completion + 14`. Not a penalty, not a preference, not tradeable.
- **AD-35.** Three modes. Maximum Growth means leveraged rollover.
- **AD-40.** Dates run from the floor forward to **floor + 30**, stepped daily.
- **AD-41.** `placement_step_birds`, default **100**, `confidence: 'assumed'`
  (OQ-18). Size 0 is reported as `place_nothing`, never as a zero-bird batch.
- **AD-43.** Three integer scalars; the reserve floor **filters, never scores**;
  each candidate is scored over its **own** completion horizon,
  `placement + 41 + terms_days`.
- **AD-44.** Tie-break: earliest date, then smaller size. Stated and tested,
  and the tie itself is reported.
- **AD-45.** One cash projection per candidate, shared by all three modes.
  `enumerateCandidates()` is its own exported function.
- **CONTEXT.md** governs every identifier. `day_number`, never `day`. Money
  columns end `_cents`.

---

## What the real signature changes

The spec was written on 2026-09-10, **before M5a existed**, so it scored
candidates against a `projectCashCalendar` it had to imagine. The real one is:

```ts
export function projectCashCalendar(
  input: EngineInput,
  throughDay: number,
  openingCents: Cents,
  feed: FeedLiability
): CashCalendar
```

Five consequences, each of which a task below exists to handle. **None of them
reverses a spec decision**; they are mechanics the spec left to the plan.

**1. It consumes a whole `EngineInput`, not a candidate.** There is no
candidate type it accepts. Every candidate must therefore be rendered as a
synthetic `EngineInput` describing that hypothetical batch — Task 4.

**2. `openingCents` is the balance at the START of day 1, and day 1 is the
candidate's own placement date.** Candidates are placed in the future, so this
is not the client's current balance; it is the projected balance on the
candidate's placement date. It has to be chained off the running batch — Task 3.

**3. `EngineInput.batch` is SINGULAR, and this is the real gap.** AD-41
requires every candidate to be scored against the full cash calendar
*"including any already-running second batch's obligations"*. A synthetic input
holds one batch, so the running batch's feed draws and receipts cannot ride
along inside it. Folding them into `openingCents` as a lump is wrong — it
collapses their timing, and the reserve-floor filter reads the day-by-day
trough, not the endpoint. `projectCashCalendar` therefore gains a
`carriedFlows` parameter — Task 1.

**4. `throughDay` has no default, deliberately (AD-47),** and counts from the
candidate's placement: `buildDays` runs `day = 1..throughDay` with
`date = placement + (day - 1)`. AD-43's own-completion horizon is therefore
`41 + parameters.feed_terms_days`, passed explicitly — Task 4.

**5. `projectCashCalendar` throws on a flow dated before placement day 1.**
That is not an obstacle to the chaining in Task 3, it is what makes it correct:
anything the running batch settles before the candidate is placed *belongs* in
`openingCents`, and the throw is what stops it being double-booked.

**One more, from the M4 review fix wave (2026-09-11):** `missingInputsFor` now
emits `'gate_price'` when the active pricing basis has a null price. Every
synthetic input must carry a gate price or the whole decision returns
`missing_input` — Task 4 asserts this explicitly.

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/engine/src/allocation.ts` | **Create.** Enumeration, per-candidate projection, the three scalars, the floor filter, tie-break, `place_nothing`. |
| `packages/engine/src/cash.ts` | **Modify.** Add the `carriedFlows` parameter (Task 1). Nothing else. |
| `packages/engine/src/types.ts` | **Modify.** `Candidate`, `ScoredCandidate`, `ModeWinner`, `PlaceNothing`, `AllocationResult`; `Decision.allocation` stops being `unknown`; `Parameters.placement_step_birds`. |
| `packages/engine/src/index.ts` | **Modify.** Replace the `allocation` getter's `NotImplementedError` with the real call; export the new functions. |
| `packages/engine/tests/allocation.test.ts` | **Create.** Unit tests for every task. |
| `packages/engine/tests/cash.test.ts` | **Modify.** Task 1's `carriedFlows` tests. |

`allocation.ts` is its own module for the reason `cash.ts` is (AD-46): it has a
single responsibility and folding it into a neighbour makes both harder to hold
in context.

---

## Task 1: `carriedFlows` — let a candidate's calendar see the running batch

**Files:**
- Modify: `packages/engine/src/cash.ts` — `projectCashCalendar` signature and
  the flow assembly immediately before `buildDays` is called.
- Modify: `packages/engine/src/types.ts` — no new type; `CashFlow` already fits.
- Test: `packages/engine/tests/cash.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `projectCashCalendar(input, throughDay, openingCents, feed,
  carriedFlows?: readonly CashFlow[]): CashCalendar`. Optional and defaulting
  to `[]`, so every existing caller and all 23 existing `cash.test.ts` tests
  keep compiling and passing unchanged.

- [ ] **Step 1: Write the failing test**

```ts
it('books carried flows from another batch alongside its own', () => {
  const carried: readonly CashFlow[] = [
    {
      kind: 'FEED_DRAW_PAYMENT',
      date: addDays(PLACEMENT, 5),
      amount_cents: -50_000n as Cents,
      description: 'running batch draw, due inside this candidate window'
    }
  ];

  const withCarried = projectCashCalendar(baseInput(), 10, 0n as Cents, feedOf(baseInput()), carried);
  const without = projectCashCalendar(baseInput(), 10, 0n as Cents, feedOf(baseInput()));

  expect(withCarried.closing_cents).toBe(without.closing_cents - 50_000n);
  expect(withCarried.days[5]?.flows.some((f) => f.description.includes('running batch'))).toBe(true);
});

it('still throws when a carried flow predates the candidate placement', () => {
  const carried: readonly CashFlow[] = [
    {
      kind: 'GATE_RECEIPT',
      date: addDays(PLACEMENT, -1),
      amount_cents: 10_000n as Cents,
      description: 'settled before this batch was placed'
    }
  ];

  expect(() => projectCashCalendar(baseInput(), 10, 0n as Cents, feedOf(baseInput()), carried)).toThrow(
    /belongs in openingCents/
  );
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd packages/engine && npx vitest run tests/cash.test.ts`
Expected: FAIL — `projectCashCalendar` takes 4 arguments, the 5th is ignored,
so `withCarried.closing_cents` equals `without.closing_cents` and the first
test's subtraction is off by 50,000. The second test fails because nothing
throws.

- [ ] **Step 3: Implement**

```ts
export function projectCashCalendar(
  input: EngineInput,
  throughDay: number,
  openingCents: Cents,
  feed: FeedLiability,
  /**
   * Dated flows belonging to a DIFFERENT batch that is still running when this
   * one is placed — its feed draws falling due, its receipts landing.
   *
   * A parameter rather than something folded into `openingCents`, because
   * AD-43's reserve-floor filter reads the day-by-day trough and a lump at day
   * 1 would misstate it: a draw due on day 25 that dips the balance below the
   * floor is exactly the fact the filter exists to catch. `EngineInput.batch`
   * is singular, so there is no way to express a second batch inside `input`.
   *
   * Flows dated before this batch's placement still throw. That is deliberate:
   * anything the other batch settles before this one is placed belongs in
   * `openingCents`, and the throw is what stops it being counted twice.
   */
  carriedFlows: readonly CashFlow[] = []
): CashCalendar {
```

Then, at the end of flow assembly and immediately before the `buildDays` call,
add:

```ts
  flows.push(...carriedFlows);
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `cd packages/engine && npx vitest run tests/cash.test.ts`
Expected: PASS, and all 23 pre-existing `cash.test.ts` tests still pass —
`carriedFlows` defaults to `[]`, so nothing else moves.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/cash.ts packages/engine/tests/cash.test.ts
git commit -m "feat(engine): projectCashCalendar accepts another batch's carried flows"
```

---

## Task 2: `enumerateCandidates()` — the size × date grid

**Files:**
- Create: `packages/engine/src/allocation.ts`
- Modify: `packages/engine/src/types.ts`
- Test: `packages/engine/tests/allocation.test.ts`

**Interfaces:**
- Consumes: Task 1's signature is not needed yet.
- Produces:
  ```ts
  export interface Candidate {
    readonly placement_date: IsoDate;
    readonly chick_count: number;
  }
  export function enumerateCandidates(
    input: EngineInput,
    harvestCompletionDate: IsoDate,
    maxChickCount: number
  ): readonly Candidate[];
  export const DEFAULT_PLACEMENT_STEP_BIRDS = 100;
  ```
  `Parameters` gains `readonly placement_step_birds?: number;`.

- [ ] **Step 1: Write the failing test**

```ts
describe('enumerateCandidates', () => {
  it('never generates a date earlier than harvest completion + 14', () => {
    const candidates = enumerateCandidates(baseInput(), '2026-03-20' as IsoDate, 300);
    const earliest = candidates.reduce((a, c) => (c.placement_date < a ? c.placement_date : a), '9999-12-31');

    // Invariant 16. Not a preference — nothing below the floor exists at all.
    expect(earliest).toBe('2026-04-03');
  });

  it('runs the date range to the floor + 30 and no further', () => {
    const candidates = enumerateCandidates(baseInput(), '2026-03-20' as IsoDate, 300);
    const latest = candidates.reduce((a, c) => (c.placement_date > a ? c.placement_date : a), '0000-01-01');

    expect(latest).toBe('2026-05-03');
    expect(new Set(candidates.map((c) => c.placement_date)).size).toBe(31);
  });

  it('steps size by placement_step_birds and never emits a zero-bird batch', () => {
    const candidates = enumerateCandidates(baseInput(), '2026-03-20' as IsoDate, 300);
    const sizes = [...new Set(candidates.map((c) => c.chick_count))].sort((a, b) => a - b);

    // AD-41: size 0 is place_nothing's job, never a candidate.
    expect(sizes).toEqual([100, 200, 300]);
  });

  it('honours an explicit step rather than a literal', () => {
    const candidates = enumerateCandidates(
      baseInput({ placement_step_birds: 150 }),
      '2026-03-20' as IsoDate,
      300
    );
    expect([...new Set(candidates.map((c) => c.chick_count))].sort((a, b) => a - b)).toEqual([150, 300]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd packages/engine && npx vitest run tests/allocation.test.ts`
Expected: FAIL — `Cannot find module '../src/allocation.js'`.

- [ ] **Step 3: Implement**

```ts
import { addDays } from './day-number.js';
import type { Candidate, EngineInput, IsoDate } from './types.js';

/**
 * The bird count the enumeration steps by — the hatchery's order unit, so a
 * recommendation is orderable. 100 is the conventional day-old-chick box and
 * divides both 3,000 and 30,000 exactly. It is NOT a client figure: OQ-18 asks
 * Daniel what his hatchery actually invoices in, and anything this determines
 * carries `confidence: 'assumed'` until he answers.
 */
export const DEFAULT_PLACEMENT_STEP_BIRDS = 100;

/** Invariant 16 / AD-31. Harvest completion, not first sale. Never tradeable. */
const INTER_BATCH_GAP_DAYS = 14;

/** AD-40. Past floor + 30 no further bulk receivable is unlocked by waiting. */
const DATE_RANGE_DAYS = 30;

export function enumerateCandidates(
  input: EngineInput,
  harvestCompletionDate: IsoDate,
  maxChickCount: number
): readonly Candidate[] {
  const step = input.parameters.placement_step_birds ?? DEFAULT_PLACEMENT_STEP_BIRDS;
  if (step <= 0) throw new Error(`placement_step_birds must be positive, got ${step}`);

  const floor = addDays(harvestCompletionDate, INTER_BATCH_GAP_DAYS);
  const candidates: Candidate[] = [];

  for (let offset = 0; offset <= DATE_RANGE_DAYS; offset += 1) {
    const placement_date = addDays(floor, offset);
    // Sizes start at one step, never zero: a zero-bird batch would push $780 of
    // PER_BATCH overhead through the standard fields as though a batch existed.
    // That outcome is place_nothing's, and it is reported separately (AD-41).
    for (let chick_count = step; chick_count <= maxChickCount; chick_count += step) {
      candidates.push({ placement_date, chick_count });
    }
  }

  return candidates;
}
```

Add to `types.ts`:

```ts
export interface Candidate {
  readonly placement_date: IsoDate;
  readonly chick_count: number;
}
```

and inside `Parameters`:

```ts
  /**
   * The bird count the allocation enumeration steps by. Omitted means
   * `DEFAULT_PLACEMENT_STEP_BIRDS` — an assumed 100, pending OQ-18.
   */
  readonly placement_step_birds?: number;
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `cd packages/engine && npx vitest run tests/allocation.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/allocation.ts packages/engine/src/types.ts packages/engine/tests/allocation.test.ts
git commit -m "feat(engine): enumerate placement candidates from the 14-day floor"
```

---

## Task 3: Chain the opening balance to the candidate's placement date

**Files:**
- Modify: `packages/engine/src/allocation.ts`
- Test: `packages/engine/tests/allocation.test.ts`

**Interfaces:**
- Consumes: `projectCashCalendar(input, throughDay, openingCents, feed, carriedFlows?)` from Task 1.
- Produces:
  ```ts
  export interface RunningBatchHandoff {
    readonly opening_cents: Cents;
    readonly carried_flows: readonly CashFlow[];
  }
  export function handoffAtPlacement(
    input: EngineInput,
    feed: FeedLiability,
    currentOpeningCents: Cents,
    placementDate: IsoDate
  ): RunningBatchHandoff;
  ```

This is the function that answers consequence 2 and consequence 3 together:
the running batch's calendar is projected once, everything it settles **before**
the candidate's placement collapses into an opening balance, and everything it
settles **on or after** is handed over as dated flows.

- [ ] **Step 1: Write the failing test**

```ts
describe('handoffAtPlacement', () => {
  it('collapses everything before the placement date into the opening balance', () => {
    const running = baseInput();
    const handoff = handoffAtPlacement(running, feedOf(running), 0n as Cents, '2026-04-03' as IsoDate);
    const full = projectCashCalendar(running, 90, 0n as Cents, feedOf(running));
    const dayBefore = full.days.find((d) => d.date === '2026-04-02');

    expect(handoff.opening_cents).toBe(dayBefore?.closing_cents);
  });

  it('hands over the flows dated on or after the placement date, and only those', () => {
    const running = baseInput();
    const handoff = handoffAtPlacement(running, feedOf(running), 0n as Cents, '2026-04-03' as IsoDate);

    expect(handoff.carried_flows.length).toBeGreaterThan(0);
    for (const flow of handoff.carried_flows) {
      expect(flow.date >= '2026-04-03').toBe(true);
    }
  });

  it('double-counts nothing: opening plus carried equals the full projection', () => {
    const running = baseInput();
    const full = projectCashCalendar(running, 90, 0n as Cents, feedOf(running));
    const handoff = handoffAtPlacement(running, feedOf(running), 0n as Cents, '2026-04-03' as IsoDate);

    const carriedSum = handoff.carried_flows.reduce((sum, f) => sum + f.amount_cents, 0n);
    // Everything the running batch does, split across the handoff, still adds
    // up to what it did undivided. This is the test that catches a flow landing
    // on both sides of the split.
    expect(handoff.opening_cents + carriedSum).toBe(full.closing_cents);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd packages/engine && npx vitest run tests/allocation.test.ts`
Expected: FAIL — `handoffAtPlacement is not a function`.

- [ ] **Step 3: Implement**

```ts
/**
 * Split the running batch's cash position at a candidate's placement date.
 *
 * `projectCashCalendar` re-books the full chick cost and overhead lump on its
 * own day 1, so the candidate's `openingCents` cannot be the client's current
 * bank balance — it has to be the RUNNING batch's projected closing balance on
 * the day before the candidate is placed. Everything after that date stays
 * dated, because AD-43's reserve-floor filter reads the trough rather than the
 * endpoint.
 *
 * The horizon is the running batch's own completion, for the AD-36 reason
 * AD-43 gives: a fixed window would give candidates at different dates
 * different amounts of the running batch inside it.
 */
export function handoffAtPlacement(
  input: EngineInput,
  feed: FeedLiability,
  currentOpeningCents: Cents,
  placementDate: IsoDate
): RunningBatchHandoff {
  const horizon = LAST_CURVE_DAY + input.parameters.feed_terms_days;
  const calendar = projectCashCalendar(input, horizon, currentOpeningCents, feed);

  const dayBefore = addDays(placementDate, -1);
  let opening_cents = currentOpeningCents;
  const carried_flows: CashFlow[] = [];

  for (const day of calendar.days) {
    if (day.date <= dayBefore) {
      opening_cents = day.closing_cents;
      continue;
    }
    carried_flows.push(...day.flows);
  }

  return { opening_cents, carried_flows };
}
```

`LAST_CURVE_DAY` is `41`; read it from the curve rather than hardcoding:

```ts
const curve = input.curve ?? SEED_BREED_CURVE;
const LAST_CURVE_DAY = curve.points[curve.points.length - 1]!.day_number;
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `cd packages/engine && npx vitest run tests/allocation.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/allocation.ts packages/engine/tests/allocation.test.ts
git commit -m "feat(engine): chain a candidate's opening balance off the running batch"
```

---

## Task 4: One synthetic `EngineInput` and one projection per candidate

**Files:**
- Modify: `packages/engine/src/allocation.ts`
- Test: `packages/engine/tests/allocation.test.ts`

**Interfaces:**
- Consumes: `Candidate` (Task 2), `RunningBatchHandoff` (Task 3).
- Produces:
  ```ts
  export function candidateInput(input: EngineInput, candidate: Candidate): EngineInput;
  export function projectCandidate(
    input: EngineInput,
    candidate: Candidate,
    handoff: RunningBatchHandoff
  ): CashCalendar;
  ```

- [ ] **Step 1: Write the failing test**

```ts
describe('candidateInput', () => {
  it('describes the candidate batch, not the running one', () => {
    const c: Candidate = { placement_date: '2026-04-03' as IsoDate, chick_count: 2500 };
    const synthetic = candidateInput(baseInput(), c);

    expect(synthetic.batch.placement_date).toBe('2026-04-03');
    expect(synthetic.batch.chick_count).toBe(2500);
    // A candidate has no history: records, draws and sales are the running
    // batch's and must not be inherited, or its mortality would be replayed.
    expect(synthetic.records).toEqual([]);
    expect(synthetic.draws).toEqual([]);
    expect(synthetic.sales).toEqual([]);
  });

  it('carries a gate price, so the decision does not refuse on gate_price', () => {
    const c: Candidate = { placement_date: '2026-04-03' as IsoDate, chick_count: 2500 };
    // The M4 review fix wave made missingInputsFor emit 'gate_price' when the
    // active basis has a null price. A synthetic input that dropped parameters
    // would refuse to compute for a reason that has nothing to do with M5b.
    expect(missingInputsFor(candidateInput(baseInput(), c)).map((m) => m.key)).not.toContain('gate_price');
  });

  it('sets asOf to the placement date, so no lookahead is claimed', () => {
    const c: Candidate = { placement_date: '2026-04-03' as IsoDate, chick_count: 2500 };
    expect(candidateInput(baseInput(), c).asOf).toBe('2026-04-03');
  });
});

describe('projectCandidate', () => {
  it('scores over the candidate\'s own completion horizon, not a fixed window', () => {
    const c: Candidate = { placement_date: '2026-04-03' as IsoDate, chick_count: 2500 };
    const handoff = handoffAtPlacement(baseInput(), feedOf(baseInput()), 0n as Cents, c.placement_date);

    // AD-43: placement + 41 + terms_days. 41 + 30 = 71.
    expect(projectCandidate(baseInput(), c, handoff).through_day).toBe(71);
  });

  it('gives a later candidate the same number of its own days as an earlier one', () => {
    const early: Candidate = { placement_date: '2026-04-03' as IsoDate, chick_count: 2500 };
    const late: Candidate = { placement_date: '2026-05-03' as IsoDate, chick_count: 2500 };
    const h1 = handoffAtPlacement(baseInput(), feedOf(baseInput()), 0n as Cents, early.placement_date);
    const h2 = handoffAtPlacement(baseInput(), feedOf(baseInput()), 0n as Cents, late.placement_date);

    // The AD-36 error this guards: a fixed 90-day window from asOf would give
    // the later candidate 30 fewer of its OWN days, and Build Reserve would
    // prefer early placement for a window-truncation artefact.
    expect(projectCandidate(baseInput(), late, h2).days.length).toBe(
      projectCandidate(baseInput(), early, h1).days.length
    );
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd packages/engine && npx vitest run tests/allocation.test.ts`
Expected: FAIL — `candidateInput is not a function`.

- [ ] **Step 3: Implement**

```ts
/**
 * A candidate rendered as an `EngineInput`, because that is the only thing
 * `projectCashCalendar` consumes — there is no candidate type it accepts.
 *
 * Records, draws and sales are emptied deliberately. They belong to the
 * RUNNING batch; inheriting them would replay its mortality and re-book its
 * feed against a batch that has not been placed. The running batch reaches the
 * projection through `handoff.carried_flows` instead, which is where its
 * obligations actually belong.
 *
 * `asOf` is the placement date: a candidate has no history to be `asOf` after,
 * and invariant 7 forbids reading past it anyway.
 */
export function candidateInput(input: EngineInput, candidate: Candidate): EngineInput {
  return {
    asOf: candidate.placement_date,
    batch: {
      placement_date: candidate.placement_date,
      chick_count: candidate.chick_count,
      // A candidate is what we would ORDER. Extra chicks are the hatchery's
      // gift and are not orderable, so a candidate never assumes any (KB-1 is
      // about counting the ones that arrive, not forecasting them).
      extra_chick_count: 0,
      chick_price_cents: input.batch.chick_price_cents
    },
    parameters: input.parameters,
    ...(input.curve === undefined ? {} : { curve: input.curve }),
    records: [],
    draws: [],
    sales: []
  };
}

export function projectCandidate(
  input: EngineInput,
  candidate: Candidate,
  handoff: RunningBatchHandoff
): CashCalendar {
  const synthetic = candidateInput(input, candidate);
  const curve = synthetic.curve ?? SEED_BREED_CURVE;
  const lastCurveDay = curve.points[curve.points.length - 1]!.day_number;

  // AD-43's own-completion horizon, passed explicitly because AD-47 gave
  // throughDay no default precisely so this choice cannot be inherited wrong.
  const throughDay = lastCurveDay + synthetic.parameters.feed_terms_days;

  const feed = computeFeedLiability(synthetic, projectProduction(synthetic));
  return projectCashCalendar(synthetic, throughDay, handoff.opening_cents, feed, handoff.carried_flows);
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `cd packages/engine && npx vitest run tests/allocation.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/allocation.ts packages/engine/tests/allocation.test.ts
git commit -m "feat(engine): project each candidate once, over its own completion horizon"
```

---

## Task 5: The three scalars and the filtering floor

**Files:**
- Modify: `packages/engine/src/allocation.ts`, `packages/engine/src/types.ts`
- Test: `packages/engine/tests/allocation.test.ts`

**Interfaces:**
- Consumes: `projectCandidate` (Task 4).
- Produces:
  ```ts
  export type AllocationMode = 'COVER_FAST' | 'MAXIMUM_GROWTH' | 'BUILD_RESERVE';
  export interface ScoredCandidate {
    readonly candidate: Candidate;
    readonly calendar: CashCalendar;
    readonly cover_fast_days: number | null;
    readonly maximum_growth_birds: number;
    readonly build_reserve_cents: Cents;
    readonly breaches_reserve_floor: boolean;
  }
  export function scoreCandidate(
    input: EngineInput, candidate: Candidate, handoff: RunningBatchHandoff
  ): ScoredCandidate;
  ```

`cover_fast_days` is `null` when receipts never clear core credit inside the
horizon — a real state, not a large number, and it excludes the candidate from
Cover Fast's ranking rather than ranking it last.

- [ ] **Step 1: Write the failing test**

```ts
describe('scoreCandidate', () => {
  it('scores Maximum Growth on placement size, which needs no bulk net', () => {
    const c: Candidate = { placement_date: '2026-04-03' as IsoDate, chick_count: 2500 };
    const handoff = handoffAtPlacement(baseInput(), feedOf(baseInput()), 0n as Cents, c.placement_date);

    expect(scoreCandidate(baseInput(), c, handoff).maximum_growth_birds).toBe(2500);
  });

  it('scores Build Reserve in integer cents, never a float', () => {
    const c: Candidate = { placement_date: '2026-04-03' as IsoDate, chick_count: 2500 };
    const handoff = handoffAtPlacement(baseInput(), feedOf(baseInput()), 0n as Cents, c.placement_date);

    expect(typeof scoreCandidate(baseInput(), c, handoff).build_reserve_cents).toBe('bigint');
  });

  it('reports a floor breach rather than scoring it', () => {
    const c: Candidate = { placement_date: '2026-04-03' as IsoDate, chick_count: 2500 };
    const withFloor = baseInput({ reserve_floor_cents: 10_000_000n as Cents });
    const handoff = handoffAtPlacement(withFloor, feedOf(withFloor), 0n as Cents, c.placement_date);
    const scored = scoreCandidate(withFloor, c, handoff);

    // AD-43. The floor is a filter, so the scalars are unchanged by it and the
    // breach is a separate fact. Folding it into Build Reserve's score would
    // both double-count it and let a high scorer buy past a hard constraint.
    expect(scored.breaches_reserve_floor).toBe(true);
    expect(scored.maximum_growth_birds).toBe(2500);
  });

  it('returns null Cover Fast days when receipts never clear core credit', () => {
    const c: Candidate = { placement_date: '2026-04-03' as IsoDate, chick_count: 2500 };
    const handoff = handoffAtPlacement(baseInput(), feedOf(baseInput()), 0n as Cents, c.placement_date);

    // No sales orders on a synthetic candidate, so nothing ever clears. Null,
    // not Infinity and not a large sentinel: a sentinel sorts, and sorting a
    // "never happened" into a ranking is a confident wrong answer.
    expect(scoreCandidate(baseInput(), c, handoff).cover_fast_days).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd packages/engine && npx vitest run tests/allocation.test.ts`
Expected: FAIL — `scoreCandidate is not a function`.

- [ ] **Step 3: Implement**

```ts
export function scoreCandidate(
  input: EngineInput,
  candidate: Candidate,
  handoff: RunningBatchHandoff
): ScoredCandidate {
  const synthetic = candidateInput(input, candidate);
  const calendar = projectCandidate(input, candidate, handoff);
  const production = projectProduction(synthetic);
  const costing = computeCosting(synthetic, production);

  let cumulativeReceipts = 0n;
  let cover_fast_days: number | null = null;
  for (const day of calendar.days) {
    cumulativeReceipts += day.in_cents;
    if (cover_fast_days === null && cumulativeReceipts >= costing.core_credit_cents) {
      cover_fast_days = day.day_number;
    }
  }

  return {
    candidate,
    calendar,
    cover_fast_days,
    maximum_growth_birds: candidate.chick_count,
    build_reserve_cents: calendar.closing_cents,
    breaches_reserve_floor: calendar.breaches_reserve_floor
  };
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `cd packages/engine && npx vitest run tests/allocation.test.ts`
Expected: PASS, 16 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/allocation.ts packages/engine/src/types.ts packages/engine/tests/allocation.test.ts
git commit -m "feat(engine): three integer scalars, the reserve floor filtering not scoring"
```

---

## Task 6: The stated tie-break, and reporting the tie

**Files:**
- Modify: `packages/engine/src/allocation.ts`, `packages/engine/src/types.ts`
- Test: `packages/engine/tests/allocation.test.ts`

**Interfaces:**
- Consumes: `ScoredCandidate` (Task 5).
- Produces:
  ```ts
  export interface ModeWinner {
    readonly mode: AllocationMode;
    readonly winner: ScoredCandidate;
    readonly tied_candidates: number;
    readonly candidates_considered: number;
  }
  export function pickWinner(
    mode: AllocationMode, scored: readonly ScoredCandidate[]
  ): ModeWinner | null;
  ```

- [ ] **Step 1: Write the failing test**

```ts
describe('pickWinner', () => {
  const at = (date: string, birds: number, cents: bigint): ScoredCandidate => ({
    candidate: { placement_date: date as IsoDate, chick_count: birds },
    calendar: {} as CashCalendar,
    cover_fast_days: null,
    maximum_growth_birds: birds,
    build_reserve_cents: cents as Cents,
    breaches_reserve_floor: false
  });

  it('breaks a tie on the earliest date, then the smaller size', () => {
    const scored = [at('2026-04-05', 300, 0n), at('2026-04-03', 300, 0n), at('2026-04-03', 200, 0n)];
    const won = pickWinner('BUILD_RESERVE', scored);

    // AD-44. Stated and tested, so the answer does not depend on loop order —
    // which no test pins down and which changes silently on a refactor.
    expect(won?.winner.candidate.placement_date).toBe('2026-04-03');
    expect(won?.winner.candidate.chick_count).toBe(200);
  });

  it('reports how many candidates tied, because an insensitive choice is news', () => {
    const scored = [at('2026-04-03', 200, 0n), at('2026-04-04', 300, 0n), at('2026-04-05', 100, 0n)];
    expect(pickWinner('BUILD_RESERVE', scored)?.tied_candidates).toBe(3);
  });

  it('excludes a floor-breaching candidate from the ranking entirely', () => {
    const breaching = { ...at('2026-04-03', 300, 999_999n), breaches_reserve_floor: true };
    const clean = at('2026-04-04', 100, 1n);
    expect(pickWinner('BUILD_RESERVE', [breaching, clean])?.winner.candidate.chick_count).toBe(100);
  });

  it('returns null when every candidate breaches the floor', () => {
    const breaching = { ...at('2026-04-03', 300, 999_999n), breaches_reserve_floor: true };
    // A real and reportable answer, not a failure to find one.
    expect(pickWinner('BUILD_RESERVE', [breaching])).toBeNull();
  });

  it('drops null Cover Fast scorers rather than ranking them last', () => {
    const never = at('2026-04-03', 300, 0n);
    const clears = { ...at('2026-04-10', 100, 0n), cover_fast_days: 55 };
    expect(pickWinner('COVER_FAST', [never, clears])?.winner.candidate.chick_count).toBe(100);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd packages/engine && npx vitest run tests/allocation.test.ts`
Expected: FAIL — `pickWinner is not a function`.

- [ ] **Step 3: Implement**

```ts
export function pickWinner(
  mode: AllocationMode,
  scored: readonly ScoredCandidate[]
): ModeWinner | null {
  // AD-43: the floor filters. A breaching candidate is not ranked lower, it is
  // not ranked. If that empties the field, "nothing is affordable" is the
  // honest answer and the caller reports it as one.
  const eligible = scored.filter(
    (s) => !s.breaches_reserve_floor && (mode !== 'COVER_FAST' || s.cover_fast_days !== null)
  );
  if (eligible.length === 0) return null;

  const better = (a: ScoredCandidate, b: ScoredCandidate): number => {
    if (mode === 'COVER_FAST') return (a.cover_fast_days ?? 0) - (b.cover_fast_days ?? 0);
    if (mode === 'MAXIMUM_GROWTH') return b.maximum_growth_birds - a.maximum_growth_birds;
    return b.build_reserve_cents > a.build_reserve_cents ? 1 : b.build_reserve_cents < a.build_reserve_cents ? -1 : 0;
  };

  const ranked = [...eligible].sort((a, b) => {
    const byScore = better(a, b);
    if (byScore !== 0) return byScore;
    // AD-44: earliest date, because the floor already handles biosecurity and
    // idle days earn nothing; then smaller size, because at an equal score it
    // risks less capital.
    if (a.candidate.placement_date !== b.candidate.placement_date) {
      return a.candidate.placement_date < b.candidate.placement_date ? -1 : 1;
    }
    return a.candidate.chick_count - b.candidate.chick_count;
  });

  const winner = ranked[0]!;
  const tied_candidates = ranked.filter((s) => better(s, winner) === 0).length;

  return { mode, winner, tied_candidates, candidates_considered: scored.length };
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `cd packages/engine && npx vitest run tests/allocation.test.ts`
Expected: PASS, 21 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/allocation.ts packages/engine/src/types.ts packages/engine/tests/allocation.test.ts
git commit -m "feat(engine): deterministic tie-break, with the tie itself reported"
```

---

## Task 7: `place_nothing` as its own outcome

**Files:**
- Modify: `packages/engine/src/allocation.ts`, `packages/engine/src/types.ts`
- Test: `packages/engine/tests/allocation.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface PlaceNothing {
    readonly overhead_avoided_cents: Cents;
    readonly overhead_still_incurred_cents: Cents;
    readonly closing_cents: Cents;
  }
  export function placeNothing(input: EngineInput, handoff: RunningBatchHandoff): PlaceNothing;
  ```

- [ ] **Step 1: Write the failing test**

```ts
describe('placeNothing', () => {
  it('avoids the PER_BATCH overhead and no more', () => {
    const handoff = handoffAtPlacement(baseInput(), feedOf(baseInput()), 0n as Cents, '2026-04-03' as IsoDate);
    const nothing = placeNothing(baseInput(), handoff);

    // AD-26 / AD-41: labour $640 + electricity $140 = $780 is what NOT placing
    // avoids. PER_BIRD lines scale to zero birds on their own and are not
    // "avoided" — counting them here would double the saving.
    expect(nothing.overhead_avoided_cents).toBe(78_000n);
  });

  it('is not a zero-bird batch flowing through the standard fields', () => {
    const handoff = handoffAtPlacement(baseInput(), feedOf(baseInput()), 0n as Cents, '2026-04-03' as IsoDate);
    const nothing = placeNothing(baseInput(), handoff);

    // It carries the overhead arithmetic that justifies it, and no candidate.
    expect('candidate' in nothing).toBe(false);
    expect('maximum_growth_birds' in nothing).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd packages/engine && npx vitest run tests/allocation.test.ts`
Expected: FAIL — `placeNothing is not a function`.

- [ ] **Step 3: Implement**

```ts
/**
 * The outcome where the best candidate is to place no next batch at all.
 *
 * A real answer with its own overhead justification (AD-41), never a zero-bird
 * batch through the standard fields: that would put $0 of revenue and the full
 * PER_BATCH overhead into a projection as though a batch existed.
 */
export function placeNothing(input: EngineInput, handoff: RunningBatchHandoff): PlaceNothing {
  const overheads = input.parameters.overheads ?? SEED_OVERHEADS;
  // Only PER_BATCH lines are avoided by not placing. PER_BIRD lines scale to
  // zero on their own, so counting them as "avoided" would double the saving.
  const perBatch = overheadBreakdown(overheads, 0).filter((line) => line.basis === 'PER_BATCH');
  const overhead_avoided_cents = perBatch.reduce((sum, line) => sum + line.cents, 0n) as Cents;

  const carriedSum = handoff.carried_flows.reduce((sum, f) => sum + f.amount_cents, 0n);

  return {
    overhead_avoided_cents,
    overhead_still_incurred_cents: 0n as Cents,
    closing_cents: (handoff.opening_cents + carriedSum) as Cents
  };
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `cd packages/engine && npx vitest run tests/allocation.test.ts`
Expected: PASS, 23 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/allocation.ts packages/engine/src/types.ts packages/engine/tests/allocation.test.ts
git commit -m "feat(engine): place_nothing as its own outcome, with its overhead arithmetic"
```

---

## Task 8: `computeAllocation` — and the two-blocked-one-working refusal

**Files:**
- Modify: `packages/engine/src/allocation.ts`, `packages/engine/src/types.ts`
- Test: `packages/engine/tests/allocation.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface AllocationResult {
    readonly cover_fast: ModeWinner | MissingInput[] | null;
    readonly maximum_growth: ModeWinner | null;
    readonly build_reserve: ModeWinner | MissingInput[] | null;
    readonly place_nothing: PlaceNothing;
    readonly candidates_considered: number;
  }
  export function computeAllocation(
    input: EngineInput, feed: FeedLiability, harvest: HarvestPlan, openingCents: Cents
  ): AllocationResult;
  ```

- [ ] **Step 1: Write the failing test**

```ts
describe('computeAllocation — the two-blocked-one-working asymmetry', () => {
  const bulkInput = () =>
    baseInput({}, [
      { channel: 'BULK', order_date: '2026-03-10' as IsoDate, bird_count: 500,
        avg_live_weight_g: 1800 as Grams, pricing_basis: 'PER_BIRD',
        price_cents_per_bird: 390n as Cents, price_cents_per_kg: null, terms_days: 30 }
    ]);

  it('refuses Cover Fast and Build Reserve, naming OQ-2 and OQ-16', () => {
    const result = computeAllocation(bulkInput(), feedOf(bulkInput()), harvestOf(bulkInput()), 0n as Cents);
    const keys = (result.cover_fast as MissingInput[]).map((m) => m.key);

    expect(keys).toContain('transport_cents_per_bird');
    expect(keys).toContain('bulk_price');
    expect(Array.isArray(result.build_reserve)).toBe(true);
  });

  it('still answers Maximum Growth, whose scalar needs no bulk net', () => {
    const result = computeAllocation(bulkInput(), feedOf(bulkInput()), harvestOf(bulkInput()), 0n as Cents);

    // Two of three modes blocked while the third answers is correct and
    // expected, not a partial failure. It is invariant 5 working.
    expect(Array.isArray(result.maximum_growth)).toBe(false);
    expect((result.maximum_growth as ModeWinner).winner.maximum_growth_birds).toBeGreaterThan(0);
  });

  it('says in the output itself that the split is expected', () => {
    const result = computeAllocation(bulkInput(), feedOf(bulkInput()), harvestOf(bulkInput()), 0n as Cents);
    const why = (result.cover_fast as MissingInput[]).map((m) => m.why).join(' ');

    // So anyone reading a test run or a demo finds the explanation in the
    // output rather than having to find the spec.
    expect(why).toMatch(/Maximum Growth/);
    expect(why).toMatch(/expected/i);
  });

  it('answers all three modes for a gate-only batch', () => {
    const result = computeAllocation(baseInput(), feedOf(baseInput()), harvestOf(baseInput()), 0n as Cents);
    expect(Array.isArray(result.cover_fast)).toBe(false);
    expect(Array.isArray(result.build_reserve)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd packages/engine && npx vitest run tests/allocation.test.ts`
Expected: FAIL — `computeAllocation is not a function`.

- [ ] **Step 3: Implement**

```ts
export function computeAllocation(
  input: EngineInput,
  feed: FeedLiability,
  harvest: HarvestPlan,
  openingCents: Cents
): AllocationResult {
  // Harvest COMPLETION, not first sale (invariant 16). The gate window's last
  // day is the day the last bird goes.
  const harvestCompletionDate = addDays(input.batch.placement_date, harvest.gate_window.last_day - 1);

  // Max size is what gate capacity can clear across the harvest window — the
  // binding constraint on batch size per CONTEXT.md. Not a hardcoded cap.
  const windowDays = harvest.gate_window.last_day - harvest.gate_window.first_day + 1;
  const maxChickCount = input.parameters.gate_capacity_per_day * windowDays;

  const candidates = enumerateCandidates(input, harvestCompletionDate, maxChickCount);
  const blocked = cashFlowsMissingInputs(input);

  const scored: ScoredCandidate[] = [];
  for (const candidate of candidates) {
    const handoff = handoffAtPlacement(input, feed, openingCents, candidate.placement_date);
    if (blocked.length === 0) scored.push(scoreCandidate(input, candidate, handoff));
    else
      scored.push({
        candidate,
        calendar: {} as CashCalendar,
        cover_fast_days: null,
        maximum_growth_birds: candidate.chick_count,
        build_reserve_cents: 0n as Cents,
        breaches_reserve_floor: false
      });
  }

  const asymmetry =
    ' Two of three modes returning missing_input while Maximum Growth returns a real ' +
    'number is EXPECTED, not a regression: its scalar is placement size, which needs no ' +
    'bulk net. See u5-allocation-optimiser.md.';
  const refusal = blocked.map((m) => ({ ...m, why: m.why + asymmetry }));

  const handoffAtFloor = handoffAtPlacement(
    input,
    feed,
    openingCents,
    candidates[0]?.placement_date ?? input.batch.placement_date
  );

  return {
    cover_fast: blocked.length > 0 ? refusal : pickWinner('COVER_FAST', scored),
    maximum_growth: pickWinner('MAXIMUM_GROWTH', scored),
    build_reserve: blocked.length > 0 ? refusal : pickWinner('BUILD_RESERVE', scored),
    place_nothing: placeNothing(input, handoffAtFloor),
    candidates_considered: candidates.length
  };
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `cd packages/engine && npx vitest run tests/allocation.test.ts`
Expected: PASS, 27 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/allocation.ts packages/engine/src/types.ts packages/engine/tests/allocation.test.ts
git commit -m "feat(engine): computeAllocation, with the blocked/working mode split explained in the output"
```

---

## Task 9: Wire `decision.allocation` and retire the `NotImplementedError`

**Files:**
- Modify: `packages/engine/src/index.ts`, `packages/engine/src/types.ts`
- Test: `packages/engine/tests/decision.test.ts`

**Interfaces:**
- Consumes: `computeAllocation` (Task 8).
- Produces: `Decision.allocation` becomes `AllocationResult` instead of `unknown`.

- [ ] **Step 1: Write the failing test**

```ts
it('returns an allocation rather than throwing NotImplementedError', () => {
  const result = computeDecision(baseInput());
  if (result.kind !== 'ok') throw new Error('unreachable');

  expect(() => result.decision.allocation).not.toThrow();
  expect((result.decision.allocation as AllocationResult).candidates_considered).toBeGreaterThan(0);
});

it('keeps the allocation lazy, so it cannot take the rest of the decision down', () => {
  // Same blast-radius reasoning as AD-50's harvest getter.
  const result = computeDecision(baseInput({ gate_capacity_per_day: 0 }));
  if (result.kind !== 'ok') throw new Error('unreachable');
  expect(result.decision.production.closing_birds).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd packages/engine && npx vitest run tests/decision.test.ts`
Expected: FAIL — `NotImplementedError: allocation optimiser (M5)`.

- [ ] **Step 3: Implement**

In `index.ts`, replace the throwing getter:

```ts
      get allocation(): AllocationResult {
        allocationResult ??= computeAllocation(
          input,
          feed,
          this.harvest,
          input.parameters.reserve_floor_cents
        );
        return allocationResult;
      }
```

with `let allocationResult: AllocationResult | undefined;` declared beside
`harvestPlan`, and `Decision.allocation` retyped from `unknown` to
`AllocationResult`.

- [ ] **Step 4: Run the full suite**

Run: `cd packages/engine && npx vitest run && cd ../.. && npm run test:golden && npm run lint && npm run typecheck`
Expected: all unit tests pass; the golden suite's held count is **unchanged**
unless an M5 fixture is written — M5b does not write one, so 11 written / 11
passing / 1 held still holds.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/index.ts packages/engine/src/types.ts packages/engine/tests/decision.test.ts
git commit -m "feat(engine): wire decision.allocation to M5b, retiring its NotImplementedError"
```

---

## Self-review against the spec

**Spec coverage.** Every numbered spec decision maps to a task: §1 no Auto mode
(no task builds one — `AllocationResult` has exactly three modes plus
`place_nothing`); §2 `placement_step_birds` → Task 2; §3 `place_nothing` →
Task 7; §4 date enumerated from the floor to floor + 30 → Task 2; §5 one next
placement scored against the whole calendar → Tasks 3, 4 and the `carriedFlows`
gap in Task 1; §6 three scalars, filtering floor, own-completion horizon →
Tasks 4 and 5; §7 tie-break and `tied_candidates` → Task 6; §8 two functions
and one projection per candidate → `enumerateCandidates` exported in Task 2,
one `projectCandidate` call per candidate in Task 5. The two-blocked-one-working
asymmetry → Task 8.

**Known soft spots, stated rather than hidden.**

1. **Task 8 calls `handoffAtPlacement` once per candidate**, each of which
   projects the running batch's full calendar — 31 dates × N sizes projections
   of the same handful of calendars. The handoff depends only on the *date*, so
   it should be memoised per date once Task 8 is green. Left as a Task 8
   refactor step rather than a premature optimisation, but it is 31 projections
   versus up to 8,401 and worth taking.

2. **`maxChickCount` from gate capacity × window days** is this plan's
   inference, not a spec decision. CONTEXT.md calls gate capacity "the binding
   constraint on batch size", and a flat gate window under flat pricing makes
   the window one day wide — so under today's settled $4.25 this caps a
   candidate at `gate_capacity_per_day`. **Raise this with the user before
   Task 8**: if it is wrong, the enumeration's upper bound is wrong, and the
   spec's "271 sizes" figure suggests a far larger cap was imagined.

3. **`place_nothing`'s `closing_cents` ignores the running batch's reserve floor
   breaches**, because it has no calendar of its own. If that matters, it needs
   a real projection with zero flows rather than the arithmetic in Task 7.

**Type consistency.** `Candidate`, `ScoredCandidate`, `ModeWinner`,
`PlaceNothing`, `RunningBatchHandoff` and `AllocationResult` are each defined
once, in the task that introduces them, and used under those exact names
thereafter. `cover_fast_days` is `number | null` everywhere.

---

## Before any of this starts

**M5b remains blocked for its bulk half.** Tasks 1–7 and 9 are buildable today.
Task 8's bulk-refusal path is buildable today *because* it is a refusal — but
nothing in this plan produces a bulk-inclusive **number**, and nothing should
until **OQ-2's transport half** and **OQ-16** both land.

**OQ-22 must be closed by this unit.** `bulk_price_cents_per_bird` is declared
in `Parameters` and read nowhere, while M4 prices bulk off the contract bands.
M5b is where bulk net is finally computed, so M5b is where the precedence
between those two sources gets decided and written down — not left as two live
sources for one price, which is the shape of KB-3.
