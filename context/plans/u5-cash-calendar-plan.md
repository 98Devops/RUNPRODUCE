# M5a Cash Calendar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the day-by-day cash projection that M5's allocation enumeration scores every candidate against — opening, in, out, closing per day, with the minimum balance, its date, and reserve-floor breach detection.

**Architecture:** A pure function `projectCashCalendar(input, asOf, throughDay)` in `packages/engine/src/cash.ts`, consuming the dated obligations M3 already derives (`DrawLiability.due_date` / `total_cents`), the chick cost M2 already computes, and receipts derived from `EngineInput.sales`. It returns a `CashCalendar` whose days are ordered and whose closing balance on each day is the opening of the next. It is the shared object AD-45 requires: M5b projects it once per candidate and ranks all three modes from it.

**Tech Stack:** TypeScript, `bigint` cents throughout, vitest. Zero runtime dependencies — the engine carries none, so validation is hand-rolled and `Date` is banned (use `addDays` / `daysBetween` from `day-number.ts`).

**Spec:** `context/plans/u5-allocation-optimiser.md` — specifically the scoring rules under "Mechanics, settled in round 2" (AD-43, AD-45). This plan builds the object those rules consume; it does not build the enumeration. That is M5b.

## Global Constraints

Copied verbatim from the spec and the invariants it names. Every task's requirements implicitly include this section.

- **Invariant 1.** `packages/engine` performs no I/O. No `Date.now()`, no `Math.random()`, no env vars. `asOf` is always passed in explicitly.
- **Invariant 2.** Money is `bigint` cents. No floating point arithmetic on money, ever. Where money is split, the split must sum exactly to the original — use `Money.split`'s largest-remainder allocation.
- **Invariant 3.** Derived values are never stored — balances are computed on read.
- **Invariant 5.** The engine never invents an input and never passes an absence off as a measurement. A missing required value produces a typed `MissingInput` naming what is missing.
- **Invariant 7.** A computation `asOf` T never reads a record dated after T. A *due date* falling after `asOf` is kept — a bill already incurred and dated forward is a fact about the past, not a reading of the future (established in `feed.ts`).
- **AD-43.** The reserve floor **filters, never scores.** This module therefore *reports* breaches; it does not rank or exclude. Ranking is M5b's.
- **AD-43.** The 90-day calendar is a **display horizon, not a scoring window.** `throughDay` is a parameter with no default, so no caller can silently inherit 90.
- **AD-45.** One projection per candidate, shared across all three modes. This function must therefore be free of mode-specific logic.
- **Blocked, per the spec:** a `BULK` sales order cannot be turned into a receipt without bulk net (contract price − abattoir fee − transport). `abattoir_fee_cents` and `transport_cents_per_bird` are both `null` pending **OQ-2's transport half** and **OQ-16**. Return `missing_input` naming both. Never fall back to a gate-only figure dressed as complete.
- Money field names end `_cents`; weights end `_g`; a day number is `day_number`, never `day`. Never abbreviate a glossary term.

---

## File Structure

| File | Responsibility |
|---|---|
| Create: `packages/engine/src/cash.ts` | `projectCashCalendar()` and its helpers. Dated money in, dated balances out. Nothing about candidates or modes. |
| Modify: `packages/engine/src/types.ts` | `CashCalendar`, `CashDay`, `CashFlow` types. Placed beside `FeedLiability`, above `Lever`. |
| Modify: `packages/engine/src/index.ts` | Export `projectCashCalendar` and the new types. **Do not** wire it into `computeDecision()` — `decision.allocation` stays a throwing getter until M5b lands, which is what keeps any M5 fixture correctly held (AD-29). |
| Create: `packages/engine/tests/cash.test.ts` | Unit tests for all of the above. |

**Why `cash.ts` and not inside `allocation.ts`:** `architecture.md`'s file map designates `allocation.ts` as "M5 cash + allocation", and this plan deliberately splits it. The cash projection is independently valuable (the project overview lists "Cash calendar" as its own deliverable, separate from "Decision engine"), independently testable, and consumed by M5b ~8,401 times per run. Keeping it in its own file means M5b's file stays about enumeration and ranking. **This is a deviation from the architecture's file map and needs recording as an AD when M5b lands.**

---

## A decision this plan needs, which the spec does not settle

**Overhead timing is undated.** `computeCosting()` returns `overhead_cost_cents` and per-line `overhead_lines`, but no dates — the client's Final Report books overheads per batch, not per day. A cash calendar needs a date for every outflow.

This is a *timing* assumption, not a fabricated value, but it still changes the minimum-balance figure and therefore which candidates breach the reserve floor. **Task 5 charges each overhead line on the placement date and marks the calendar `overhead_timing: 'assumed'`.** A new **OQ-19** asks Daniel when he actually pays labour and electricity — almost certainly monthly, not as a lump at placement, which would materially flatten the early-cycle trough.

Do not let this pass as settled. If the reviewer disagrees with charging at placement, the alternative (spreading each `PER_BATCH` line evenly across the cycle with `Money.split`) is a one-function change confined to Task 5.

---

### Task 1: The types

**Files:**
- Modify: `packages/engine/src/types.ts` (insert above `export interface Lever {`)
- Test: none — types only, exercised by every later task.

**Interfaces:**
- Consumes: `Cents`, `IsoDate`, `Confidence` (already in `types.ts`).
- Produces: `CashFlowKind`, `CashFlow`, `CashDay`, `CashCalendar` — every later task and all of M5b depend on these exact names.

- [ ] **Step 1: Add the types**

```typescript
/**
 * What a dated movement of money is, so the calendar can explain a balance
 * rather than just assert one. Every flow names its source.
 */
export type CashFlowKind =
  | 'CHICK_COST'
  | 'FEED_DRAW_PAYMENT'
  | 'OVERHEAD'
  | 'GATE_RECEIPT'
  | 'BULK_RECEIPT';

export interface CashFlow {
  readonly kind: CashFlowKind;
  readonly date: IsoDate;
  /** Positive for money in, negative for money out. Never an absolute value. */
  readonly amount_cents: Cents;
  readonly description: string;
}

/**
 * One day of the cash projection.
 *
 * `closing_cents` of day N is `opening_cents` of day N+1, always — the
 * calendar is a running balance, not a set of independent daily figures.
 */
export interface CashDay {
  readonly day_number: number;
  readonly date: IsoDate;
  readonly opening_cents: Cents;
  readonly in_cents: Cents;
  readonly out_cents: Cents;
  readonly closing_cents: Cents;
  /** Every flow landing on this day, so a balance can be expanded. */
  readonly flows: readonly CashFlow[];
  /** True when `closing_cents` is below `parameters.reserve_floor_cents`. */
  readonly breaches_reserve_floor: boolean;
}

/**
 * The cash calendar: day-by-day opening / in / out / closing.
 *
 * The reserve floor is REPORTED here and never applied — AD-43 settles that
 * the floor filters candidates rather than scoring them, and filtering is the
 * allocation optimiser's job, not this module's.
 *
 * `through_day` is whatever the caller asked for. There is deliberately no
 * default: AD-43 makes the 90-day calendar a DISPLAY horizon, while each
 * allocation candidate is scored over its own completion horizon
 * (`placement + 41 + terms_days`). A default here would let a caller silently
 * inherit the wrong one, which is the window-mismatch error AD-36 names.
 */
export interface CashCalendar {
  readonly days: readonly CashDay[];
  readonly through_day: number;
  readonly opening_cents: Cents;
  readonly closing_cents: Cents;
  /** The lowest closing balance across the projection. */
  readonly minimum_cents: Cents;
  /** The date `minimum_cents` occurs. The earliest such date if it recurs. */
  readonly minimum_date: IsoDate;
  readonly breaches_reserve_floor: boolean;
  /** The first date the floor is breached, or null if it never is. */
  readonly first_breach_date: IsoDate | null;
  /**
   * 'assumed' while overhead timing rests on charging at placement (OQ-19).
   * Never 'measured' — no overhead payment date has been observed.
   */
  readonly overhead_timing: Confidence;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd packages/engine && npx tsc -p tsconfig.json --noEmit`
Expected: PASS, no output.

- [ ] **Step 3: Commit**

```bash
git add packages/engine/src/types.ts
git commit -m "feat(engine): CashCalendar types for M5a"
```

---

### Task 2: An empty calendar over a horizon

Start with the spine: the right number of days, dated correctly, balances carrying forward. No flows yet.

**Files:**
- Create: `packages/engine/src/cash.ts`
- Create: `packages/engine/tests/cash.test.ts`

**Interfaces:**
- Consumes: `dayNumberFor`, `addDays` from `./day-number.js`; the Task 1 types.
- Produces: `projectCashCalendar(input: EngineInput, throughDay: number, openingCents: Cents): CashCalendar`. **Parameter order matters — M5b calls this ~8,401 times.**

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from 'vitest';
import { projectCashCalendar } from '../src/cash.js';
import type { Cents, EngineInput, Grams, IsoDate, Parameters } from '../src/types.js';

const PLACEMENT = '2026-02-06' as IsoDate;

function parameters(overrides: Partial<Parameters> = {}): Parameters {
  return {
    mortality: {
      base_rate_bp_daily: 15 as never,
      preharvest_ramp_start_day: 30 as never,
      preharvest_ramp_rate_bp_daily: 35 as never
    },
    slaughter_target_g: 1770 as Grams,
    gate_price_cents_per_bird: 425n as Cents,
    gate_price_cents_per_kg: null,
    gate_pricing_basis: 'PER_BIRD',
    gate_capacity_per_day: 750,
    bulk_price_cents_per_bird: 390n as Cents,
    abattoir_fee_cents: null,
    transport_cents_per_bird: null,
    delivery_mode: 'ABATTOIR',
    feed_terms_days: 30,
    reserve_floor_cents: 0n as Cents,
    ...overrides
  };
}

function input(asOf: string, overrides: Partial<EngineInput> = {}): EngineInput {
  return {
    asOf: asOf as IsoDate,
    batch: {
      placement_date: PLACEMENT,
      chick_count: 3000,
      extra_chick_count: 0,
      chick_price_cents: 100n as Cents
    },
    parameters: parameters(),
    records: [],
    draws: [],
    sales: [],
    ...overrides
  };
}

describe('projectCashCalendar — the spine', () => {
  it('covers day 1 through through_day, dated from placement', () => {
    const calendar = projectCashCalendar(input('2026-02-06'), 5, 0n as Cents);

    expect(calendar.days).toHaveLength(5);
    expect(calendar.days[0]?.day_number).toBe(1);
    expect(calendar.days[0]?.date).toBe('2026-02-06');
    expect(calendar.days[4]?.day_number).toBe(5);
    expect(calendar.days[4]?.date).toBe('2026-02-10');
    expect(calendar.through_day).toBe(5);
  });

  it("carries each day's closing into the next day's opening", () => {
    const calendar = projectCashCalendar(input('2026-02-06'), 5, 50000n as Cents);

    expect(calendar.opening_cents).toBe(50000n);
    for (let i = 1; i < calendar.days.length; i += 1) {
      expect(calendar.days[i]?.opening_cents).toBe(calendar.days[i - 1]?.closing_cents);
    }
    expect(calendar.closing_cents).toBe(calendar.days[4]?.closing_cents);
  });

  it('rejects a horizon before placement day 1', () => {
    expect(() => projectCashCalendar(input('2026-02-06'), 0, 0n as Cents)).toThrow(
      /through_day 0 is before placement day 1/
    );
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `cd packages/engine && npx vitest run tests/cash.test.ts`
Expected: FAIL — "Failed to load url ../src/cash.js".

- [ ] **Step 3: Write the minimal implementation**

```typescript
import { addDays } from './day-number.js';
import type { CashCalendar, CashDay, Cents, EngineInput, IsoDate } from './types.js';

/**
 * M5a — the cash calendar.
 *
 * Day-by-day opening / in / out / closing from placement through
 * `throughDay`. Pure arithmetic on dated flows; it holds no opinion about
 * which candidate or strategy is better.
 *
 * `throughDay` has NO DEFAULT on purpose. AD-43 makes the 90-day calendar a
 * display horizon while each allocation candidate is scored over its own
 * completion horizon, and a default here would let a caller silently inherit
 * the wrong window — the mismatch error AD-36 names.
 */
export function projectCashCalendar(
  input: EngineInput,
  throughDay: number,
  openingCents: Cents
): CashCalendar {
  if (throughDay < 1) {
    throw new Error(`through_day ${throughDay} is before placement day 1`);
  }

  const { placement_date } = input.batch;
  const floor = input.parameters.reserve_floor_cents;

  const days: CashDay[] = [];
  let opening = openingCents;

  for (let day = 1; day <= throughDay; day += 1) {
    const date = addDays(placement_date, day - 1);
    const in_cents = 0n as Cents;
    const out_cents = 0n as Cents;
    const closing = (opening + in_cents - out_cents) as Cents;

    days.push({
      day_number: day,
      date,
      opening_cents: opening,
      in_cents,
      out_cents,
      closing_cents: closing,
      flows: [],
      breaches_reserve_floor: closing < floor
    });

    opening = closing;
  }

  return summarise(days, throughDay, openingCents);
}

/** The headline figures, derived from the day series so they cannot disagree. */
function summarise(
  days: readonly CashDay[],
  throughDay: number,
  openingCents: Cents
): CashCalendar {
  const last = days[days.length - 1];
  if (last === undefined) throw new Error('Cash calendar has no days');

  // The EARLIEST day holding the minimum, so a recurring trough reports its
  // first occurrence rather than its last.
  let minimum = days[0] as CashDay;
  for (const day of days) {
    if (day.closing_cents < minimum.closing_cents) minimum = day;
  }

  const breach = days.find((day) => day.breaches_reserve_floor) ?? null;

  return {
    days,
    through_day: throughDay,
    opening_cents: openingCents,
    closing_cents: last.closing_cents,
    minimum_cents: minimum.closing_cents,
    minimum_date: minimum.date,
    breaches_reserve_floor: breach !== null,
    first_breach_date: breach === null ? null : breach.date,
    overhead_timing: 'assumed'
  };
}
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `cd packages/engine && npx vitest run tests/cash.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/cash.ts packages/engine/tests/cash.test.ts
git commit -m "feat(engine): cash calendar spine — dated days, carried balances"
```

---

### Task 3: Chick cost and feed draw payments as dated outflows

**Files:**
- Modify: `packages/engine/src/cash.ts`
- Modify: `packages/engine/tests/cash.test.ts`

**Interfaces:**
- Consumes: `computeFeedLiability(input, production)` from `./feed.js` and `projectProduction(input)` from `./production.js` — the caller passes the already-computed `FeedLiability` so M5b does not recompute it per candidate. Signature becomes `projectCashCalendar(input, throughDay, openingCents, feed: FeedLiability)`.
- Produces: the same `CashCalendar`, now with `CHICK_COST` and `FEED_DRAW_PAYMENT` flows.

- [ ] **Step 1: Write the failing test**

```typescript
import { computeFeedLiability } from '../src/feed.js';
import { projectProduction } from '../src/production.js';

function feedFor(engineInput: EngineInput) {
  return computeFeedLiability(engineInput, projectProduction(engineInput));
}

describe('projectCashCalendar — dated outflows', () => {
  it('charges chick cost on the placement date', () => {
    const engineInput = input('2026-02-06');
    const calendar = projectCashCalendar(engineInput, 5, 0n as Cents, feedFor(engineInput));
    const day1 = calendar.days[0];

    // 3,000 birds x $1.00.
    expect(day1?.out_cents).toBe(300000n);
    expect(day1?.closing_cents).toBe(-300000n);
    expect(day1?.flows.map((f) => f.kind)).toContain('CHICK_COST');
  });

  it('charges a feed draw on its DUE date, not its collection date', () => {
    const engineInput = input('2026-03-10', {
      draws: [
        {
          collection_date: '2026-02-06' as IsoDate,
          phase: 'STARTER',
          bags: 10,
          kg: 500,
          price_per_bag_cents: 3250n as Cents,
          terms_days: 30
        }
      ]
    });
    const calendar = projectCashCalendar(engineInput, 40, 0n as Cents, feedFor(engineInput));

    // Collected day 1, 30-day terms, so it lands 2026-03-08 — day 31.
    const dueDay = calendar.days.find((d) => d.date === '2026-03-08');
    expect(dueDay?.out_cents).toBe(32500n);
    expect(dueDay?.flows.map((f) => f.kind)).toContain('FEED_DRAW_PAYMENT');

    const collectionDay = calendar.days[0];
    expect(collectionDay?.flows.map((f) => f.kind)).not.toContain('FEED_DRAW_PAYMENT');
  });

  it('ignores a draw whose due date falls past the horizon', () => {
    const engineInput = input('2026-03-10', {
      draws: [
        {
          collection_date: '2026-02-06' as IsoDate,
          phase: 'STARTER',
          bags: 10,
          kg: 500,
          price_per_bag_cents: 3250n as Cents,
          terms_days: 30
        }
      ]
    });
    const calendar = projectCashCalendar(engineInput, 10, 0n as Cents, feedFor(engineInput));

    expect(calendar.days.some((d) => d.flows.some((f) => f.kind === 'FEED_DRAW_PAYMENT'))).toBe(
      false
    );
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `cd packages/engine && npx vitest run tests/cash.test.ts`
Expected: FAIL — `out_cents` is `0n`, expected `300000n`.

- [ ] **Step 3: Write the minimal implementation**

Replace the signature and the flow-collection part of `projectCashCalendar`:

```typescript
import type { CashFlow, FeedLiability } from './types.js';

export function projectCashCalendar(
  input: EngineInput,
  throughDay: number,
  openingCents: Cents,
  feed: FeedLiability
): CashCalendar {
  if (throughDay < 1) {
    throw new Error(`through_day ${throughDay} is before placement day 1`);
  }

  const { placement_date, chick_count, extra_chick_count, chick_price_cents } = input.batch;
  const floor = input.parameters.reserve_floor_cents;

  const flows: CashFlow[] = [];

  // Invariant 9: extras count toward the flock, so they are paid for at the
  // same price as the rest — nothing scales off chick_count alone.
  const flock = chick_count + extra_chick_count;
  flows.push({
    kind: 'CHICK_COST',
    date: placement_date,
    amount_cents: -(chick_price_cents * BigInt(flock)) as Cents,
    description: `${flock} chicks at ${chick_price_cents} cents`
  });

  // A draw is paid on its DUE date. The due date is M3's, already derived as
  // collection_date + the DRAW's own terms (which beat parameters).
  for (const draw of feed.draws) {
    flows.push({
      kind: 'FEED_DRAW_PAYMENT',
      date: draw.due_date,
      amount_cents: -draw.total_cents as Cents,
      description: `${draw.bags} bags ${draw.phase} drawn ${draw.collection_date}`
    });
  }

  return buildDays(input, throughDay, openingCents, flows, floor);
}

/** Lays dated flows onto the day series. Flows outside the horizon are dropped. */
function buildDays(
  input: EngineInput,
  throughDay: number,
  openingCents: Cents,
  flows: readonly CashFlow[],
  floor: Cents
): CashCalendar {
  const byDate = new Map<string, CashFlow[]>();
  for (const flow of flows) {
    const existing = byDate.get(flow.date);
    if (existing === undefined) byDate.set(flow.date, [flow]);
    else existing.push(flow);
  }

  const days: CashDay[] = [];
  let opening = openingCents;

  for (let day = 1; day <= throughDay; day += 1) {
    const date = addDays(input.batch.placement_date, day - 1);
    const dayFlows = byDate.get(date) ?? [];

    let in_cents = 0n;
    let out_cents = 0n;
    for (const flow of dayFlows) {
      if (flow.amount_cents >= 0n) in_cents += flow.amount_cents;
      else out_cents += -flow.amount_cents;
    }

    const closing = (opening + in_cents - out_cents) as Cents;

    days.push({
      day_number: day,
      date,
      opening_cents: opening,
      in_cents: in_cents as Cents,
      out_cents: out_cents as Cents,
      closing_cents: closing,
      flows: dayFlows,
      breaches_reserve_floor: closing < floor
    });

    opening = closing;
  }

  return summarise(days, throughDay, openingCents);
}
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `cd packages/engine && npx vitest run tests/cash.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/cash.ts packages/engine/tests/cash.test.ts
git commit -m "feat(engine): chick cost and feed draw payments as dated outflows"
```

---

### Task 4: Gate receipts, and `missing_input` for bulk

This is the task the spec's blocked/buildable split lands in. Gate is computable today; bulk is not.

**Files:**
- Modify: `packages/engine/src/cash.ts`
- Modify: `packages/engine/tests/cash.test.ts`

**Interfaces:**
- Produces: `cashFlowsMissingInputs(input: EngineInput): MissingInput[]` — exported, because M5b calls it to decide whether a candidate is scoreable at all before projecting anything.
- `projectCashCalendar` gains no new parameter. It assumes its caller has already checked `cashFlowsMissingInputs` and **throws** if a `BULK` order is present without bulk net, rather than returning a half-calendar. A calendar missing a receipt is not a calendar with a caveat; it is a wrong balance.

- [ ] **Step 1: Write the failing test**

```typescript
import { cashFlowsMissingInputs } from '../src/cash.js';

const bulkOrder = {
  channel: 'BULK' as const,
  order_date: '2026-03-08' as IsoDate,
  bird_count: 1000,
  avg_live_weight_g: 1843 as Grams,
  pricing_basis: 'PER_BIRD' as const,
  price_cents_per_bird: 390n as Cents,
  price_cents_per_kg: null,
  terms_days: 30
};

const gateOrder = {
  channel: 'GATE' as const,
  order_date: '2026-03-08' as IsoDate,
  bird_count: 500,
  avg_live_weight_g: 1843 as Grams,
  pricing_basis: 'PER_BIRD' as const,
  price_cents_per_bird: 425n as Cents,
  price_cents_per_kg: null,
  terms_days: 0
};

describe('projectCashCalendar — receipts', () => {
  it('books a gate receipt on the order date, same day, for cash', () => {
    const engineInput = input('2026-03-10', { sales: [gateOrder] });
    const calendar = projectCashCalendar(engineInput, 35, 0n as Cents, feedFor(engineInput));
    const saleDay = calendar.days.find((d) => d.date === '2026-03-08');

    // 500 birds x $4.25.
    expect(saleDay?.in_cents).toBe(212500n);
    expect(saleDay?.flows.map((f) => f.kind)).toContain('GATE_RECEIPT');
  });

  it('prices a PER_KG gate order from integer grams', () => {
    const engineInput = input('2026-03-10', {
      sales: [{ ...gateOrder, pricing_basis: 'PER_KG', price_cents_per_bird: null, price_cents_per_kg: 200n as Cents }]
    });
    const calendar = projectCashCalendar(engineInput, 35, 0n as Cents, feedFor(engineInput));
    const saleDay = calendar.days.find((d) => d.date === '2026-03-08');

    // 500 birds x 1.843 kg x $2.00/kg, truncated to the cent.
    expect(saleDay?.in_cents).toBe(184300n);
  });

  /**
   * The spec's blocked half. Bulk net is contract price minus the abattoir fee
   * minus transport, and transport is null pending OQ-2 while OQ-16 gates the
   * double-count question independently.
   */
  it('reports both gaps for a BULK order rather than guessing bulk net', () => {
    const missing = cashFlowsMissingInputs(input('2026-03-10', { sales: [bulkOrder] }));
    const keys = missing.map((m) => m.key);

    expect(keys).toContain('transport_cents_per_bird');
    expect(keys).toContain('abattoir_fee');
    expect(missing.every((m) => /OQ-2|OQ-16/.test(m.why))).toBe(true);
  });

  it('reports nothing missing when there is no bulk order', () => {
    expect(cashFlowsMissingInputs(input('2026-03-10', { sales: [gateOrder] }))).toEqual([]);
  });

  it('throws rather than returning a calendar missing a bulk receipt', () => {
    const engineInput = input('2026-03-10', { sales: [bulkOrder] });
    expect(() => projectCashCalendar(engineInput, 35, 0n as Cents, feedFor(engineInput))).toThrow(
      /bulk net/
    );
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `cd packages/engine && npx vitest run tests/cash.test.ts`
Expected: FAIL — `cashFlowsMissingInputs` is not exported.

- [ ] **Step 3: Write the minimal implementation**

```typescript
import type { MissingInput, SalesOrder } from './types.js';

/**
 * What the calendar cannot compute, and why — checked BEFORE projecting.
 *
 * M5b calls this first: a candidate that cannot be scored must return
 * `missing_input` rather than a number, and discovering that mid-projection
 * would mean throwing away work for every candidate.
 */
export function cashFlowsMissingInputs(input: EngineInput): MissingInput[] {
  const missing: MissingInput[] = [];
  if (!input.sales.some((sale) => sale.channel === 'BULK')) return missing;

  const { abattoir_fee_cents, transport_cents_per_bird, delivery_mode } = input.parameters;

  if (delivery_mode === 'ABATTOIR' && abattoir_fee_cents === null) {
    missing.push({
      key: 'abattoir_fee',
      why:
        'Bulk net needs the abattoir fee per bird (OQ-2). Until it and transport land, ' +
        'Cover Fast and Build Reserve return missing_input for any bulk-inclusive ' +
        'candidate while Maximum Growth still returns a real number — its scalar is ' +
        'placement size, which needs no bulk net. That split is expected, not a bug (AD-43).'
    });
  }
  if (transport_cents_per_bird === null) {
    missing.push({
      key: 'transport_cents_per_bird',
      why:
        'Bulk net needs transport to the abattoir (OQ-2), and OQ-16 gates it ' +
        'independently: the Final Report already books an Other/Transport line for a ' +
        'gate-sold batch, and the brief says do not double-count. An answered OQ-2 does ' +
        'not release OQ-16.'
    });
  }
  return missing;
}

/** Gross receipt for an order. Bulk net is NOT applied here — see the caller. */
function receiptCents(sale: SalesOrder): Cents {
  if (sale.pricing_basis === 'PER_KG') {
    const rate = sale.price_cents_per_kg;
    if (rate === null) {
      throw new Error(`A PER_KG ${sale.channel} order has no price_cents_per_kg`);
    }
    // Integer grams against a per-kg rate, truncating — a receipt must never
    // round up in our favour.
    return ((rate * BigInt(sale.avg_live_weight_g) * BigInt(sale.bird_count)) / 1000n) as Cents;
  }
  const rate = sale.price_cents_per_bird;
  if (rate === null) {
    throw new Error(`A PER_BIRD ${sale.channel} order has no price_cents_per_bird`);
  }
  return (rate * BigInt(sale.bird_count)) as Cents;
}
```

Then, inside `projectCashCalendar` after the draw loop:

```typescript
  const missing = cashFlowsMissingInputs(input);
  if (missing.length > 0) {
    throw new Error(
      `Cannot project cash: bulk net is unavailable — ${missing.map((m) => m.key).join(', ')}. ` +
        'Call cashFlowsMissingInputs() first and return missing_input.'
    );
  }

  for (const sale of input.sales) {
    // A gate sale is cash on the day; a bulk sale is a receivable dated
    // order_date + terms. Both use the order's OWN terms_days.
    flows.push({
      kind: sale.channel === 'GATE' ? 'GATE_RECEIPT' : 'BULK_RECEIPT',
      date: addDays(sale.order_date, sale.terms_days),
      amount_cents: receiptCents(sale),
      description: `${sale.bird_count} birds ${sale.channel}`
    });
  }
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `cd packages/engine && npx vitest run tests/cash.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/cash.ts packages/engine/tests/cash.test.ts
git commit -m "feat(engine): gate receipts; bulk returns missing_input naming OQ-2 and OQ-16"
```

---

### Task 5: Overheads, on the assumed placement date

**Files:**
- Modify: `packages/engine/src/cash.ts`
- Modify: `packages/engine/tests/cash.test.ts`

**Interfaces:**
- Consumes: `overheadBreakdown(overheads, flockSize)` and `SEED_OVERHEADS` from `./overheads.js`.
- Produces: `OVERHEAD` flows, and `overhead_timing: 'assumed'` on the calendar — already in the Task 1 type, now justified.

- [ ] **Step 1: Write the failing test**

```typescript
describe('projectCashCalendar — overheads', () => {
  it('charges every overhead line on the placement date, flagged assumed', () => {
    const engineInput = input('2026-02-06');
    const calendar = projectCashCalendar(engineInput, 5, 0n as Cents, feedFor(engineInput));
    const day1 = calendar.days[0];

    // $3,000 chicks + $1,222 of overheads at his 3,000-bird scale.
    expect(day1?.out_cents).toBe(300000n + 122200n);
    expect(day1?.flows.filter((f) => f.kind === 'OVERHEAD')).toHaveLength(4);
    expect(calendar.overhead_timing).toBe('assumed');
  });

  it('scales PER_BIRD overhead lines with the flock and leaves PER_BATCH alone', () => {
    const engineInput = input('2026-02-06', {
      batch: {
        placement_date: PLACEMENT,
        chick_count: 6000,
        extra_chick_count: 0,
        chick_price_cents: 100n as Cents
      }
    });
    const calendar = projectCashCalendar(engineInput, 5, 0n as Cents, feedFor(engineInput));
    const overheads = calendar.days[0]?.flows.filter((f) => f.kind === 'OVERHEAD') ?? [];
    const total = overheads.reduce((sum, f) => sum - f.amount_cents, 0n);

    // Vaccine $42 and transport $400 double; labour $640 and electricity $140 do not.
    expect(total).toBe(8400n + 80000n + 64000n + 14000n);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `cd packages/engine && npx vitest run tests/cash.test.ts`
Expected: FAIL — `out_cents` is `300000n`, expected `422200n`.

- [ ] **Step 3: Write the minimal implementation**

Add to the imports and, in `projectCashCalendar`, after the chick-cost flow:

```typescript
import { SEED_OVERHEADS, overheadBreakdown } from './overheads.js';

  /**
   * Overhead TIMING is assumed, and this is the only assumption in the module.
   *
   * `computeCosting` gives amounts and no dates — the client books overheads
   * per batch, not per day. Charging them all at placement is the simplest
   * defensible choice and it is almost certainly wrong in shape: labour is
   * likely monthly, which would flatten the early-cycle trough materially.
   * OQ-19 asks him. Until then the calendar says `overhead_timing: 'assumed'`
   * so nobody reads the minimum balance as measured.
   */
  const overheads = input.parameters.overheads ?? SEED_OVERHEADS;
  for (const line of overheadBreakdown(overheads, flock)) {
    flows.push({
      kind: 'OVERHEAD',
      date: placement_date,
      amount_cents: -line.cents as Cents,
      description: `${line.label} (${line.basis}, timing assumed — OQ-19)`
    });
  }
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `cd packages/engine && npx vitest run tests/cash.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/cash.ts packages/engine/tests/cash.test.ts
git commit -m "feat(engine): overheads as dated outflows, timing assumed (OQ-19)"
```

---

### Task 6: The reserve floor, reported and never applied

**Files:**
- Modify: `packages/engine/tests/cash.test.ts` (tests only — Task 2 already implemented the reporting; this task proves it behaves as AD-43 requires)
- Modify: `packages/engine/src/index.ts`

**Interfaces:**
- Produces: `projectCashCalendar`, `cashFlowsMissingInputs` and the cash types exported from `index.ts`. **`computeDecision()` is not touched** — `decision.allocation` must keep throwing `NotImplementedError` until M5b lands, or a future M5 fixture would assert against a half-built module instead of being held (AD-29).

- [ ] **Step 1: Write the failing test**

```typescript
describe('projectCashCalendar — the reserve floor', () => {
  it('reports a breach and its first date without altering any balance', () => {
    const engineInput = input('2026-02-06', {
      parameters: parameters({ reserve_floor_cents: -100000n as Cents })
    });
    const calendar = projectCashCalendar(engineInput, 5, 0n as Cents, feedFor(engineInput));

    expect(calendar.breaches_reserve_floor).toBe(true);
    expect(calendar.first_breach_date).toBe('2026-02-06');
    // The floor REPORTS; it never clamps. AD-43: filtering is M5b's job.
    expect(calendar.days[0]?.closing_cents).toBe(-422200n);
  });

  it('reports no breach when every closing balance clears the floor', () => {
    const engineInput = input('2026-02-06', {
      parameters: parameters({ reserve_floor_cents: -1000000n as Cents })
    });
    const calendar = projectCashCalendar(engineInput, 5, 0n as Cents, feedFor(engineInput));

    expect(calendar.breaches_reserve_floor).toBe(false);
    expect(calendar.first_breach_date).toBeNull();
  });

  it('reports the EARLIEST date a recurring minimum occurs', () => {
    const engineInput = input('2026-02-06');
    const calendar = projectCashCalendar(engineInput, 5, 0n as Cents, feedFor(engineInput));

    // Nothing moves after day 1, so days 1-5 all hold the minimum.
    expect(calendar.minimum_cents).toBe(-422200n);
    expect(calendar.minimum_date).toBe('2026-02-06');
  });
});
```

- [ ] **Step 2: Run it to make sure it fails or passes**

Run: `cd packages/engine && npx vitest run tests/cash.test.ts`
Expected: PASS — Task 2 built this. If any test fails, the summarise() logic is wrong; fix it rather than the test.

- [ ] **Step 3: Export from index.ts**

```typescript
export { projectCashCalendar, cashFlowsMissingInputs } from './cash.js';
```

Place it immediately after the `harvest.js` export block. Do not add anything to `computeDecision()`.

- [ ] **Step 4: Run the full suite, lint, typecheck and build**

Run, from the repo root:
```bash
npm test
npm run test:golden
npm run lint
npm run typecheck
npm run build
```
Expected: all pass. `test:golden` must still report **11 written / 11 passing / 1 held** — this task adds no fixture and must not change that line.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/index.ts packages/engine/tests/cash.test.ts
git commit -m "feat(engine): reserve floor reported not applied; export M5a"
```

---

### Task 7: Context write-back

**Files:**
- Modify: `context/progress-tracker.md`
- Modify: `context/current-issues.md`
- Modify: `context/architecture.md`

- [ ] **Step 1: Write the edits to a script file**

Per `ai-workflow-rules.md`: edit `context/*.md` through a `.mjs` in the scratchpad, replace with a **function** so `$&` stays literal, assert every anchor matched, and read the diff before committing. Record:

- **A new AD** — the cash calendar is its own module, `cash.ts`, not inside `allocation.ts` as the architecture's file map says. Reason: independently testable, independently valuable (the project overview lists it as its own deliverable), and M5b projects it ~8,401 times per run, so keeping it separate leaves `allocation.ts` about enumeration and ranking. Update the file map in `architecture.md` in the same pass.
- **A new AD** — `throughDay` has no default, because AD-43 makes 90 days a display horizon while candidates are scored over their own completion horizon, and a default would let the wrong window be inherited silently.
- **OQ-19** — when does Daniel actually pay labour and electricity? Assumed at placement; almost certainly monthly in reality, which would flatten the early-cycle trough. Blocks nothing; changes a minimum balance.
- **The tracker's Current Phase and Completed** sections, naming M5a done and M5b next.

- [ ] **Step 2: Run it and read the diff**

```bash
node "$SCRATCHPAD/m5a-ctx.mjs"
git diff context/
```
Expected: every anchor matched, no mangled rows. Check table rows end with the right number of pipes — a substring anchor can split a row's trailing cell.

- [ ] **Step 3: Commit**

```bash
git add context/
git commit -m "docs: M5a cash calendar — its own module, assumed overhead timing (OQ-19)"
```

---

## Self-Review

**1. Spec coverage.** This plan covers the spec's scoring *substrate* only, and deliberately not the enumeration. Mapped: AD-43's reserve-floor-as-filter (Task 6 reports, never applies), AD-43's per-candidate horizon (`throughDay`, no default, Tasks 1–2), AD-45's one-projection-per-candidate (a pure function taking pre-computed `FeedLiability`, Task 3), and the spec's blocked/buildable split (Task 4). **Not covered here, by design, and what M5b owns:** AD-40's date range, AD-41's step / `place_nothing` / single-placement, AD-42's three-modes-no-Auto, AD-43's three scalars, AD-44's tie-break and `tied_candidates`, AD-45's `enumerateCandidates()`. Every one of those needs this module to exist first.

**2. Placeholder scan.** No TBDs, no "add error handling", no "similar to Task N". Every code step carries real code; every test step carries real assertions with numbers derived from the client's own figures ($3,000 chicks, $1,222 overheads, 26.64-bag draws).

**3. Type consistency.** `projectCashCalendar` is introduced in Task 2 with three parameters and gains a fourth (`feed: FeedLiability`) in Task 3 — Task 3's interface block states this explicitly, and its test file updates every call site. `cashFlowsMissingInputs` keeps one signature throughout. `CashFlow.amount_cents` is signed everywhere (negative for outflows), and every test that totals outflows negates it rather than adding. `MissingInputKey` already contains `'abattoir_fee'` and `'transport_cents_per_bird'`; no new key is needed.

**One honest gap, flagged rather than papered over:** Task 3's `feedFor()` helper recomputes `FeedLiability` per test, which is fine for tests but is exactly what M5b must *not* do per candidate. M5b's plan must hoist it.
