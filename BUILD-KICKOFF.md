# BUILD KICKOFF

Copy-paste prompts. Keep this file open while building.

---

## Session 1 — U1

```
/orient
```

Read what it reports. It should say: phase not started, next unit U1,
repo setup complete. If it says anything else, resolve that before
continuing.

Then:

```
Starting U1 per context/ai-workflow-rules.md.

You have read CLAUDE.md and the context files. Confirm you have also
read context/CONTEXT.md — use its vocabulary for every identifier.

U1 SCOPE (nothing else):
 - pnpm/npm monorepo: packages/engine + apps/web
 - packages/engine/src/types.ts — every domain type from
   context/architecture.md, using branded primitives (Cents as bigint,
   Grams as integer, DayNumber)
 - packages/engine/src/money.ts — Money value object with a split()
   that guarantees sum(parts) === total exactly
 - seed context/breed_curve.json into the engine as typed data
 - ESLint rule banning Date, Math.random, process.env and fetch inside
   packages/engine/src
 - packages/engine/tests/golden/ — the 13 fixtures listed in
   context/progress-tracker.md, as JSON with expected values
 - a test runner that loads each fixture, calls computeDecision(), and
   deep-equals against expected
 - computeDecision() stubbed to throw
 - GitHub Actions running vitest on push

FOLLOW THE SUPERPOWERS LOOP:
Give me the spec in readable chunks and wait for sign-off on each
before moving to the next. Then the implementation plan. I will say
"go" before you write any code.

EXPECTED END STATE:
npm run build passes. npm test shows 13 FAILING tests with clear
expected values.

Red tests are the correct outcome for U1 — they are the executable
spec. Do NOT weaken, skip, or delete a fixture to make it pass. The
fixtures encode the client's real spreadsheet output to the cent.

Do not invoke impeccable, the UI playbook, or any UI skill. There is
no UI in U1.
```

---

## Every session after that

```
/orient
```

Then:

```
Continue with [UNIT] per context/ai-workflow-rules.md.

Superpowers loop: spec in chunks, sign-off on each, then the plan,
then wait for "go".

Red/green TDD — failing test first, always. YAGNI: build only what a
golden fixture or a documented flow in project-overview.md requires.

Use context/CONTEXT.md vocabulary for all identifiers.

Before you finish: update context/progress-tracker.md (including
Session Notes detailed enough to resume cold) and
context/current-issues.md if anything new surfaced.
```


---

## Per-unit prompts

Paste after `/orient`. Each replaces the generic "Continue with [UNIT]"
block above.

### U2 — Production + costing

```
U2: implement M1 production and M2 costing per context/architecture.md.

M1 production.ts
 - opening/closing birds, mortality %, livability
 - feed consumed from OPENING birds, not closing (invariant 10 —
   the client's sheet has this wrong, KB-2)
 - growth calibration: EMA of actual/standard, alpha 0.4
 - biological FCR, including feed eaten by birds that died

M2 costing.ts
 - chick cost INCLUDES extra_chick_count (KB-1 — their sheet ignores it)
 - feed cost from ONE price source (KB-3 — their sheet has two)
 - overhead allocated by bird-days across concurrent batches
 - cost per SALEABLE bird, not per placed bird

Target: fixtures 1, 2, 3, 4, 12 green.
Sanity check: 3,000 chicks @ $1.00 placed 2026-02-06 to day 41 gives
feed cost $8,079.81, 13,224 kg, FCR 1.53.
```

### U3 — Feed liability

```
U3: implement M3 feed liability per context/architecture.md.

 - due_date = collection_date + terms_days (from COLLECTION, not
   month-end — client confirmed)
 - outstanding = total - sum(payments); never negative, never over
 - facility headroom = limit - sum(outstanding); warn at 90%
 - cashflow_days = market_date - due_date. Keep that exact name — it
   is the client's own term from his spreadsheet.
 - feed_allocations: one draw may serve two overlapping batches,
   allocated by bird-days (CR-3). Max 2 concurrent (AD-8).

Target: fixtures 5 and 9 green. Fixture 9: draws from a 2026-02-06
placement fall due Mar 8, Mar 22, Mar 29, Apr 5, Apr 12.
```

### U4 — Harvest optimiser

```
U4: implement M4 harvest optimiser per context/architecture.md.

For each day 26-42: delta_weight, feed_cost, death_cost, gate_gain.
  gate_net = gate_gain - feed_cost - death_cost
  bulk_net = -feed_cost - death_cost   (contract price is FLAT, so
                                        growth adds ZERO revenue)

Two separate outputs, because the channels have opposite rules:
 - BULK harvest day = first day weight >= 1,770 g
 - GATE window = while gate_net > 0

Band-crossing warning when a bird would drop into a lower-paying
band, with the dollar cost stated.

The mortality ramp is UNCALIBRATED (OQ-1). Everything downstream of it
carries confidence 'assumed'. Do not present MaxSafeBatchSize as fact.

Target: fixtures 7, 8, 10, 11 green.
```

### U5 — Allocation (grill first, see the gate above)

```
U5: implement M5 allocation and M6 recommendations. Hardest unit.

Enumerate gate-bird counts 0 to min(saleable, gate_capacity_per_day *
selling_window) in steps of 100. For each, run the full daily cash
projection and record days_to_cover_core_credit, min_cash,
min_cash_date, profit, can_place_next_batch, reserve_built.

Gate sales stage at gate_capacity_per_day — a RATE, not a lump. The
client moves 500-1,000/day, no more. This constraint is the whole
reason the optimiser exists.

Partial harvest: each day's sale is a slice from a single pool at that
day's projected weight; record weight-at-sale per sale. Do NOT model
sub-flocks with independent curves (AD-9, CR-1).

Return THREE named strategies, not one recommendation (AD-4):
Cover Fast, Maximum Growth, Build Reserve. Same order, same
formatting, no visual hierarchy implying a preferred answer.

If no candidate holds cash above reserve: kind:'infeasible' with the
smallest breach and ranked levers, each with its computed cash impact.
A feature, not an error path.

If abattoir_fee or transport is null: kind:'missing_input' naming what
is missing. Never estimate (OQ-2).

No solver library. Enumeration only — every rejected candidate must be
explainable.

Target: fixtures 6 and 13 green. All 13 green by end of unit.
```

### U6 — Data layer

```
U6: Supabase schema, RLS and repositories per context/architecture.md.

 - every domain table carries org_id with an RLS policy
 - facts immutable; derived values NEVER stored (invariant 3)
 - due_date as a GENERATED column
 - DB-level constraints: payments <= draw total, receipts <= order
   gross, mortality <= placed, sales <= alive, draws <= facility limit
 - repositories are the ONLY code importing the Supabase client
   (invariant 4)
 - seed with the client's real batch

Integration tests must prove the DATABASE rejects bad data, not just
the application layer.
```

### U7 — Daily capture (first UI unit)

```
U7: the daily capture screen. Read context/ui-context.md (§0 governs)
and context/card-system-and-decision-ux.md (CaptureCard section).

VISUAL_DENSITY 2. Three fields: deaths, feed kg by type, sample weight
with sample size. text-2xl inputs, 44px+ targets, one large submit,
single column max-width 480px, no navigation chrome. One-handed.

Pre-fill feed quantity from the standard curve for today's day number —
the worker confirms or corrects. Mark it visibly as a default, not as
recorded data.

localStorage draft so a dropped connection never loses the form.

Target: under 60 seconds on a phone.
Gates: /impeccable audit AND web-design-guidelines both clean.
```

### U8–U11

Same shape. Ledgers (U8), decision console (U9), scenario sliders
(U10), alerts + CSV + Netlify deploy (U11). Scope each from
`project-overview.md`. §0 governs. Both audit gates before done.

Design variations via git worktrees after U9 —
`context/ui-build-playbook.md` Phase B.

---

## Before U5 — the grilling gate

**Do not skip this.** U5 is the allocation optimiser and it rests on
assumptions that have not been tested.

```
/grill-me

Grill me on OQ-1, OQ-3 and OQ-4 in context/current-issues.md before I
build the allocation optimiser.

OQ-1 matters most: the mortality ramp (0.15%/day, +0.35%/day after day
30) was reverse-engineered from one sentence the client said. It drives
the harvest optimiser and MaxSafeBatchSize. Interrogate whether "100 a
day" is a count or a rate, at what flock size it was observed, and what
actually happened in the last three batches.

Where I cannot answer, that is a question to send the client in
writing — he has declined calls.
```

---

## Before U7 — the UI gate

```
npx impeccable install
```

Then, in session:

```
Run /impeccable init. Answer its questions from
context/project-overview.md, context/CONTEXT.md and
context/ui-context.md — especially §0 (design constraints and the
reasoning) and the operating context: a farm worker outdoors in
Zimbabwean sunlight on a low-end Android, and an owner making financial
decisions from dense tables. Two surfaces with opposite density needs.

Only ask me about genuine gaps. Everything else is already written.
```

Then the reference harvest — `context/ui-build-playbook.md` Phase A2,
with your chosen reference URLs.

---

## When a session is running long

```
Wrap up. Do not start anything new.

Write context/progress-tracker.md Session Notes with enough detail to
resume cold: what is done, what is half-done and exactly where, which
fixtures pass, any decision made and why, and the precise next action.

Leave any failing test in place as the next session's instruction.
```

---

## If a golden fixture goes red unexpectedly

```
Fixture [N] is failing and the cause is not obvious.

Do NOT change the fixture. It encodes the client's real spreadsheet
output. If it fails, the implementation is wrong.

Work the diagnosis loop: reproduce red → minimise the case →
hypothesise → instrument → fix → confirm the regression test holds.
```

---

## Context discipline — the four rules

1. **`/orient` first, every session.** Six lines, then it stops. It
   prevents the expensive failure: writing code without knowing what
   exists.
2. **One unit per session.** Do not mix engine and UI work — they need
   different context files loaded.
3. **Never load UI context during U1–U6.** No `ui-context.md`, no
   playbooks, no impeccable. There is no UI to design.
4. **Session Notes before context runs out, not after.** Three minutes
   of writing saves an hour of rebuilding.

---

## Definition of done for the MVP

| # | Check |
|---|---|
| 1 | All 13 golden fixtures pass |
| 2 | Daily capture completes in under 60s on a real phone |
| 3 | All 13 questions from the master prompt answerable in under 2 min |
| 4 | Every number expands to show its formula |
| 5 | Scenario sliders recalculate in under 200ms |
| 6 | Infeasible case returns ranked levers, not a crash or a silent bad number |
| 7 | Weight-band crossing triggers a visible warning with its dollar cost |
| 8 | Feed facility warns at 90% |
| 9 | Batch size works from 100 to 100,000 with everything scaling |
| 10 | Deployed to Netlify, seeded, usable without you present |
