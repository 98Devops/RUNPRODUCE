# RunProduce - Session State
Last updated: 2026-09-14 · Branch: `u5-m5b-allocation-enumeration`

## What this is
A decision console for Daniel, a broiler farmer, that turns his daily batch records into feed, cost, cash and harvest figures. Its headline job is telling him how many birds to place next and when, under three named strategies.

## Architecture, one paragraph
npm monorepo: a pure TypeScript engine (`packages/engine`) behind a Next.js app on Netlify, with Supabase for storage (U6, not built). The engine has no I/O, no `Date.now()`, and `asOf` is always a parameter. Money is `bigint` cents and weight is integer grams. An unknown value returns a typed `MissingInput`, never a guess. Golden fixtures are the client contract, and changing one needs an AD. Full detail: `architecture.md`.

## Completed
- **U1** Scaffold: monorepo, money, breed-curve seed, types, golden runner, CI.
- **U2** M1 production + M2 costing. Fixtures 1-4, 12, 13.
- **U3** M3 feed liability. Fixtures 5, 9.
- **U4** M4 harvest optimiser + pre-merge review wave. Fixtures 7, 10, 11.
- **U5 M5a** Cash calendar (`cash.ts`), standalone and not wired into `computeDecision`.
- **U5 M5b Tasks 1-8** Allocation enumeration, scoring, tie-break, place-nothing, `computeAllocation`.
- **Daniel's six answers** wired as AD-52 to AD-57. Band refusal made consistent (AD-58).
- **Status:** 332 unit tests. Golden 11 written / 11 passing / 1 held. Lint, typecheck, build clean.

## In progress
Nothing. Between units: M5b is built as far as it can go, pushed, and unmerged (30 commits ahead of `main`).

## Blockers
| Blocker | Blocks | Who resolves |
|---|---|---|
| OQ-25: engine holds no opening cash balance | M5b Task 9, wiring `decision.allocation` (getter throws) | Us, via U6 |
| OQ-26: Cover Fast can't answer structurally (candidates have no forecast sales) | 1 of 3 modes | Us, via M6 |
| OQ-29: `computeAllocation` takes 20.8 s at 5k birds, ~2 min at 30k | **U9, hard.** Needs a design answer, not "consider performance" | Us: profile first |
| OQ-8: fixture 6 chick price ($0.85 vs $1.00) | Golden completeness hold | Daniel |
| OQ-10: fixture 8 was blocked on OQ-2, now answered | Golden completeness hold | Us: attempt it |
| OQ-17: dressing yield ~62% is unmeasured | Accuracy of the bulk harvest day (0.8 pt from flipping) | Daniel (~20 paired weights) |
| OQ-21 (client half): part-bag draw rounding | Pricing a part-bag draw; refused today | Daniel |
| OQ-15 / OQ-19: labour and electricity scaling; overhead payment dates assumed | Accuracy at 30k birds; overhead cash dates | Daniel |
| Not built: revenue, profit, margin, break-even (M6) | Any answer Daniel can act on | Us |

## Load-bearing decisions
- **AD-29:** unbuilt modules are getters that throw `NotImplementedError`, and the golden runner holds them rather than failing.
- **AD-31:** the 14-day inter-batch gap is a hard constraint on enumeration.
- **AD-35 / AD-42:** three modes (Cover Fast, Maximum Growth as leveraged rollover, Build Reserve). No Auto mode.
- **AD-43:** three integer scalars. The reserve floor filters candidates and is never folded into a score.
- **AD-44:** tie-break is earliest date, then smaller size, with ties reported.
- **AD-52:** feed is priced per bag ($30.60 / $29.60 / $28.60). Fixture 1 is $7,698.06.
- **AD-53:** placement step is 1 bird, so nothing rounds a recommendation. This is the cause of OQ-29.
- **AD-55 / AD-57:** bulk net = the buyer's own contract on the `SalesOrder` minus 10c abattoir and 10c transport.
- **AD-56:** each overhead line is paid on its own cadence. A MONTHLY line is split across months, never repeated.
- **AD-58:** past the top band, both planning and sales refuse. Bulk hold cost is blank from day 34.

Full log: `progress-tracker.md` § Architecture Decisions.

## Files a new session should read, in order
1. `context/SESSION.md` (this file).
2. `context/CONTEXT.md`: only if writing or renaming an identifier.
3. `context/current-issues.md`: only if touching a blocker above. Read that OQ's entry, not the whole file (2.2k lines).
4. `context/progress-tracker.md`: only if you need an AD's full reasoning or a unit's history. Grep `**AD-NN`.
5. `context/architecture.md` + `code-standards.md`: only if changing engine structure or starting a new module.
6. `context/plans/u5-allocation-optimiser.md`: only if resuming M5b Task 9.
7. `context/ai-workflow-rules.md` + `skills.md`: only if starting a new unit.
8. `context/ui-context.md`, `ui-build-playbook.md`, `card-system-and-decision-ux.md`: only for UI units (U7-U11). For U9, read the OQ-29 section first.

## Recommended next action
Run a pre-merge code review of this branch and merge it to `main`. It carries 30 unreviewed commits including AD-57, which was not built test-first, and the U4 review wave found eight real defects in code that already had passing tests.

## Maintaining this file
- Update at the end of every unit, and on any commit that changes state a future session needs.
- When SESSION.md disagrees with another file, whichever was updated more recently against reality wins. SESSION.md is updated per-commit; other files can go stale between updates. Fix whichever is behind.
- Keep under ~5k tokens. When it grows, move older detail to where it belongs (ADs to `progress-tracker.md`, blockers to `current-issues.md`) and leave a pointer.
